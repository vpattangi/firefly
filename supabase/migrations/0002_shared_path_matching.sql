-- PackTrack 0002: match and split on a shared walking path instead of exact route overlap.
--
-- Why: with real Google walking routes, two students heading the same way often get
-- different streets from the very first corner, so "do our routes overlap?" almost never
-- matched anyone. Now a group walks along ONE member's route (the "anchor"), and every
-- other member peels off at the point on that path closest to their own destination.
-- A student joins a group only if nobody's trip gets more than ~35% longer.
--
-- Run once in the Supabase SQL editor after 0001.

alter table public.walk_groups
  add column if not exists anchor_request_id uuid references public.walk_requests (id) on delete set null;
alter table public.group_members
  add column if not exists split_fraction double precision;

-- Plan for the group's members (plus an optional prospective member) walking along p_anchor's route.
-- detour_ratio = (distance walked with group + ~street distance home from the split) / own route length.
create or replace function public.plan_with_anchor(p_group uuid, p_extra_request uuid, p_anchor uuid)
returns table (
  request_id uuid,
  user_id uuid,
  is_anchor boolean,
  frac double precision,
  split geometry,
  together_m double precision,
  alone_m double precision,
  detour_ratio double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with members as (
    select wr.id, wr.user_id, wr.route, wr.destination::geometry as dest, wr.route_distance_m as len
    from group_members gm
    join walk_requests wr on wr.id = gm.request_id
    where gm.group_id = p_group and gm.status in ('joined', 'confirmed', 'arrived')
    union
    select wr.id, wr.user_id, wr.route, wr.destination::geometry, wr.route_distance_m
    from walk_requests wr
    where wr.id = p_extra_request
  ),
  anchor as (
    select route, len from members where id = p_anchor
  ),
  nearest as (
    select m.id, m.user_id, m.len, m.dest, m.id = p_anchor as is_anchor,
           st_linelocatepoint(a.route, m.dest) as raw_f, a.route as aroute, a.len as alen
    from members m cross join anchor a
  ),
  -- Privacy buffer: nobody splits within ~100 m of their own home, and the group never walks
  -- the last 100 m of the anchor's route, so no one is walked to their door by strangers.
  located as (
    select n.*,
           least(
             case when st_distance(st_lineinterpolatepoint(n.aroute, n.raw_f)::geography, n.dest::geography) < 100
                  then greatest(n.raw_f - (100 - st_distance(st_lineinterpolatepoint(n.aroute, n.raw_f)::geography,
                                                             n.dest::geography)) / greatest(n.alen, 1), 0)
                  else n.raw_f end,
             greatest(1 - 100 / greatest(n.alen, 1), 0)
           ) as f
    from nearest n
  ),
  -- The anchor walks with the group until the last other member peels off.
  last_split as (
    select coalesce(max(f), 0) as f from located where not is_anchor
  ),
  resolved as (
    select l.*, case when l.is_anchor then ls.f else l.f end as split_f
    from located l cross join last_split ls
  )
  select
    r.id,
    r.user_id,
    r.is_anchor,
    r.split_f,
    st_lineinterpolatepoint(r.aroute, r.split_f),
    r.split_f * r.alen,
    case when r.is_anchor then (1 - r.split_f) * r.alen
         else st_distance(st_lineinterpolatepoint(r.aroute, r.split_f)::geography, r.dest::geography) end,
    -- Straight-line distance home is scaled by 1.3 to approximate walking on streets.
    case when r.is_anchor then 1.0
         else (r.split_f * r.alen
               + 1.3 * st_distance(st_lineinterpolatepoint(r.aroute, r.split_f)::geography, r.dest::geography))
              / greatest(r.len, 1) end
  from resolved r;
$$;

-- Evaluates every member (and the prospective member) as the anchor.
create or replace function public.best_plan(p_group uuid, p_extra_request uuid)
returns table (
  anchor uuid,
  max_detour double precision,
  total_together double precision,
  extra_together double precision
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_candidate uuid;
begin
  for v_candidate in
    select gm.request_id from group_members gm
    where gm.group_id = p_group and gm.status in ('joined', 'confirmed', 'arrived')
    union
    select p_extra_request where p_extra_request is not null
  loop
    return query
      select v_candidate,
             max(p.detour_ratio),
             coalesce(sum(p.together_m) filter (where not p.is_anchor), 0),
             max(p.together_m) filter (where p.request_id = p_extra_request)
      from plan_with_anchor(p_group, p_extra_request, v_candidate) p;
  end loop;
end;
$$;

-- Picks the anchor that keeps everyone's detour acceptable while maximising time walked together,
-- then stores each member's split point, order and distance walked alone.
create or replace function public.recompute_split_points(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_anchor uuid;
begin
  select b.anchor into v_anchor
  from best_plan(p_group, null) b
  order by (b.max_detour <= 1.35) desc, b.total_together desc, b.max_detour
  limit 1;

  update walk_groups set anchor_request_id = v_anchor where id = p_group;
  if v_anchor is null then
    return;
  end if;

  update group_members gm
  set split_point = p.split::geography,
      split_fraction = p.frac,
      walk_alone_m = p.alone_m,
      split_order = o.ord
  from plan_with_anchor(p_group, null, v_anchor) p
  join (
    select q.user_id, row_number() over (order by q.frac, q.is_anchor) as ord
    from plan_with_anchor(p_group, null, v_anchor) q
  ) o on o.user_id = p.user_id
  where gm.group_id = p_group and gm.user_id = p.user_id;
end;
$$;

create or replace function public.find_or_create_group(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r walk_requests;
  v_group uuid;
  v_count int;
begin
  select * into r from walk_requests
  where id = p_request_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'Walk request not found';
  end if;
  if r.status <> 'searching' then
    return r.group_id;
  end if;
  if not is_verified() then
    raise exception 'Your student ID must be verified before you can join a group';
  end if;

  -- Best forming group at the same meetup point and time where nobody's trip grows by more
  -- than 35% and the newcomer walks a meaningful stretch with the group.
  select c.group_id into v_group
  from (
    select g.id as group_id, b.max_detour, b.extra_together
    from walk_groups g
    cross join lateral (
      select * from best_plan(g.id, r.id) bp
      order by (bp.max_detour <= 1.35) desc, bp.total_together desc, bp.max_detour
      limit 1
    ) b
    where g.status = 'forming'
      and g.meetup_point_id = r.meetup_point_id
      and abs(extract(epoch from (g.depart_at - r.depart_at))) <= 15 * 60
      and not exists (select 1 from group_members x where x.group_id = g.id and x.user_id = auth.uid())
      and (select count(*) from group_members y
           where y.group_id = g.id and y.status in ('joined', 'confirmed')) between 1 and 3
  ) c
  where c.max_detour <= 1.35
    and c.extra_together >= least(150, 0.3 * r.route_distance_m)
  order by c.extra_together desc
  limit 1;

  if v_group is not null then
    -- Lock the group and re-check capacity so concurrent joins can't overfill it.
    perform 1 from walk_groups where id = v_group and status = 'forming' for update;
    if not found then
      v_group := null;
    else
      select count(*) into v_count from group_members
      where group_id = v_group and status in ('joined', 'confirmed');
      if v_count >= 4 then
        v_group := null;
      end if;
    end if;
  end if;

  if v_group is null then
    insert into walk_groups (meetup_point_id, depart_at)
    values (r.meetup_point_id, r.depart_at)
    returning id into v_group;
  end if;

  insert into group_members (group_id, user_id, request_id)
  values (v_group, auth.uid(), r.id);
  update walk_requests set status = 'grouped', group_id = v_group where id = r.id;

  perform recompute_split_points(v_group);
  return v_group;
end;
$$;

-- Same as 0001, but returns the shared path each member walks:
--   anchor → their own full route; everyone else → the anchor's route only up to their own split
--   point (so nobody learns where the anchor lives). The app fetches the solo leg home itself.
create or replace function public.get_group_details(p_group uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_result jsonb;
begin
  if not is_in_group(p_group) then
    raise exception 'You are not a member of this group';
  end if;

  select jsonb_build_object(
    'id', g.id,
    'status', g.status,
    'depart_at', g.depart_at,
    'started_at', g.started_at,
    'meetup_point', jsonb_build_object(
      'id', mp.id, 'name', mp.name, 'description', mp.description,
      'lat', st_y(mp.location::geometry), 'lng', st_x(mp.location::geometry)
    ),
    'is_anchor', anc.id is null or anc.id = me.request_id,
    'shared_route', (st_asgeojson(
      case when anc.id is null or anc.id = me.request_id then wr.route
           else st_linesubstring(anc.route, 0, greatest(coalesce(me.split_fraction, 0), 0.0001)) end
    )::jsonb) -> 'coordinates',
    'my_destination', jsonb_build_object(
      'label', wr.destination_label,
      'lat', st_y(wr.destination::geometry), 'lng', st_x(wr.destination::geometry)
    ),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', gm.user_id,
        'is_me', gm.user_id = auth.uid(),
        'first_name', p.first_name,
        -- Photos are only shared once both people confirmed this group.
        'avatar_path', case when gm.user_id = auth.uid() or shares_confirmed_group(gm.user_id)
                            then p.avatar_path end,
        'status', gm.status,
        'split_order', gm.split_order,
        'split_lat', st_y(gm.split_point::geometry),
        'split_lng', st_x(gm.split_point::geometry),
        'walk_alone_m', case when gm.user_id = auth.uid() then gm.walk_alone_m end
      ) order by gm.split_order nulls last), '[]'::jsonb)
      from group_members gm
      join profiles p on p.id = gm.user_id
      where gm.group_id = g.id and gm.status <> 'left'
    )
  )
  into v_result
  from walk_groups g
  join meetup_points mp on mp.id = g.meetup_point_id
  join group_members me on me.group_id = g.id and me.user_id = auth.uid()
  join walk_requests wr on wr.id = me.request_id
  left join walk_requests anc on anc.id = g.anchor_request_id
  where g.id = p_group;

  return v_result;
end;
$$;

-- These read every member's private route; keep them internal.
revoke execute on function public.plan_with_anchor(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.best_plan(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.recompute_split_points(uuid) from public, anon, authenticated;
