-- Minimal stand-ins for the Supabase-managed schemas so the migration can run on plain PostGIS.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema extensions;
alter database postgres set search_path = "$user", public, extensions;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
$$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;

create schema realtime;
create table realtime.messages (id bigserial primary key, topic text);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as
$$ select current_setting('realtime.topic', true) $$;

create publication supabase_realtime;

grant usage on schema public, auth, storage, realtime, extensions to anon, authenticated;
grant select, insert, update on storage.objects to authenticated;
grant select, insert on realtime.messages to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
