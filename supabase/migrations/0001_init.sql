-- Hersnnet Cards Manager - Supabase/Postgres schema
-- Run this in the Supabase SQL editor, or via `supabase db push`.

create extension if not exists pgcrypto;

create table if not exists routers (
  id uuid primary key default gen_random_uuid(),
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

create table if not exists sync_cache (
  router_id uuid primary key references routers(id) on delete cascade,
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

create table if not exists sync_history (
  id uuid primary key default gen_random_uuid(),
  router_id uuid not null references routers(id) on delete cascade,
  status text not null,
  message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists library_files (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  file_type text not null check (file_type in ('txt', 'pdf', 'xlsx', 'mikrotik-script')),
  storage_path text not null, -- path inside the 'library' Supabase Storage bucket
  customer text,
  profile text,
  prefix text,
  number_count integer,
  created_at timestamptz not null default now()
);

create table if not exists export_history (
  id uuid primary key default gen_random_uuid(),
  router_id uuid not null references routers(id) on delete cascade,
  library_file_id uuid references library_files(id) on delete set null,
  status text not null,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  settings jsonb not null,
  created_at timestamptz not null default now()
);

-- All access goes through the Edge Function using the service-role key,
-- so Row Level Security stays enabled with NO public policies: the anon
-- key alone can never read/write these tables directly.
alter table routers enable row level security;
alter table sync_cache enable row level security;
alter table sync_history enable row level security;
alter table library_files enable row level security;
alter table export_history enable row level security;
alter table app_settings enable row level security;
alter table presets enable row level security;
