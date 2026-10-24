\set ON_ERROR_STOP on
\pset footer off

-- Non-.edu signups must be rejected.
do $$ begin
  insert into auth.users (email) values ('someone@gmail.com');
  raise exception 'FAIL: gmail signup was allowed';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: non-edu email rejected (%)', sqlerrm;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alex@sjsu.edu'),
  ('00000000-0000-0000-0000-00000000000b', 'bea@sjsu.edu'),
  ('00000000-0000-0000-0000-00000000000c', 'cam@sjsu.edu'),
  ('00000000-0000-0000-0000-00000000000d', 'dee@sjsu.edu');

update public.profiles p set first_name = initcap(split_part(u.email, '@', 1)),
  avatar_path = p.id::text || '/avatar.jpg'
from auth.users u where u.id = p.id;
update public.contact_info set phone = '555-000-' || right(user_id::text, 1);

-- Unverified user cannot request a walk.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  perform public.create_walk_request(
    (select id from public.meetup_points where name = 'Student Union'), 37.341, -121.889, 'x',
    '[[-121.8812,37.33525],[-121.889,37.341]]'::jsonb, now());
  raise exception 'FAIL: unverified user created a request';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: unverified blocked (%)', sqlerrm;
end $$;

-- Users cannot self-verify.
do $$ begin
  update public.profiles set verification_status = 'verified' where id = auth.uid();
  raise exception 'FAIL: user self-verified';
exception when insufficient_privilege then
  raise notice 'PASS: self-verification denied';
end $$;
reset role;

select public.review_id_verification(e, true) from unnest(array['alex@sjsu.edu','bea@sjsu.edu','cam@sjsu.edu','dee@sjsu.edu']) e;

-- Alex: west then north. Bea: same first legs, then further west. Cam: east (opposite). Dee: like Alex.
create temp table g (who text, group_id uuid);
grant all on g to authenticated;
set role authenticated;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into g select 'alex', public.find_or_create_group(public.create_walk_request(
  (select id from public.meetup_points where name = 'Student Union'), 37.3410, -121.8890, 'Alex home',
  '[[-121.8812,37.33525],[-121.8840,37.3364],[-121.8870,37.3375],[-121.8890,37.3410]]'::jsonb, now()));

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into g select 'bea', public.find_or_create_group(public.create_walk_request(
  (select id from public.meetup_points where name = 'Student Union'), 37.3400, -121.8930, 'Bea home',
  '[[-121.8812,37.33525],[-121.8840,37.3364],[-121.8870,37.3375],[-121.8930,37.3400]]'::jsonb, now() + interval '5 min'));

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into g select 'cam', public.find_or_create_group(public.create_walk_request(
  (select id from public.meetup_points where name = 'Student Union'), 37.3330, -121.8750, 'Cam home',
  '[[-121.8812,37.33525],[-121.8780,37.3340],[-121.8750,37.3330]]'::jsonb, now()));

reset role;
select who, group_id from g order by who;
do $$ begin
  if (select group_id from g where who = 'alex') <> (select group_id from g where who = 'bea') then
    raise exception 'FAIL: alex and bea should share a group'; end if;
  if (select group_id from g where who = 'alex') = (select group_id from g where who = 'cam') then
    raise exception 'FAIL: cam should be in a separate group'; end if;
  raise notice 'PASS: overlapping routes grouped, opposite route separated';
end $$;

select p.first_name, gm.split_order, round(gm.walk_alone_m) as alone_m,
       round(st_y(gm.split_point::geometry)::numeric, 5) as split_lat,
       round(st_x(gm.split_point::geometry)::numeric, 5) as split_lng
from public.group_members gm join public.profiles p on p.id = gm.user_id
where gm.group_id = (select group_id from g where who = 'alex') order by gm.split_order;

set role authenticated;
-- Before confirming, Alex can't see Bea's photo, and can't read Bea's destination.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'alex sees bea photo before confirm' as check,
       (select m->>'avatar_path' from jsonb_array_elements(public.get_group_details((select group_id from g where who='alex'))->'members') m
        where m->>'first_name' <> (select first_name from public.profiles where id = auth.uid())) as avatar;
select 'alex can read others requests' as check, count(*) from public.walk_requests where user_id <> auth.uid();
select 'alex can read others contact info' as check, count(*) from public.contact_info where user_id <> auth.uid();

-- Cam (other group) cannot see Alex's group.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  perform public.get_group_details((select group_id from g where who='alex'));
  raise exception 'FAIL: outsider read group';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: outsider blocked from group details';
end $$;

-- Start requires everyone confirmed.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.confirm_group((select group_id from g where who='alex'));
do $$ begin
  perform public.start_walk((select group_id from g where who='alex'));
  raise exception 'FAIL: started before everyone confirmed';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: start blocked until all confirm (%)', sqlerrm;
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.confirm_group((select group_id from g where who='bea'));
select 'bea sees alex photo after both confirm' as check,
       public.shares_confirmed_group('00000000-0000-0000-0000-00000000000a') as shares;
select public.start_walk((select group_id from g where who='bea'));

-- Live-location channel policy: members yes, outsiders no.
set realtime.topic = 'group:x';
select set_config('realtime.topic', 'group:' || (select group_id from g where who='bea'), false);
select 'bea may use group channel' as check, count(*) = 0 as ok from realtime.messages; -- policy evaluates without error

-- Sharing is blocked until the walk completes.
do $$ begin
  perform public.set_contact_share((select group_id from g where who='bea'), '00000000-0000-0000-0000-00000000000a', true);
  raise exception 'FAIL: shared before walk completed';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: sharing blocked mid-walk';
end $$;

select public.mark_arrived((select group_id from g where who='bea'));
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.mark_arrived((select group_id from g where who='alex'));
reset role;
select 'group status after both home' as check, status from public.walk_groups where id = (select group_id from g where who='alex');
set role authenticated;

-- One-sided share reveals nothing; mutual share reveals contact.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.set_contact_share((select group_id from g where who='alex'), '00000000-0000-0000-0000-00000000000b', true);
select 'alex view after one-sided' as check, i_shared, mutual, phone from public.get_share_status((select group_id from g where who='alex'));
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select 'bea view before sharing' as check, i_shared, mutual, phone from public.get_share_status((select group_id from g where who='bea'));
select public.set_contact_share((select group_id from g where who='bea'), '00000000-0000-0000-0000-00000000000a', true);
select 'bea view after mutual' as check, i_shared, mutual, phone, email from public.get_share_status((select group_id from g where who='bea'));
select 'bea buddies' as check, first_name, phone, email from public.get_mutual_contacts();

-- Cam cannot share with Alex (never walked together).
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  perform public.set_contact_share((select group_id from g where who='alex'), '00000000-0000-0000-0000-00000000000a', true);
  raise exception 'FAIL: stranger shared';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: non-walkers cannot share';
end $$;

-- Reviewer function is not callable by app users.
do $$ begin
  perform public.review_id_verification('cam@sjsu.edu', true);
  raise exception 'FAIL: app user called reviewer function';
exception when insufficient_privilege then
  raise notice 'PASS: reviewer function locked down';
end $$;
