-- Table to cache user-manager data for fast reports
CREATE TABLE IF NOT EXISTS synced_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  router_id uuid NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  username text NOT NULL DEFAULT '',
  customer text NOT NULL DEFAULT '',
  profile text NOT NULL DEFAULT '',
  first_name text NOT NULL DEFAULT '',
  comment text NOT NULL DEFAULT '',
  disabled boolean NOT NULL DEFAULT false,
  nas_port text NOT NULL DEFAULT '',
  nas_port_id text NOT NULL DEFAULT '',
  calling_station_id text NOT NULL DEFAULT '',
  called_station_id text NOT NULL DEFAULT '',
  last_seen text NOT NULL DEFAULT '',
  bytes_in text NOT NULL DEFAULT '0',
  bytes_out text NOT NULL DEFAULT '0',
  uptime text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_synced_users_user_router ON synced_users(user_id, router_id);
CREATE INDEX idx_synced_users_profile ON synced_users(profile);
CREATE INDEX idx_synced_users_username ON synced_users(username);

-- Table to cache profile pricing
CREATE TABLE IF NOT EXISTS synced_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  router_id uuid NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  validity text NOT NULL DEFAULT '',
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_synced_profiles_user_router ON synced_profiles(user_id, router_id);

-- Enable RLS
ALTER TABLE synced_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see their own synced users"
  ON synced_users FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users can only see their own synced profiles"
  ON synced_profiles FOR ALL
  USING (user_id = auth.uid());
