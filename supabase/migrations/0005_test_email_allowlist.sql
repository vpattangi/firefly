-- PackTrack 0005: TEMPORARY test-account allowlist (first draft only).
-- Run once in the Supabase SQL Editor after 0004.
--
-- Lets specific non-.edu addresses sign up so the team can test without a university inbox.
-- This loosens privacy rule 1 in AGENTS.md ("only .edu emails can sign up") for listed addresses only.
-- Before launch: `delete from public.test_email_allowlist;` (or drop the table and restore the 0001 trigger).
-- Allowlisted accounts still go through ID verification like everyone else.

create table public.test_email_allowlist (
  email text primary key check (email = lower(email))
);

-- Only the trigger below (security definer) reads it; no app access.
alter table public.test_email_allowlist enable row level security;

insert into public.test_email_allowlist (email) values ('imarshshah@gmail.com'), ('emmanuelelizaldeocampo@gmail.com');

create or replace function public.enforce_edu_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null
     or (lower(new.email) !~ '^[^@]+@([a-z0-9-]+\.)*[a-z0-9-]+\.edu$'
         and not exists (select 1 from test_email_allowlist where email = lower(new.email))) then
    raise exception 'A university (.edu) email address is required';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_edu_email() from public, anon, authenticated;
