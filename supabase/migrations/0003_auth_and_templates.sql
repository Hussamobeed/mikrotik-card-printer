-- Adds user accounts (via Supabase Auth) and per-profile print templates.
--
-- IMPORTANT: this DROPS and recreates the tables that need a structural
-- change (routers, sync_cache, sync_history, export_history, library_files,
-- app_settings, presets), so any test data you added before setting up
-- login (e.g. a test router) will be removed. Re-add it after logging in —
-- it takes a minute. This is far simpler and safer than trying to migrate
-- an existing primary key in place.
--
-- RLS stays enabled with NO policies (default-deny): the Edge Function uses
-- the service-role key and enforces per-user filtering itself on every
-- query, so tables stay inaccessible via Supabase's auto-generated REST API.

drop table if exists sync_cache;
drop table if exists sync_history;
drop table if exists export_history;
drop table if exists library_files;
drop table if exists app_settings;
drop table if exists presets;
drop table if exists routers cascade;

create table routers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  host text not null,
  port integer not null default 8728,
  username text not null,
  password_encrypted text not null,
  ssl_enabled boolean not null default false,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sync_cache (
  router_id uuid primary key references routers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  identity text,
  routeros_version text,
  uptime text,
  cpu_load text,
  free_memory text,
  total_memory text,
  customers jsonb not null default '[]',
  profiles jsonb not null default '[]',
  users_count integer,
  active_sessions_count integer,
  expired_users_count integer,
  disabled_users_count integer,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_error text
);

create table sync_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  router_id uuid not null references routers(id) on delete cascade,
  status text not null,
  message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table library_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  file_type text not null check (file_type in ('txt', 'pdf', 'xlsx', 'mikrotik-script')),
  storage_path text not null,
  customer text,
  profile text,
  prefix text,
  number_count integer,
  created_at timestamptz not null default now()
);

create table export_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  router_id uuid not null references routers(id) on delete cascade,
  library_file_id uuid references library_files(id) on delete set null,
  status text not null,
  message text,
  created_at timestamptz not null default now()
);

create table app_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  settings jsonb not null,
  created_at timestamptz not null default now()
);

create table templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  profile text, -- MikroTik User Manager profile name this template auto-applies to (null = unassigned)
  layout jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table routers enable row level security;
alter table sync_cache enable row level security;
alter table sync_history enable row level security;
alter table export_history enable row level security;
alter table library_files enable row level security;
alter table app_settings enable row level security;
alter table presets enable row level security;
alter table templates enable row level security;

create index idx_routers_user on routers(user_id);
create index idx_library_files_user on library_files(user_id);
create index idx_presets_user on presets(user_id);
create index idx_templates_user on templates(user_id);
create index idx_templates_profile on templates(user_id, profile);
