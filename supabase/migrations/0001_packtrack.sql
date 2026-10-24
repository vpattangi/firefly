-- PackTrack schema: verified students walk home together from safe meetup points.
-- Run this once in the Supabase SQL editor (or `supabase db push`).
--
-- Privacy model
--   * Only .edu emails can sign up (trigger on auth.users).
--   * Nobody can use matching until a reviewer marks their government ID verified.
--   * Destinations and routes are private to their owner. Group members only see
--     each other's first name, status and where each person peels off.
--   * Profile photos are readable only by members who have BOTH confirmed the same group.
--   * Contact info is readable only when both people chose to share with each other.
--   * All writes to walk/group tables go through the security-definer RPCs below.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Profiles and university email enforcement
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  university text,
  avatar_path text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  created_at timestamptz not null default now()
);

create table public.contact_info (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text,
  email text,
  instagram text,
  updated_at timestamptz not null default now()
);

create table public.id_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  id_front_path text not null,
  selfie_path text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create or replace function public.enforce_edu_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or lower(new.email) !~ '^[^@]+@([a-z0-9-]+\.)*[a-z0-9-]+\.edu$' then
    raise exception 'A university (.edu) email address is required';
  end if;
  return new;
end;
$$;

create trigger enforce_edu_email
  before insert or update of email on auth.users
  for each row execute function public.enforce_edu_email();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, university)
  values (new.id, split_part(lower(new.email), '@', 2));
  insert into public.contact_info (user_id, email) values (new.id, lower(new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Meetup points, walk requests and groups
-- ---------------------------------------------------------------------------

create table public.meetup_points (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  location geography(point, 4326) not null,
  is_staffed boolean not null default false
);

create table public.walk_groups (
  id uuid primary key default gen_random_uuid(),
  meetup_point_id uuid not null references public.meetup_points (id),
  depart_at timestamptz not null,
  status text not null default 'forming'
    check (status in ('forming', 'walking', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create table public.walk_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  meetup_point_id uuid not null references public.meetup_points (id),
  destination geography(point, 4326) not null,
  destination_label text,
  route geometry(linestring, 4326) not null,
  route_distance_m double precision not null,
  depart_at timestamptz not null,
  status text not null default 'searching'
    check (status in ('searching', 'grouped', 'cancelled', 'done')),
  group_id uuid references public.walk_groups (id),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.walk_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  request_id uuid not null references public.walk_requests (id) on delete cascade,
  status text not null default 'joined'
    check (status in ('joined', 'confirmed', 'arrived', 'left')),
  -- Where this member leaves the group and walks the rest alone.
  split_point geography(point, 4326),
  split_order int,
  walk_alone_m double precision,
  joined_at timestamptz not null default now(),
  arrived_at timestamptz,
  primary key (group_id, user_id)
);

create table public.contact_shares (
  group_id uuid not null references public.walk_groups (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user),
  check (from_user <> to_user)
);

create index walk_requests_route_idx on public.walk_requests using gist (route);
create index walk_groups_forming_idx on public.walk_groups (meetup_point_id, depart_at) where status = 'forming';
create index group_members_user_idx on public.group_members (user_id);

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer so RLS policies don't recurse)
-- ---------------------------------------------------------------------------

create or replace function public.is_in_group(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = p_group and user_id = auth.uid() and status <> 'left'
  );
$$;

-- True when the caller and p_other both confirmed the same (non-cancelled) group.
create or replace function public.shares_confirmed_group(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from group_members me
    join group_members them on them.group_id = me.group_id
    join walk_groups g on g.id = me.group_id
    where me.user_id = auth.uid()
      and them.user_id = p_other
      and me.status in ('confirmed', 'arrived')
      and them.status in ('confirmed', 'arrived')
      and g.status <> 'cancelled'
  );
$$;

create or replace function public.is_verified()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and verification_status = 'verified');
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.contact_info enable row level security;
alter table public.id_verifications enable row level security;
alter table public.meetup_points enable row level security;
alter table public.walk_groups enable row level security;
alter table public.walk_requests enable row level security;
alter table public.group_members enable row level security;
alter table public.contact_shares enable row level security;

create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Users may only edit their name and photo; verification status is reviewer-only.
revoke update on public.profiles from anon, authenticated;
grant update (first_name, avatar_path) on public.profiles to authenticated;

create policy "read own contact info" on public.contact_info
  for select to authenticated using (user_id = auth.uid());
create policy "update own contact info" on public.contact_info
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read own verifications" on public.id_verifications
  for select to authenticated using (user_id = auth.uid());

create policy "read meetup points" on public.meetup_points
  for select to authenticated using (true);

create policy "read own walk requests" on public.walk_requests
  for select to authenticated using (user_id = auth.uid());

create policy "members read their groups" on public.walk_groups
  for select to authenticated using (public.is_in_group(id));

create policy "members read group membership" on public.group_members
  for select to authenticated using (public.is_in_group(group_id));

create policy "read shares involving me" on public.contact_shares
  for select to authenticated using (from_user = auth.uid() or to_user = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: private buckets for avatars and ID documents
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false), ('id-documents', 'id-documents', false)
on conflict (id) do nothing;

create policy "upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "replace own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read own or confirmed group avatars" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.shares_confirmed_group(((storage.foldername(name))[1])::uuid)
    )
  );

-- ID documents can be uploaded by their owner but are only readable by reviewers
-- (service role / dashboard), never by other users or the uploader's client.
create policy "upload own id documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'id-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Split points: everyone stays with the group as long as at least one other
-- member's route still runs alongside theirs, then peels off.
-- ---------------------------------------------------------------------------

create or replace function public.recompute_split_points(p_group uuid)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  with members as (
    select gm.user_id, wr.route
    from group_members gm
    join walk_requests wr on wr.id = gm.request_id
    where gm.group_id = p_group and gm.status in ('joined', 'confirmed', 'arrived')
  ),
  pts as (
    select
      m.user_id,
      m.route,
      dp.path[1] as idx,
      dp.geom,
      exists (
        select 1 from members o
        where o.user_id <> m.user_id
          and st_dwithin(dp.geom::geography, o.route::geography, 40)
      ) as shared
    from members m,
    lateral st_dumppoints(st_segmentize(m.route::geography, 15)::geometry) dp
  ),
  first_alone as (
    select user_id,
           min(idx) filter (where not shared) as alone_idx,
           max(idx) as last_idx
    from pts
    group by user_id
  ),
  splits as (
    select p.user_id, p.route, p.geom
    from pts p
    join first_alone f using (user_id)
    where p.idx = greatest(coalesce(f.alone_idx, f.last_idx + 1) - 1, 1)
  ),
  measured as (
    select
      user_id,
      geom,
      st_length(st_linesubstring(route, st_linelocatepoint(route, geom), 1)::geography) as alone_m,
      st_linelocatepoint(route, geom) * st_length(route::geography) as along_m
    from splits
  )
  update group_members gm
  set split_point = m.geom::geography,
      walk_alone_m = m.alone_m,
      split_order = r.ord
  from measured m
  join (select user_id, row_number() over (order by along_m) as ord from measured) r using (user_id)
  where gm.group_id = p_group and gm.user_id = m.user_id;
$$;

-- ---------------------------------------------------------------------------
-- RPCs used by the app
-- ---------------------------------------------------------------------------

create or replace function public.list_meetup_points()
returns table (id uuid, name text, description text, is_staffed boolean, lat double precision, lng double precision)
language sql
stable
set search_path = public, extensions
as $$
  select id, name, description, is_staffed, st_y(location::geometry), st_x(location::geometry)
  from meetup_points
  order by name;
$$;

create or replace function public.submit_id_verification(p_id_front_path text, p_selfie_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if split_part(p_id_front_path, '/', 1) <> auth.uid()::text
     or split_part(p_selfie_path, '/', 1) <> auth.uid()::text then
    raise exception 'Documents must be uploaded to your own folder';
  end if;
  insert into id_verifications (user_id, id_front_path, selfie_path)
  values (auth.uid(), p_id_front_path, p_selfie_path);
  update profiles set verification_status = 'pending'
  where id = auth.uid() and verification_status <> 'verified';
end;
$$;

-- p_route is a GeoJSON coordinate array: [[lng, lat], ...] from Google Directions.
create or replace function public.create_walk_request(
  p_meetup_point_id uuid,
  p_dest_lat double precision,
  p_dest_lng double precision,
  p_dest_label text,
  p_route jsonb,
  p_depart_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_route geometry;
  v_id uuid;
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

  v_route := st_setsrid(st_geomfromgeojson(jsonb_build_object('type', 'LineString', 'coordinates', p_route)), 4326);

  update walk_requests set status = 'cancelled'
  where user_id = auth.uid() and status = 'searching';

  insert into walk_requests (user_id, meetup_point_id, destination, destination_label, route, route_distance_m, depart_at)
  values (
    auth.uid(),
    p_meetup_point_id,
    st_setsrid(st_makepoint(p_dest_lng, p_dest_lat), 4326)::geography,
    p_dest_label,
    v_route,
    st_length(v_route::geography),
    p_depart_at
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Joins the forming group at the same meetup point whose members' routes overlap
-- the most with this request, or starts a new group if none overlap enough.
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
      max(st_length(st_intersection(r.route, st_buffer(o.route::geography, 40)::geometry)::geography)) as shared_m
    from walk_groups g
    join group_members gm on gm.group_id = g.id and gm.status in ('joined', 'confirmed')
    join walk_requests o on o.id = gm.request_id
    where g.status = 'forming'
      and g.meetup_point_id = r.meetup_point_id
      and abs(extract(epoch from (g.depart_at - r.depart_at))) <= 15 * 60
      and not exists (select 1 from group_members x where x.group_id = g.id and x.user_id = auth.uid())
    group by g.id
    having count(*) < 4
  ) c
  where c.shared_m >= least(200, 0.3 * r.route_distance_m)
  order by c.shared_m desc
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

create or replace function public.get_active_group()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select g.id
  from group_members gm
  join walk_groups g on g.id = gm.group_id
  where gm.user_id = auth.uid()
    and gm.status in ('joined', 'confirmed', 'arrived')
    and g.status in ('forming', 'walking')
  order by g.created_at desc
  limit 1;
$$;

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
    'my_route', (st_asgeojson(wr.route)::jsonb) -> 'coordinates',
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
  where g.id = p_group;

  return v_result;
end;
$$;

-- "I agree to walk with this group" — also unlocks profile photo sharing.
create or replace function public.confirm_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update group_members gm set status = 'confirmed'
  from walk_groups g
  where g.id = gm.group_id and gm.group_id = p_group and gm.user_id = auth.uid()
    and gm.status = 'joined' and g.status = 'forming';
  if not found then
    raise exception 'Unable to confirm this group';
  end if;
end;
$$;

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
  perform recompute_split_points(p_group);
end;
$$;

create or replace function public.leave_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update group_members set status = 'left'
  where group_id = p_group and user_id = auth.uid() and status in ('joined', 'confirmed');
  update walk_requests set status = 'cancelled'
  where group_id = p_group and user_id = auth.uid() and status = 'grouped';

  if not exists (
    select 1 from group_members where group_id = p_group and status in ('joined', 'confirmed')
  ) then
    update walk_groups
    set status = case when exists (select 1 from group_members where group_id = p_group and status = 'arrived')
                      then 'completed' else 'cancelled' end,
        ended_at = now()
    where id = p_group and status in ('forming', 'walking');
  else
    perform recompute_split_points(p_group);
  end if;
end;
$$;

create or replace function public.mark_arrived(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update group_members gm set status = 'arrived', arrived_at = now()
  from walk_groups g
  where g.id = gm.group_id and gm.group_id = p_group and gm.user_id = auth.uid()
    and gm.status = 'confirmed' and g.status = 'walking';
  if not found then
    raise exception 'You can only check in during an active walk';
  end if;
  update walk_requests set status = 'done' where group_id = p_group and user_id = auth.uid();

  if not exists (select 1 from group_members where group_id = p_group and status = 'confirmed') then
    update walk_groups set status = 'completed', ended_at = now() where id = p_group;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mutual contact sharing after a walk
-- ---------------------------------------------------------------------------

create or replace function public.set_contact_share(p_group uuid, p_to_user uuid, p_share boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from group_members me
    join group_members them on them.group_id = me.group_id
    join walk_groups g on g.id = me.group_id
    where me.group_id = p_group
      and me.user_id = auth.uid() and them.user_id = p_to_user
      and me.status = 'arrived' and them.status = 'arrived'
      and g.status = 'completed'
  ) then
    raise exception 'You can only share contact info with someone you finished a walk with';
  end if;

  if p_share then
    insert into contact_shares (group_id, from_user, to_user)
    values (p_group, auth.uid(), p_to_user)
    on conflict (from_user, to_user) do nothing;
  else
    delete from contact_shares where from_user = auth.uid() and to_user = p_to_user;
  end if;
end;
$$;

-- Contact details are only returned when both people opted in.
create or replace function public.get_share_status(p_group uuid)
returns table (
  user_id uuid,
  first_name text,
  avatar_path text,
  i_shared boolean,
  mutual boolean,
  phone text,
  email text,
  instagram text
)
language sql
stable
security definer
set search_path = public
as $$
  with others as (
    select gm.user_id
    from group_members gm
    where gm.group_id = p_group and gm.user_id <> auth.uid() and gm.status = 'arrived'
      and is_in_group(p_group)
  ),
  flags as (
    select
      o.user_id,
      exists (select 1 from contact_shares s where s.from_user = auth.uid() and s.to_user = o.user_id) as i_shared,
      exists (select 1 from contact_shares s where s.from_user = o.user_id and s.to_user = auth.uid()) as they_shared
    from others o
  )
  select
    f.user_id,
    p.first_name,
    case when shares_confirmed_group(f.user_id) then p.avatar_path end,
    f.i_shared,
    f.i_shared and f.they_shared,
    case when f.i_shared and f.they_shared then c.phone end,
    case when f.i_shared and f.they_shared then c.email end,
    case when f.i_shared and f.they_shared then c.instagram end
  from flags f
  join profiles p on p.id = f.user_id
  left join contact_info c on c.user_id = f.user_id;
$$;

create or replace function public.get_mutual_contacts()
returns table (
  user_id uuid,
  first_name text,
  avatar_path text,
  phone text,
  email text,
  instagram text,
  connected_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.first_name, p.avatar_path, c.phone, c.email, c.instagram,
         greatest(mine.created_at, theirs.created_at)
  from contact_shares mine
  join contact_shares theirs on theirs.from_user = mine.to_user and theirs.to_user = mine.from_user
  join profiles p on p.id = mine.to_user
  left join contact_info c on c.user_id = mine.to_user
  where mine.from_user = auth.uid()
  order by 7 desc;
$$;

-- ---------------------------------------------------------------------------
-- Reviewer-only: approve or reject a student's ID. Run from the SQL editor.
--   select public.review_id_verification('student@sjsu.edu', true);
-- ---------------------------------------------------------------------------

create or replace function public.review_id_verification(p_email text, p_approved boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_status text := case when p_approved then 'verified' else 'rejected' end;
begin
  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'No user with email %', p_email;
  end if;
  update id_verifications set status = v_status, reviewed_at = now()
  where user_id = v_user and status = 'pending';
  update profiles set verification_status = v_status where id = v_user;
end;
$$;

-- Lock down functions: internal helpers and the reviewer function are not callable from the app.
revoke execute on function public.review_id_verification(text, boolean) from public, anon, authenticated;
revoke execute on function public.recompute_split_points(uuid) from public, anon, authenticated;
revoke execute on function public.enforce_edu_email() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: live group status and private per-group location broadcast
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.walk_groups, public.group_members;

create policy "group members receive group broadcasts" on realtime.messages
  for select to authenticated
  using (
    realtime.topic() like 'group:%'
    and public.is_in_group(substring(realtime.topic() from 7)::uuid)
  );

create policy "group members send group broadcasts" on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() like 'group:%'
    and public.is_in_group(substring(realtime.topic() from 7)::uuid)
  );

-- ---------------------------------------------------------------------------
-- Seed: SJSU meetup points (coordinates approximate — verify on a map)
-- ---------------------------------------------------------------------------

insert into public.meetup_points (name, description, location, is_staffed) values
  ('King Library entrance', 'Dr. Martin Luther King Jr. Library, 4th St side — well lit, staffed until late',
    st_setsrid(st_makepoint(-121.88502, 37.33553), 4326)::geography, true),
  ('Student Union', 'Main entrance facing the 7th St Plaza',
    st_setsrid(st_makepoint(-121.88120, 37.33525), 4326)::geography, true),
  ('Engineering Building', 'Front steps on San Fernando St',
    st_setsrid(st_makepoint(-121.88180, 37.33711), 4326)::geography, false),
  ('Spartan Recreation & Aquatic Center', 'SRAC main entrance',
    st_setsrid(st_makepoint(-121.87960, 37.33440), 4326)::geography, true),
  ('University Police Department', 'UPD lobby by the 7th St Garage',
    st_setsrid(st_makepoint(-121.88050, 37.33290), 4326)::geography, true);
