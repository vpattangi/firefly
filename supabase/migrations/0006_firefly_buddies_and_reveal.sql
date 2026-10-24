-- Firefly 0006: women's buddy system, smarter match scoring, and reveal-at-30-feet.
-- Run once in the Supabase SQL Editor after 0005.
--
-- 1. Gender + buddy preference
--    * profiles.gender: 'woman' | 'man' | 'nonbinary' (set through set_my_gender, not directly).
--    * walk_requests.buddy_pref:
--        'anyone'           everyone
--        'women_nonbinary'  only women and non-binary students (open to women and non-binary students)
--        'women_only'       only women (open only to students who selected Woman)
--    * Matching respects EVERY member's preference, both ways: nobody is ever placed in a group
--      with someone their own preference excludes, or whose preference excludes them.
--
-- 2. Match scoring (ported from the team's Python walking-buddy matcher, match_score.py)
--    Hard limits stay as before (same meetup point, departures within 15 min, max 4 people,
--    nobody's walk more than ~35% longer). Among groups that pass, the best one wins by a 0-100 score
--    using the Python weights: shared walk 30% (stands in for "start closeness", since everyone starts
--    at the same meetup point), destination closeness 20%, detour 30%, departure time 10%,
--    waiting-time bonus 10%.
--
-- 3. Reveal at ~30 feet
--    * Until two confirmed members are within ~30 ft (9.1 m) of each other by GPS, each only sees
--      "SJSU student", their status, the meetup point and a rounded live distance. No name, no photo.
--    * Positions are stored only for active groups, only server-side (no client can read the table),
--      and are deleted when a member leaves/arrives or the group ends.
--    * Once revealed, a member can tap "I'm here" (mark_here).
--    * Starting the walk reveals everyone in the group (they are physically walking together),
--      so a weak GPS signal can never leave a group stuck anonymous.

-- ---------------------------------------------------------------------------
-- Columns and tables
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists gender text check (gender in ('woman', 'man', 'nonbinary'));

alter table public.walk_requests
  add column if not exists buddy_pref text not null default 'anyone'
    check (buddy_pref in ('anyone', 'women_nonbinary', 'women_only'));

alter table public.group_members
  add column if not exists here_at timestamptz;

create table if not exists public.member_positions (
  group_id uuid not null references public.walk_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  location geography(point, 4326) not null,
  accuracy_m double precision,
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.member_reveals (
  group_id uuid not null references public.walk_groups (id) on delete cascade,
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  revealed_at timestamptz not null default now(),
  primary key (group_id, user_a, user_b),
  check (user_a < user_b)
);

-- Only security-definer functions below may touch these. No client can read anyone's position.
alter table public.member_positions enable row level security;
alter table public.member_reveals enable row level security;
revoke all on public.member_positions from public, anon, authenticated;
revoke all on public.member_reveals from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gender
-- ---------------------------------------------------------------------------

create or replace function public.set_my_gender(p_gender text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_gender is null or p_gender not in ('woman', 'man', 'nonbinary') then
    raise exception 'Choose Woman, Man or Non-binary';
  end if;
  -- No switching mid-match: it would change who a group was formed around.
  if exists (select 1 from walk_requests where user_id = auth.uid() and status = 'searching')
     or exists (
       select 1 from group_members gm join walk_groups g on g.id = gm.group_id
       where gm.user_id = auth.uid() and gm.status in ('joined', 'confirmed') and g.status in ('forming', 'walking')
     ) then
    raise exception 'You can change this after your current walk';
  end if;
  update profiles set gender = p_gender where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Buddy preference compatibility
-- ---------------------------------------------------------------------------

-- Does a person with p_gender satisfy preference p_pref?
create or replace function public.buddy_ok(p_pref text, p_gender text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(case p_pref
    when 'anyone' then true
    when 'women_nonbinary' then p_gender in ('woman', 'nonbinary')
    when 'women_only' then p_gender = 'woman'
    else false
  end, false);
$$;

-- Would adding p_request to p_group respect everyone's preferences, in both directions?
create or replace function public.buddies_compatible(p_group uuid, p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(bool_and(
           buddy_ok(wr.buddy_pref, newp.gender) and buddy_ok(newr.buddy_pref, p.gender)
         ), true)
  from group_members gm
  join walk_requests wr on wr.id = gm.request_id
  join profiles p on p.id = gm.user_id
  cross join walk_requests newr
  join profiles newp on newp.id = newr.user_id
  where gm.group_id = p_group
    and gm.status in ('joined', 'confirmed')
    and newr.id = p_request;
$$;

-- ---------------------------------------------------------------------------
-- Walk requests (adds the buddy preference)
-- ---------------------------------------------------------------------------

drop function if exists public.create_walk_request(uuid, double precision, double precision, text, jsonb, timestamptz);

create or replace function public.create_walk_request(
  p_meetup_point_id uuid,
  p_dest_lat double precision,
  p_dest_lng double precision,
  p_dest_label text,
  p_route jsonb,
  p_depart_at timestamptz,
  p_buddy_pref text default 'anyone'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_route geometry;
  v_id uuid;
  v_gender text;
begin
  if not is_verified() then
    raise exception 'Your student ID must be verified before you can request a walk';
  end if;
  if exists (
    select 1 from group_members gm join walk_groups g on g.id = gm.group_id
    where gm.user_id = auth.uid() and gm.status in ('joined', 'confirmed')
      and g.status in ('forming', 'walking')
  ) then
    raise exception 'You are already in an active walking group';
  end if;

  p_buddy_pref := coalesce(p_buddy_pref, 'anyone');
  if p_buddy_pref not in ('anyone', 'women_nonbinary', 'women_only') then
    raise exception 'Unknown buddy preference';
  end if;
  select gender into v_gender from profiles where id = auth.uid();
  if p_buddy_pref = 'women_only' and v_gender is distinct from 'woman' then
    raise exception 'Women-only buddies is available to students who selected Woman as their gender';
  end if;
  if p_buddy_pref = 'women_nonbinary' and coalesce(v_gender, '') not in ('woman', 'nonbinary') then
    raise exception 'Women and non-binary buddies is available to women and non-binary students';
  end if;

  v_route := st_setsrid(st_geomfromgeojson(jsonb_build_object('type', 'LineString', 'coordinates', p_route)), 4326);

  update walk_requests set status = 'cancelled'
  where user_id = auth.uid() and status = 'searching';

  insert into walk_requests (user_id, meetup_point_id, destination, destination_label, route, route_distance_m, depart_at, buddy_pref)
  values (
    auth.uid(),
    p_meetup_point_id,
    st_setsrid(st_makepoint(p_dest_lng, p_dest_lat), 4326)::geography,
    p_dest_label,
    v_route,
    st_length(v_route::geography),
    p_depart_at,
    p_buddy_pref
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Matching: same hard limits as 0002, plus buddy preferences, ranked by the Python-derived score
-- ---------------------------------------------------------------------------

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

  select c.group_id into v_group
  from (
    select
      g.id as group_id,
      b.max_detour,
      b.extra_together,
      100 * (
        -- shared walk (30%): how much of the newcomer's walk is done with the group
        0.30 * least(1, coalesce(b.extra_together, 0) / greatest(r.route_distance_m, 1))
        -- destination closeness (20%): average gap to members' destinations, 0 at a 15-min walk (1250 m)
        + 0.20 * coalesce((
            select avg(greatest(0, 1 - st_distance(wr2.destination, r.destination) / 1250))
            from group_members gm2 join walk_requests wr2 on wr2.id = gm2.request_id
            where gm2.group_id = g.id and gm2.status in ('joined', 'confirmed')
          ), 0)
        -- detour (30%): 1 with no extra walking, 0 at the 35% limit
        + 0.30 * greatest(0, 1 - (b.max_detour - 1) / 0.35)
        -- departure time (10%): 0 at the 15-minute limit
        + 0.10 * greatest(0, 1 - abs(extract(epoch from (g.depart_at - r.depart_at))) / 900)
        -- waiting bonus (10%): groups that have waited longer get filled first, maxing out at 15 min
        + 0.10 * least(1, extract(epoch from (now() - g.created_at)) / 900)
      ) as score
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
      and buddies_compatible(g.id, r.id)
  ) c
  where c.max_detour <= 1.35
    and c.extra_together >= least(150, 0.3 * r.route_distance_m)
  order by c.score desc, c.extra_together desc
  limit 1;

  if v_group is not null then
    -- Lock the group and re-check capacity and preferences so concurrent joins can't break them.
    perform 1 from walk_groups where id = v_group and status = 'forming' for update;
    if not found then
      v_group := null;
    else
      select count(*) into v_count from group_members
      where group_id = v_group and status in ('joined', 'confirmed');
      if v_count >= 4 or not buddies_compatible(v_group, r.id) then
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

-- ---------------------------------------------------------------------------
-- Reveal at ~30 feet
-- ---------------------------------------------------------------------------

-- Has p_other been revealed to me in p_group? (I'm always revealed to myself.)
create or replace function public.is_revealed_in_group(p_group uuid, p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_other = auth.uid() or exists (
    select 1 from member_reveals
    where group_id = p_group
      and user_a = least(p_other, auth.uid())
      and user_b = greatest(p_other, auth.uid())
  );
$$;

-- Has p_other been revealed to me in any group that wasn't cancelled? Used for profile photos.
create or replace function public.is_revealed_to_me(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from member_reveals mr join walk_groups g on g.id = mr.group_id
    where mr.user_a = least(p_other, auth.uid())
      and mr.user_b = greatest(p_other, auth.uid())
      and g.status <> 'cancelled'
  );
$$;

-- Called by the app every few seconds while you're in a confirmed, active group.
-- Stores your latest position and reveals you to anyone confirmed within ~30 ft (9.1 m).
create or replace function public.update_my_position(
  p_group uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_here geography;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Invalid location';
  end if;
  if not exists (
    select 1 from group_members gm join walk_groups g on g.id = gm.group_id
    where gm.group_id = p_group and gm.user_id = auth.uid()
      and gm.status = 'confirmed' and g.status in ('forming', 'walking')
  ) then
    return; -- not (or no longer) in a confirmed active group: share nothing
  end if;

  v_here := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  insert into member_positions (group_id, user_id, location, accuracy_m, updated_at)
  values (p_group, auth.uid(), v_here, p_accuracy, now())
  on conflict (group_id, user_id)
  do update set location = excluded.location, accuracy_m = excluded.accuracy_m, updated_at = now();

  insert into member_reveals (group_id, user_a, user_b)
  select p_group, least(auth.uid(), mp.user_id), greatest(auth.uid(), mp.user_id)
  from member_positions mp
  join group_members gm on gm.group_id = mp.group_id and gm.user_id = mp.user_id
  where mp.group_id = p_group
    and mp.user_id <> auth.uid()
    and gm.status = 'confirmed'
    and mp.updated_at > now() - interval '90 seconds'
    and st_distance(mp.location, v_here) <= 9.144
  on conflict do nothing;
end;
$$;

-- "I'm here": only once you've been within ~30 ft of at least one member of your group.
create or replace function public.mark_here(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from group_members gm join walk_groups g on g.id = gm.group_id
    where gm.group_id = p_group and gm.user_id = auth.uid()
      and gm.status = 'confirmed' and g.status = 'forming'
  ) then
    raise exception 'You can check in once you have confirmed this walk';
  end if;
  if not exists (
    select 1 from member_reveals
    where group_id = p_group and (user_a = auth.uid() or user_b = auth.uid())
  ) then
    raise exception 'Get within about 30 feet of your buddy to check in';
  end if;
  update group_members set here_at = coalesce(here_at, now())
  where group_id = p_group and user_id = auth.uid();
end;
$$;

-- Same as 0001's start_walk, plus: walking together reveals everyone to each other.
create or replace function public.start_walk(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active int;
  v_unconfirmed int;
begin
  if not exists (
    select 1 from group_members
    where group_id = p_group and user_id = auth.uid() and status = 'confirmed'
  ) then
    raise exception 'Confirm the group before starting the walk';
  end if;

  select count(*) filter (where status in ('joined', 'confirmed')),
         count(*) filter (where status = 'joined')
  into v_active, v_unconfirmed
  from group_members where group_id = p_group;

  if v_active < 2 then
    raise exception 'You need at least one other walker to start';
  end if;
  if v_unconfirmed > 0 then
    raise exception 'Everyone in the group must confirm before starting';
  end if;

  update walk_groups set status = 'walking', started_at = now()
  where id = p_group and status = 'forming';

  insert into member_reveals (group_id, user_a, user_b)
  select p_group, a.user_id, b.user_id
  from group_members a
  join group_members b on b.group_id = a.group_id and a.user_id < b.user_id
  where a.group_id = p_group and a.status = 'confirmed' and b.status = 'confirmed'
  on conflict do nothing;

  perform recompute_split_points(p_group);
end;
$$;

-- Same as 0002's get_group_details, but names and photos stay hidden until revealed, plus
-- reveal state, "I'm here", a rounded live distance and your buddy preference.
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
    'my_buddy_pref', wr.buddy_pref,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', gm.user_id,
        'is_me', gm.user_id = auth.uid(),
        'revealed', rv.revealed,
        'first_name', case when rv.revealed then p.first_name end,
        'avatar_path', case when rv.revealed then p.avatar_path end,
        'status', gm.status,
        'is_here', gm.here_at is not null,
        -- Rounded to 10 ft, only while both positions are fresh. Never coordinates.
        'distance_ft', case
          when gm.user_id <> auth.uid() and g.status in ('forming', 'walking')
               and mypos.updated_at > now() - interval '90 seconds'
               and op.updated_at > now() - interval '90 seconds'
          then (round(st_distance(mypos.location, op.location) * 3.28084 / 10) * 10)::int
        end,
        'split_order', gm.split_order,
        'split_lat', st_y(gm.split_point::geometry),
        'split_lng', st_x(gm.split_point::geometry),
        'walk_alone_m', case when gm.user_id = auth.uid() then gm.walk_alone_m end
      ) order by gm.split_order nulls last), '[]'::jsonb)
      from group_members gm
      join profiles p on p.id = gm.user_id
      cross join lateral (select is_revealed_in_group(g.id, gm.user_id) as revealed) rv
      left join member_positions mypos on mypos.group_id = g.id and mypos.user_id = auth.uid()
      left join member_positions op on op.group_id = g.id and op.user_id = gm.user_id
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

-- Profile photos: readable by their owner, or by someone they've been revealed to.
drop policy if exists "read own or confirmed group avatars" on storage.objects;
create policy "read own or revealed buddy avatars" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_revealed_to_me(((storage.foldername(name))[1])::uuid)
    )
  );

-- ---------------------------------------------------------------------------
-- Positions are temporary: delete them as soon as they're no longer needed
-- ---------------------------------------------------------------------------

create or replace function public.clear_positions_on_group_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('completed', 'cancelled') then
    delete from member_positions where group_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_positions_on_group_end on public.walk_groups;
create trigger clear_positions_on_group_end
  after update of status on public.walk_groups
  for each row execute function public.clear_positions_on_group_end();

create or replace function public.clear_position_on_member_exit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('left', 'arrived') then
    delete from member_positions where group_id = new.group_id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_position_on_member_exit on public.group_members;
create trigger clear_position_on_member_exit
  after update of status on public.group_members
  for each row execute function public.clear_position_on_member_exit();

-- ---------------------------------------------------------------------------
-- Permissions (same pattern as 0004: signed-in users only; internals not callable at all)
-- ---------------------------------------------------------------------------

revoke execute on function public.set_my_gender(text) from public, anon;
revoke execute on function public.create_walk_request(uuid, double precision, double precision, text, jsonb, timestamptz, text) from public, anon;
revoke execute on function public.find_or_create_group(uuid) from public, anon;
revoke execute on function public.update_my_position(uuid, double precision, double precision, double precision) from public, anon;
revoke execute on function public.mark_here(uuid) from public, anon;
revoke execute on function public.start_walk(uuid) from public, anon;
revoke execute on function public.get_group_details(uuid) from public, anon;
revoke execute on function public.is_revealed_to_me(uuid) from public, anon;

grant execute on function public.set_my_gender(text) to authenticated;
grant execute on function public.create_walk_request(uuid, double precision, double precision, text, jsonb, timestamptz, text) to authenticated;
grant execute on function public.find_or_create_group(uuid) to authenticated;
grant execute on function public.update_my_position(uuid, double precision, double precision, double precision) to authenticated;
grant execute on function public.mark_here(uuid) to authenticated;
grant execute on function public.start_walk(uuid) to authenticated;
grant execute on function public.get_group_details(uuid) to authenticated;
-- Needed by the avatar storage policy, which runs as the signed-in user.
grant execute on function public.is_revealed_to_me(uuid) to authenticated;

revoke execute on function public.buddies_compatible(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.is_revealed_in_group(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.clear_positions_on_group_end() from public, anon, authenticated;
revoke execute on function public.clear_position_on_member_exit() from public, anon, authenticated;
