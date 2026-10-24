-- Incident reporting, merging, privacy and rerouting. Run after 00_supabase_stubs.sql, 0001, 0002 and 0003:
--   psql -f supabase/tests/00_supabase_stubs.sql -f supabase/migrations/0001_packtrack.sql \
--        -f supabase/migrations/0002_incidents.sql -f supabase/tests/incidents.sql
\set ON_ERROR_STOP on
\pset footer off

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@sjsu.edu'),
  ('00000000-0000-0000-0000-0000000000b2', 'ben@sjsu.edu'),
  ('00000000-0000-0000-0000-0000000000c3', 'cy@sjsu.edu'),
  ('00000000-0000-0000-0000-0000000000d4', 'staff@sjsu.edu');
update public.profiles p set first_name = initcap(split_part(u.email, '@', 1)) from auth.users u where u.id = p.id;
select public.review_id_verification(e, true) from unnest(array['ana@sjsu.edu', 'ben@sjsu.edu', 'staff@sjsu.edu']) e;
insert into public.safety_admins values ('00000000-0000-0000-0000-0000000000d4');

set role authenticated;

-- Unverified Cy cannot report.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  perform public.submit_incident('broken_lighting', 'x', 'x', 'medium', null, null, null, true, 37.3350, -121.8800, 'x', null);
  raise exception 'FAIL: unverified user reported';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: unverified reporter blocked (%)', sqlerrm;
end $$;

-- Ana reports a broken light; Ben reports the same light 20 m away -> one incident, 2 reporters, severity grows.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ declare r jsonb; begin
  r := public.submit_incident('broken_lighting', 'Streetlight out', 'Light out on the paseo', 'medium',
                               'Student Union', 'FD&O', 'sim-1', true, 37.33500, -121.88000, 'the light by the SU is out',
                               '00000000-0000-0000-0000-0000000000a1/p1.jpg');
  if (r ->> 'merged')::boolean then raise exception 'FAIL: first report merged'; end if;
  raise notice 'PASS: first report created radius %', r -> 'incident' ->> 'radius_m';
end $$;

-- Ana cannot attach a photo from someone else's folder.
do $$ begin
  perform public.submit_incident('blocked_path', 'x', 'x', 'low', null, null, null, true, 37.3360, -121.8810, 'x',
                                 '00000000-0000-0000-0000-0000000000b2/p.jpg');
  raise exception 'FAIL: foreign photo path accepted';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: foreign photo path rejected';
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ declare r jsonb; begin
  r := public.submit_incident('broken_lighting', 'Dark path', 'Dark', 'high', null, null, 'sim-2', true,
                               37.33515, -121.88010, 'super dark here', null);
  if not (r ->> 'merged')::boolean then raise exception 'FAIL: nearby duplicate not merged'; end if;
  if (r -> 'incident' ->> 'reports_count')::int <> 2 then raise exception 'FAIL: reporters %', r -> 'incident' ->> 'reports_count'; end if;
  if r -> 'incident' ->> 'severity' <> 'high' then raise exception 'FAIL: severity did not grow'; end if;
  raise notice 'PASS: duplicate merged, 2 reporters, severity high';
end $$;

-- A different kind of problem at the same spot stays separate.
do $$ declare r jsonb; begin
  r := public.submit_incident('flooding', 'Flooded walkway', 'Water across the path', 'medium', null, null, null, true,
                               37.33505, -121.88005, 'flooded', null);
  if (r ->> 'merged')::boolean then raise exception 'FAIL: different category merged'; end if;
  raise notice 'PASS: different category kept separate';
end $$;

select 'ben sees active incidents' as check, count(*) as n from public.list_active_incidents();

-- Reporter identity is private: Ben sees only his own report rows; incidents have no reporter column.
select 'ben sees report rows' as check, count(*) as n from public.incident_reports;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'incidents' and column_name in ('user_id', 'reporter')) then
    raise exception 'FAIL: incidents expose a reporter column';
  end if;
  raise notice 'PASS: incidents carry no reporter identity';
end $$;

-- Students cannot resolve incidents; staff can, and resolved incidents disappear from the map.
do $$ begin
  perform public.set_incident_status((select id from public.list_active_incidents() where category = 'flooding'), 'resolved');
  raise exception 'FAIL: student resolved an incident';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: students cannot resolve';
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
select public.set_incident_status((select id from public.list_active_incidents() where category = 'flooding'), 'resolved');
select 'after staff resolved flooding' as check, count(*) as n from public.list_active_incidents();

-- Rerouting: Ana and Ben form a group; Ana's phone reroutes and saves her new route.
create temp table g2 (who text, group_id uuid);
grant all on g2 to authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into g2 select 'ana', public.find_or_create_group(public.create_walk_request(
  (select id from public.meetup_points where name = 'Student Union'), 37.3410, -121.8890, 'Ana home',
  '[[-121.8812,37.33525],[-121.8840,37.3364],[-121.8870,37.3375],[-121.8890,37.3410]]'::jsonb, now()));
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
insert into g2 select 'ben', public.find_or_create_group(public.create_walk_request(
  (select id from public.meetup_points where name = 'Student Union'), 37.3405, -121.8895, 'Ben home',
  '[[-121.8812,37.33525],[-121.8840,37.3364],[-121.8870,37.3375],[-121.8895,37.3405]]'::jsonb, now()));
do $$ begin
  if (select count(distinct group_id) from g2) <> 1 then raise exception 'FAIL: ana and ben not grouped'; end if;
end $$;

create temp table anchor_before as
  select g.anchor_request_id as a from public.walk_groups g where g.id = (select group_id from g2 limit 1);
grant all on anchor_before to authenticated;
reset role;
-- Whoever the matcher picked as anchor reroutes the shared path.
select set_config('request.jwt.claim.sub', wr.user_id::text, false)
from public.walk_groups g join public.walk_requests wr on wr.id = g.anchor_request_id
where g.id = (select group_id from g2 limit 1);
set role authenticated;
select public.update_my_route((select group_id from g2 limit 1),
  '[[-121.8812,37.33525],[-121.8825,37.3368],[-121.8870,37.3380],[-121.8890,37.3405],[-121.8890,37.3410]]'::jsonb,
  (select id from public.list_active_incidents() limit 1), 120);
do $$ begin
  if (select g.anchor_request_id from public.walk_groups g where g.id = (select group_id from g2 limit 1)) is distinct from (select a from anchor_before) then
    raise exception 'FAIL: anchor changed after reroute';
  end if;
  if (select (public.get_group_details((select group_id from g2 limit 1)) -> 'shared_route' -> 1 ->> 0)::float) <> -121.8825 then
    raise exception 'FAIL: shared route not updated';
  end if;
  raise notice 'PASS: anchor kept, shared path updated';
end $$;
-- The other member reroutes only their private solo leg: logged, route untouched.
reset role;
select set_config('request.jwt.claim.sub', gm.user_id::text, false)
from public.group_members gm join public.walk_groups g on g.id = gm.group_id
where g.id = (select group_id from g2 limit 1) and gm.request_id <> g.anchor_request_id;
set role authenticated;
select public.update_my_route((select group_id from g2 limit 1), null, (select id from public.list_active_incidents() limit 1), 40);
do $$ begin
  if (public.get_safety_overview() ->> 'reroutes_last_hour')::int <> 2 then raise exception 'FAIL: solo reroute not logged'; end if;
  raise notice 'PASS: solo-leg reroute logged without touching the route';
end $$;
select 'ana overview after reroute' as check, public.get_safety_overview() ->> 'reroutes_last_hour' as reroutes,
       public.get_safety_overview() ->> 'active_groups' as groups;

-- Cy (not in the group) cannot overwrite anyone's route.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  perform public.update_my_route((select group_id from g2 limit 1), '[[-121.88,37.33],[-121.89,37.34]]'::jsonb, null, 0);
  raise exception 'FAIL: outsider updated a route';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: outsiders cannot reroute a group';
end $$;

-- Anonymous visitors see nothing.
reset role;
set role anon;
do $$ begin
  perform public.list_active_incidents();
  raise exception 'FAIL: anon listed incidents';
exception when insufficient_privilege then
  raise notice 'PASS: anon cannot list incidents';
end $$;
reset role;
