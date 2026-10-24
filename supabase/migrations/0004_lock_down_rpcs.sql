-- PackTrack 0004: tighten function permissions flagged by the Supabase security advisor.
-- Run once in the Supabase SQL Editor after 0003.
--
-- Postgres grants EXECUTE to PUBLIC on every new function, so the app's security-definer RPCs from
-- 0001-0003 were reachable by signed-out (anon) requests. They all check auth.uid() and fail or do
-- nothing without it, but signed-out callers shouldn't reach them at all. App calls are always made
-- by signed-in users (role `authenticated`), so behavior is unchanged.

revoke execute on function public.is_in_group(uuid) from public, anon;
revoke execute on function public.shares_confirmed_group(uuid) from public, anon;
revoke execute on function public.is_verified() from public, anon;
revoke execute on function public.submit_id_verification(text, text) from public, anon;
revoke execute on function public.create_walk_request(uuid, double precision, double precision, text, jsonb, timestamptz) from public, anon;
revoke execute on function public.find_or_create_group(uuid) from public, anon;
revoke execute on function public.get_active_group() from public, anon;
revoke execute on function public.get_group_details(uuid) from public, anon;
revoke execute on function public.confirm_group(uuid) from public, anon;
revoke execute on function public.start_walk(uuid) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
revoke execute on function public.mark_arrived(uuid) from public, anon;
revoke execute on function public.set_contact_share(uuid, uuid, boolean) from public, anon;
revoke execute on function public.get_share_status(uuid) from public, anon;
revoke execute on function public.get_mutual_contacts() from public, anon;
revoke execute on function public.is_safety_admin() from public, anon;

grant execute on function public.is_in_group(uuid) to authenticated;
grant execute on function public.shares_confirmed_group(uuid) to authenticated;
grant execute on function public.is_verified() to authenticated;
grant execute on function public.submit_id_verification(text, text) to authenticated;
grant execute on function public.create_walk_request(uuid, double precision, double precision, text, jsonb, timestamptz) to authenticated;
grant execute on function public.find_or_create_group(uuid) to authenticated;
grant execute on function public.get_active_group() to authenticated;
grant execute on function public.get_group_details(uuid) to authenticated;
grant execute on function public.confirm_group(uuid) to authenticated;
grant execute on function public.start_walk(uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.mark_arrived(uuid) to authenticated;
grant execute on function public.set_contact_share(uuid, uuid, boolean) to authenticated;
grant execute on function public.get_share_status(uuid) to authenticated;
grant execute on function public.get_mutual_contacts() to authenticated;
grant execute on function public.is_safety_admin() to authenticated;

-- Pin search_path on the two helpers from 0003 that didn't set one.
alter function public.incident_radius_m(text, text) set search_path = public;
alter function public.incident_ttl(text) set search_path = public;
