import { randomUUID } from "crypto";
import { db } from "../db/database";
import { RouterPublic, RouterRecord } from "../types";
import { encrypt } from "./cryptoService";

function toPublic(r: RouterRecord): RouterPublic {
  return {
    id: r.id,
    name: r.name,
    host: r.host,
    port: r.port,
    username: r.username,
    sslEnabled: !!r.ssl_enabled,
    description: r.description,
    isDefault: !!r.is_default,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listRouters(): RouterPublic[] {
  const rows = db.prepare("SELECT * FROM routers ORDER BY created_at DESC").all() as RouterRecord[];
  return rows.map(toPublic);
}

export function getRouterRecord(id: string): RouterRecord | undefined {
  return db.prepare("SELECT * FROM routers WHERE id = ?").get(id) as RouterRecord | undefined;
}

export interface CreateRouterInput {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  sslEnabled: boolean;
  description?: string;
  isDefault?: boolean;
}

export function createRouter(input: CreateRouterInput): RouterPublic {
  const id = randomUUID();
  const now = new Date().toISOString();

  if (input.isDefault) {
    db.prepare("UPDATE routers SET is_default = 0").run();
  }

  db.prepare(
    `INSERT INTO routers (id, name, host, port, username, password_encrypted, ssl_enabled, description, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.host,
    input.port,
    input.username,
    encrypt(input.password),
    input.sslEnabled ? 1 : 0,
    input.description ?? null,
    input.isDefault ? 1 : 0,
    now,
    now
  );

  return toPublic(getRouterRecord(id)!);
}

export interface UpdateRouterInput extends Partial<CreateRouterInput> {}

export function updateRouter(id: string, input: UpdateRouterInput): RouterPublic {
  const existing = getRouterRecord(id);
  if (!existing) {
    throw new Error("Router not found");
  }

  if (input.isDefault) {
    db.prepare("UPDATE routers SET is_default = 0").run();
  }

  db.prepare(
    `UPDATE routers SET
      name = ?, host = ?, port = ?, username = ?,
      password_encrypted = ?, ssl_enabled = ?, description = ?, is_default = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.name ?? existing.name,
    input.host ?? existing.host,
    input.port ?? existing.port,
    input.username ?? existing.username,
    input.password ? encrypt(input.password) : existing.password_encrypted,
    input.sslEnabled !== undefined ? (input.sslEnabled ? 1 : 0) : existing.ssl_enabled,
    input.description !== undefined ? input.description : existing.description,
    input.isDefault !== undefined ? (input.isDefault ? 1 : 0) : existing.is_default,
    new Date().toISOString(),
    id
  );

  return toPublic(getRouterRecord(id)!);
}

export function deleteRouter(id: string): void {
  db.prepare("DELETE FROM routers WHERE id = ?").run(id);
}

export function getDefaultRouter(): RouterRecord | undefined {
  return db.prepare("SELECT * FROM routers WHERE is_default = 1 LIMIT 1").get() as
    | RouterRecord
    | undefined;
}
