-- PackTrack 0002: live incident reports, danger zones and rerouting.
-- Run once in the Supabase SQL Editor after 0001 (do not edit 0001).
--
-- Flow: a student reports a condition (photo + a few words) -> the app classifies it with EAiSER
-- (simulated until we have the EAiSER for Campuses API) -> submit_incident stores it as a public
-- incident with a temporary danger zone -> every walking app gets it over Realtime, checks its own
-- route against the zone. The group walks the anchor's route (0002), so the anchor's phone reroutes the
-- shared path -> update_my_route saves it and split points move; others reroute their own solo leg.
--
-- Privacy (adds to the rules in AGENTS.md):
--   * Incidents are public to signed-in students, but carry NO reporter identity. Who reported what
--     lives in incident_reports, which is select-own only.
--   * Report photos go to a private bucket readable only by the uploader (and reviewers/EAiSER).
--   * Routes stay private: rerouting is computed on each walker's own phone; the server only stores
--     the owner's new route and counts reroutes for the dashboard.
--   * Emergencies are NOT incidents. The app sends people to UPD / 911 first; afterwards they may add
--     a non-descriptive "safety_concern" zone (no people described, short expiry).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'broken_lighting', 'blocked_path', 'flooding', 'construction', 'fallen_tree',
    'fire_hazard', 'unsafe_conditions', 'safety_concern', 'other')),
  title text not null,
  summary text,
  severity text not null check (severity in ('low', 'medium', 'high')),
  building text,
  route_to text,
  eaiser_id text,
  eaiser_status text not null default 'submitted' check (eaiser_status in ('submitted', 'in_progress', 'resolved')),
  eaiser_simulated boolean not null default true,
  location geography(point, 4326) not null,
  radius_m double precision not null,
  reports_count int not null default 1,
  status text not null default 'active' check (status in ('active', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz
);

create table public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  description text,
  photo_path text,
  created_at timestamptz not null default now()
);

create table public.route_updates (
  id bigserial primary key,
  group_id uuid not null references public.walk_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  incident_id uuid references public.incidents (id) on delete set null,
  added_m double precision,
  created_at timestamptz not null default now()
);

-- Campus safety staff for the demo dashboard (resolve incidents). Add rows from the SQL editor:
--   insert into public.safety_admins select id from auth.users where email = 'you@sjsu.edu';
create table public.safety_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade
);

create index incidents_location_idx on public.incidents using gist (location);
create index incidents_active_idx on public.incidents (status, expires_at);
create index incident_reports_user_idx on public.incident_reports (user_id, created_at);

alter table public.incidents enable row level security;
alter table public.incident_reports enable row level security;
alter table public.route_updates enable row level security;
alter table public.safety_admins enable row level security;

-- Anyone signed in sees active incidents (needed for the map and for Realtime). No reporter column exists.
create policy "read active incidents" on public.incidents
  for select to authenticated using (status = 'active' and expires_at > now());
create policy "read own incident reports" on public.incident_reports
  for select to authenticated using (user_id = auth.uid());
-- route_updates and safety_admins: no policies (only the RPCs below touch them).

-- ---------------------------------------------------------------------------
-- Storage: private bucket for report photos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('report-photos', 'report-photos', false)
on conflict (id) do nothing;

create policy "upload own report photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'report-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read own report photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'report-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.incident_radius_m(p_category text, p_severity text)
returns double precision
language sql
immutable
as $$
  select (case p_category
            when 'fire_hazard' then 150
            when 'safety_concern' then 120
            when 'flooding' then 60
            when 'broken_lighting' then 60
            when 'construction' then 50
            when 'fallen_tree' then 40
            when 'blocked_path' then 40
            else 40 end)
         * (case p_severity when 'high' then 1.25 when 'low' then 0.8 else 1 end);
$$;

create or replace function public.incident_ttl(p_category text)
returns interval
language sql
immutable
as $$
  select case p_category
           when 'safety_concern' then interval '45 minutes'
           when 'fire_hazard' then interval '3 hours'
           when 'broken_lighting' then interval '3 days'    -- until Facilities fixes it
           when 'construction' then interval '3 days'
           else interval '12 hours' end;
$$;

create or replace function public.is_safety_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from safety_admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- RPCs used by the app
-- ---------------------------------------------------------------------------

-- Stores a classified report. Reports of the same kind within 50 m of an active incident are merged
-- (more reporters = more confidence; the zone and severity can only grow).
create or replace function public.submit_incident(
  p_category text,
  p_title text,
  p_summary text,
  p_severity text,
  p_building text,
  p_route_to text,
  p_eaiser_id text,
  p_eaiser_simulated boolean,
  p_lat double precision,
  p_lng double precision,
  p_description text,
  p_photo_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_point geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_id uuid;
  v_merged boolean := false;
  v_recent int;
  v_rank constant jsonb := '{"low":0,"medium":1,"high":2}';
begin
  if auth.uid() is null then
    raise exception 'Sign in to report';
  end if;
  if not is_verified() then
    raise exception 'Your student account must be verified before you can report';
  end if;
  if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> auth.uid()::text then
    raise exception 'Photos must be uploaded to your own folder';
  end if;
  select count(*) into v_recent from incident_reports
  where user_id = auth.uid() and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'Too many reports in the last hour. If this is an emergency, call 911.';
  end if;

  select id into v_id from incidents
  where status = 'active' and expires_at > now() and category = p_category
    and st_dwithin(location, v_point, 50)
  order by st_distance(location, v_point)
  limit 1
  for update;

  if v_id is not null then
    v_merged := true;
    insert into incident_reports (incident_id, user_id, description, photo_path)
    values (v_id, auth.uid(), p_description, p_photo_path);
    update incidents i set
      reports_count = (select count(distinct user_id) from incident_reports r where r.incident_id = i.id),
      severity = case when (v_rank ->> p_severity)::int > (v_rank ->> i.severity)::int then p_severity else i.severity end,
      radius_m = greatest(i.radius_m, incident_radius_m(p_category, p_severity)),
      expires_at = greatest(i.expires_at, now() + incident_ttl(p_category)),
      updated_at = now()
    where i.id = v_id;
  else
    insert into incidents (category, title, summary, severity, building, route_to, eaiser_id, eaiser_simulated,
                           location, radius_m, expires_at)
    values (p_category, p_title, p_summary, p_severity, p_building, p_route_to, p_eaiser_id, coalesce(p_eaiser_simulated, true),
            v_point, incident_radius_m(p_category, p_severity), now() + incident_ttl(p_category))
    returning id into v_id;
    insert into incident_reports (incident_id, user_id, description, photo_path)
    values (v_id, auth.uid(), p_description, p_photo_path);
  end if;

  return (
    select jsonb_build_object(
      'merged', v_merged,
      'incident', jsonb_build_object(
        'id', i.id, 'category', i.category, 'title', i.title, 'summary', i.summary, 'severity', i.severity,
        'building', i.building, 'route_to', i.route_to, 'eaiser_status', i.eaiser_status,
        'eaiser_simulated', i.eaiser_simulated, 'lat', st_y(i.location::geometry), 'lng', st_x(i.location::geometry),
        'radius_m', i.radius_m, 'reports_count', i.reports_count, 'created_at', i.created_at, 'updated_at', i.updated_at))
    from incidents i where i.id = v_id
  );
end;
$$;

create or replace function public.list_active_incidents()
returns table (
  id uuid, category text, title text, summary text, severity text, building text, route_to text,
  eaiser_status text, eaiser_simulated boolean, lat double precision, lng double precision,
  radius_m double precision, reports_count int, created_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select i.id, i.category, i.title, i.summary, i.severity, i.building, i.route_to, i.eaiser_status, i.eaiser_simulated,
         st_y(i.location::geometry), st_x(i.location::geometry), i.radius_m, i.reports_count, i.created_at, i.updated_at
  from incidents i
  where auth.uid() is not null and i.status = 'active' and i.expires_at > now()
  order by i.updated_at desc;
$$;

-- The caller's phone rerouted around an incident: store the caller's own new route and refresh split points.
create or replace function public.update_my_route(p_group uuid, p_route jsonb, p_incident uuid, p_added_m double precision)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_route geometry;
  v_request uuid;
  v_anchor uuid;
begin
  select gm.request_id into v_request
  from group_members gm join walk_groups g on g.id = gm.group_id
  where gm.group_id = p_group and gm.user_id = auth.uid()
    and gm.status in ('joined', 'confirmed') and g.status in ('forming', 'walking');
  if v_request is null then
    raise exception 'You are not walking in this group';
  end if;
  insert into route_updates (group_id, user_id, incident_id, added_m) values (p_group, auth.uid(), p_incident, p_added_m);
  -- A null route only logs the reroute (a non-anchor rerouting their private solo leg on their phone).
  if p_route is null then
    return;
  end if;
  v_route := st_setsrid(st_geomfromgeojson(jsonb_build_object('type', 'LineString', 'coordinates', p_route)), 4326);
  if st_npoints(v_route) < 2 then
    raise exception 'Route needs at least two points';
  end if;
  update walk_requests set route = v_route, route_distance_m = st_length(v_route::geography)
  where id = v_request and user_id = auth.uid();

  -- Keep the same anchor (don't reshuffle who leads mid-walk); just recompute everyone's split
  -- points along the anchor's (possibly new) route. With no anchor yet, run the full matcher.
  select anchor_request_id into v_anchor from walk_groups where id = p_group;
  if v_anchor is null then
    perform recompute_split_points(p_group);
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

-- Aggregate numbers only (no people, no routes) for the safety dashboard.
create or replace function public.get_safety_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'active_incidents', (select count(*) from incidents where status = 'active' and expires_at > now()),
    'reports_today', (select count(*) from incident_reports where created_at > now() - interval '24 hours'),
    'active_groups', (select count(*) from walk_groups where status in ('forming', 'walking')),
    'walking_now', (select count(*) from group_members gm join walk_groups g on g.id = gm.group_id
                    where g.status = 'walking' and gm.status = 'confirmed'),
    'reroutes_last_hour', (select count(*) from route_updates where created_at > now() - interval '1 hour'),
    'groups_rerouted_last_hour', (select count(distinct group_id) from route_updates where created_at > now() - interval '1 hour'),
    'is_admin', is_safety_admin()
  ) end;
$$;

-- Safety staff: mirror EAiSER's status (submitted -> in_progress -> resolved). Resolved removes the zone.
create or replace function public.set_incident_status(p_incident uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_safety_admin() then
    raise exception 'Only campus safety staff can change incident status';
  end if;
  if p_status not in ('submitted', 'in_progress', 'resolved') then
    raise exception 'Unknown status %', p_status;
  end if;
  update incidents set
    eaiser_status = p_status,
    status = case when p_status = 'resolved' then 'resolved' else status end,
    resolved_at = case when p_status = 'resolved' then now() else resolved_at end,
    updated_at = now()
  where id = p_incident;
end;
$$;

revoke execute on function public.incident_radius_m(text, text) from public, anon, authenticated;
revoke execute on function public.incident_ttl(text) from public, anon, authenticated;
revoke execute on function public.submit_incident(text, text, text, text, text, text, text, boolean, double precision, double precision, text, text) from public, anon;
revoke execute on function public.list_active_incidents() from public, anon;
revoke execute on function public.update_my_route(uuid, jsonb, uuid, double precision) from public, anon;
revoke execute on function public.get_safety_overview() from public, anon;
revoke execute on function public.set_incident_status(uuid, text) from public, anon;
grant execute on function public.submit_incident(text, text, text, text, text, text, text, boolean, double precision, double precision, text, text) to authenticated;
grant execute on function public.list_active_incidents() to authenticated;
grant execute on function public.update_my_route(uuid, jsonb, uuid, double precision) to authenticated;
grant execute on function public.get_safety_overview() to authenticated;
grant execute on function public.set_incident_status(uuid, text) to authenticated;

-- Realtime: every app hears about new / merged / resolved incidents (RLS above applies).
alter publication supabase_realtime add table public.incidents;
