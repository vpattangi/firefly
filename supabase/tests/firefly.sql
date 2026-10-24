-- Firefly 0006: buddy preferences, reveal at ~30 ft, "I'm here", photo privacy.
-- Run after 00_supabase_stubs.sql and every migration through 0006.
\set ON_ERROR_STOP on
\pset footer off

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'wren@sjsu.edu'),
  ('00000000-0000-0000-0000-0000000000f2', 'ola@sjsu.edu'),
  ('00000000-0000-0000-0000-0000000000f3', 'nia@sjsu.edu'),
  ('00000000-0000-0000-0000-0000000000f4', 'max@sjsu.edu'),
  ('00000000-0000-0000-0000-0000000000f5', 'zed@sjsu.edu');
update public.profiles p set first_name = initcap(split_part(u.email, '@', 1)),
  avatar_path = p.id::text || '/avatar.jpg'
from auth.users u where u.id = p.id;
select public.review_id_verification(e, true)
from unnest(array['wren@sjsu.edu','ola@sjsu.edu','nia@sjsu.edu','max@sjsu.edu','zed@sjsu.edu']) e;
insert into storage.objects (bucket_id, name)
select 'avatars', id::text || '/avatar.jpg' from public.profiles;

create temp table g (who text, group_id uuid);
grant all on g to authenticated;
set role authenticated;

-- ---------------------------------------------------------------- gender
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f4';
do $$ begin
  update public.profiles set gender = 'woman' where id = auth.uid();
  raise exception 'FAIL: gender written directly';
exception when insufficient_privilege then
  raise notice 'PASS: gender can only be set through set_my_gender';
end $$;
do $$ begin
  perform public.set_my_gender('robot');
  raise exception 'FAIL: invalid gender accepted';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: invalid gender rejected';
end $$;
select public.set_my_gender('man');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1'; select public.set_my_gender('woman');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2'; select public.set_my_gender('woman');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f3'; select public.set_my_gender('nonbinary');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f5'; select public.set_my_gender('man');

-- ---------------------------------------------------------------- who can pick which option
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f4';
do $$ begin
  perform public.create_walk_request((select id from public.meetup_points where name = 'Student Union'),
    37.3410, -121.8890, 'x', '[[-121.8812,37.33525],[-121.8840,37.3364],[-121.8870,37.3375],[-121.8890,37.3410]]'::jsonb,
    now(), 'women_only');
  raise exception 'FAIL: man picked women only';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: women only blocked for men (%)', sqlerrm;
end $$;
do $$ begin
  perform public.create_walk_request((select id from public.meetup_points where name = 'Student Union'),
    37.3410, -121.8890, 'x', '[[-121.8812,37.33525],[-121.8840,37.3364],[-121.8870,37.3375],[-121.8890,37.3410]]'::jsonb,
    now(), 'women_nonbinary');
  raise exception 'FAIL: man picked women and non-binary';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: women and non-binary blocked for men';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f3';
do $$ begin
  perform public.create_walk_request((select id from public.meetup_points where name = 'Student Union'),
    37.3410, -121.8890, 'x', '[[-121.8812,37.33525],[-121.8840,37.3364],[-121.8870,37.3375],[-121.8890,37.3410]]'::jsonb,
    now(), 'women_only');
  raise exception 'FAIL: non-binary picked women only';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: women only blocked for non-binary students';
end $$;

-- ---------------------------------------------------------------- matching respects everyone
-- Everyone heads the same way from the Student Union, so only preferences can keep them apart.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';   -- Wren, woman, women only
insert into g select 'wren', public.find_or_create_group(public.create_walk_request(
  (select id from public.meetup_points where name = 'Student Union'), 37.3410, -121.8890, 'Wren home',
  '[[-121.8812,37.33525],[-121.8840,37.3364],[-121.8870,37.3375],[-121.8890,37.3410]]'::jsonb, now(), 'women_only'));

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f4';   -- Max, man, anyone
insert into g select 'max', public.find_or_create_group(public.create_walk_request(
  (select id from public.meetup_points where name = 'Student Union'), 37.3405, -121.8895, 'Max home',
  '[[-121.8812,37.33525],[-121.8840,37.3364],[-121.8870,37.3375],[-121.8895,37.3405]]'::jsonb, now(), 'anyone'));

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f3';   -- Nia, non-binary, women + non-binary
insert into g select 'nia', public.find_or_create_group(public.create_walk_request(
  (select id from public.meetup_points where name = 'Student Union'), 37.3400, -121.8900, 'Nia home',
  '[[-121.8812,37.33525],[-121.8840,37.3364],[-121.8870,37.3375],[-121.8900,37.3400]]'::jsonb, now(), 'women_nonbinary'));

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';   -- Ola, woman, women only
insert into g select 'ola', public.find_or_create_group(public.create_walk_request(
  (select id from public.meetup_points where name = 'Student Union'), 37.3400, -121.8930, 'Ola home',
  '[[-121.8812,37.33525],[-121.8840,37.3364],[-121.8870,37.3375],[-121.8930,37.3400]]'::jsonb, now(), 'women_only'));

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f5';   -- Zed, man, anyone
insert into g select 'zed', public.find_or_create_group(public.create_walk_request(
  (select id from public.meetup_points where name = 'Student Union'), 37.3410, -121.8885, 'Zed home',
  '[[-121.8812,37.33525],[-121.8840,37.3364],[-121.8870,37.3375],[-121.8885,37.3410]]'::jsonb, now(), 'anyone'));

reset role;
select who, group_id from g order by group_id, who;
do $$ begin
  if (select group_id from g where who = 'wren') = (select group_id from g where who = 'max') then
    raise exception 'FAIL: man grouped with a women-only walker'; end if;
  if (select group_id from g where who = 'wren') = (select group_id from g where who = 'nia') then
    raise exception 'FAIL: non-binary student grouped with a women-only walker'; end if;
  if (select group_id from g where who = 'nia') = (select group_id from g where who = 'max') then
    raise exception 'FAIL: man grouped with a women + non-binary walker'; end if;
  if (select group_id from g where who = 'wren') <> (select group_id from g where who = 'ola') then
    raise exception 'FAIL: two women-only women heading the same way were not grouped'; end if;
  if (select group_id from g where who = 'max') <> (select group_id from g where who = 'zed') then
    raise exception 'FAIL: two open men heading the same way were not grouped'; end if;
  -- Generic check: in every group, every member satisfies every other member's preference.
  if exists (
    select 1 from public.group_members a
    join public.group_members b on b.group_id = a.group_id and b.user_id <> a.user_id
    join public.walk_requests ra on ra.id = a.request_id
    join public.profiles pb on pb.id = b.user_id
    where not public.buddy_ok(ra.buddy_pref, pb.gender)
  ) then raise exception 'FAIL: some group breaks a buddy preference'; end if;
  raise notice 'PASS: groups respect everyone''s buddy preferences';
end $$;

-- ---------------------------------------------------------------- reveal at ~30 ft
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$ declare m jsonb; begin
  select x into m from jsonb_array_elements(public.get_group_details((select group_id from g where who = 'wren'))->'members') x
  where x->>'user_id' = '00000000-0000-0000-0000-0000000000f2';
  if m->>'first_name' is not null or m->>'avatar_path' is not null or (m->>'revealed')::boolean then
    raise exception 'FAIL: buddy details visible before meeting: %', m; end if;
  raise notice 'PASS: buddy is anonymous before meeting';
end $$;

-- Positions are ignored until you confirm.
select public.update_my_position((select group_id from g where who = 'wren'), 37.33525, -121.8812, 5);
reset role;
do $$ begin
  if exists (select 1 from public.member_positions where user_id = '00000000-0000-0000-0000-0000000000f1') then
    raise exception 'FAIL: unconfirmed member position stored'; end if;
  raise notice 'PASS: no location stored before confirming';
end $$;
set role authenticated;

select public.confirm_group((select group_id from g where who = 'wren'));
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
select public.confirm_group((select group_id from g where who = 'ola'));

-- "I'm here" before meeting is refused.
do $$ begin
  perform public.mark_here((select group_id from g where who = 'ola'));
  raise exception 'FAIL: checked in before getting close';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: I''m here locked until within 30 ft (%)', sqlerrm;
end $$;

-- Wren at the meetup point, Ola ~50 m (~165 ft) away: still anonymous, but a distance shows.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select public.update_my_position((select group_id from g where who = 'wren'), 37.33525, -121.8812, 5);
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
select public.update_my_position((select group_id from g where who = 'ola'), 37.33570, -121.8812, 5);
do $$ declare m jsonb; begin
  select x into m from jsonb_array_elements(public.get_group_details((select group_id from g where who = 'ola'))->'members') x
  where x->>'user_id' = '00000000-0000-0000-0000-0000000000f1';
  if (m->>'revealed')::boolean or m->>'first_name' is not null then
    raise exception 'FAIL: revealed at ~165 ft: %', m; end if;
  if (m->>'distance_ft')::int not between 140 and 190 then
    raise exception 'FAIL: expected ~165 ft distance, got %', m->>'distance_ft'; end if;
  raise notice 'PASS: at % ft the buddy is still anonymous', m->>'distance_ft';
end $$;

-- Photo storage follows the reveal too.
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'avatars' and name like '00000000-0000-0000-0000-0000000000f1/%') <> 0 then
    raise exception 'FAIL: photo readable before reveal'; end if;
  raise notice 'PASS: photo hidden before reveal';
end $$;

-- Ola walks up to ~5 m (~16 ft): both are revealed.
select public.update_my_position((select group_id from g where who = 'ola'), 37.335295, -121.8812, 5);
do $$ declare m jsonb; begin
  select x into m from jsonb_array_elements(public.get_group_details((select group_id from g where who = 'ola'))->'members') x
  where x->>'user_id' = '00000000-0000-0000-0000-0000000000f1';
  if not (m->>'revealed')::boolean or m->>'first_name' <> 'Wren' then
    raise exception 'FAIL: not revealed within 30 ft: %', m; end if;
  if (select count(*) from storage.objects where bucket_id = 'avatars' and name like '00000000-0000-0000-0000-0000000000f1/%') <> 1 then
    raise exception 'FAIL: revealed buddy photo not readable'; end if;
  raise notice 'PASS: within 30 ft Ola sees Wren''s name and photo';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$ declare m jsonb; begin
  select x into m from jsonb_array_elements(public.get_group_details((select group_id from g where who = 'wren'))->'members') x
  where x->>'user_id' = '00000000-0000-0000-0000-0000000000f2';
  if m->>'first_name' <> 'Ola' then raise exception 'FAIL: reveal not mutual: %', m; end if;
  raise notice 'PASS: reveal is mutual';
end $$;

-- Now "I'm here" works.
select public.mark_here((select group_id from g where who = 'wren'));
do $$ begin
  if not (select (x->>'is_here')::boolean from jsonb_array_elements(public.get_group_details((select group_id from g where who = 'wren'))->'members') x
          where (x->>'is_me')::boolean) then
    raise exception 'FAIL: I''m here not recorded'; end if;
  raise notice 'PASS: I''m here recorded after meeting';
end $$;

-- Someone in another group still can't see Wren's photo, and nobody can read raw positions.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f4';
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'avatars' and name like '00000000-0000-0000-0000-0000000000f1/%') <> 0 then
    raise exception 'FAIL: unrelated student can read photo'; end if;
  raise notice 'PASS: unrelated student cannot read photo';
end $$;
do $$ begin
  perform 1 from public.member_positions;
  raise exception 'FAIL: positions table readable';
exception when insufficient_privilege then
  raise notice 'PASS: raw positions are not readable by anyone';
end $$;

-- ---------------------------------------------------------------- starting the walk reveals the group
select public.confirm_group((select group_id from g where who = 'max'));
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f5';
select public.confirm_group((select group_id from g where who = 'zed'));
select public.start_walk((select group_id from g where who = 'zed'));
do $$ declare m jsonb; begin
  select x into m from jsonb_array_elements(public.get_group_details((select group_id from g where who = 'zed'))->'members') x
  where x->>'user_id' = '00000000-0000-0000-0000-0000000000f4';
  if m->>'first_name' <> 'Max' then raise exception 'FAIL: walking together did not reveal: %', m; end if;
  raise notice 'PASS: starting the walk reveals everyone (GPS fallback)';
end $$;

-- ---------------------------------------------------------------- positions are deleted when done
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
select public.leave_group((select group_id from g where who = 'ola'));
reset role;
do $$ begin
  if exists (select 1 from public.member_positions where user_id = '00000000-0000-0000-0000-0000000000f2') then
    raise exception 'FAIL: position kept after leaving'; end if;
  raise notice 'PASS: position deleted when a member leaves';
end $$;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select public.leave_group((select group_id from g where who = 'wren'));
reset role;
do $$ begin
  if exists (select 1 from public.member_positions where group_id = (select group_id from g where who = 'wren')) then
    raise exception 'FAIL: positions kept after the group ended'; end if;
  raise notice 'PASS: positions deleted when the group ends';
end $$;

-- Can't change gender mid-walk.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f4';
do $$ begin
  perform public.set_my_gender('woman');
  raise exception 'FAIL: gender changed during a walk';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: gender locked during an active walk';
end $$;
reset role;
