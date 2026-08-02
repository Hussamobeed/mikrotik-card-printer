import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { env } from "../config/env";

fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });
fs.mkdirSync(env.libraryPath, { recursive: true });

export const db = new Database(env.databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS routers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 8728,
  username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  ssl_enabled INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_cache (
  router_id TEXT PRIMARY KEY REFERENCES routers(id) ON DELETE CASCADE,
  identity TEXT,
  routeros_version TEXT,
  uptime TEXT,
  cpu_load TEXT,
  free_memory TEXT,
  total_memory TEXT,
  customers_json TEXT,
  profiles_json TEXT,
  users_count INTEGER,
  active_sessions_count INTEGER,
  expired_users_count INTEGER,
  disabled_users_count INTEGER,
  last_synced_at TEXT,
  last_sync_status TEXT,
  last_sync_error TEXT
);

CREATE TABLE IF NOT EXISTS sync_history (
  id TEXT PRIMARY KEY,
  router_id TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS library_files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  customer TEXT,
  profile TEXT,
  prefix TEXT,
  number_count INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS export_history (
  id TEXT PRIMARY KEY,
  router_id TEXT NOT NULL,
  library_file_id TEXT,
  status TEXT NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);
