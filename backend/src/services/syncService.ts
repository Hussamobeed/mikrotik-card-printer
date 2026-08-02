import { randomUUID } from "crypto";
import { db } from "../db/database";
import { AppError } from "../middleware/errorHandler";
import { getRouterRecord } from "./routerRepository";
import { synchronizeRouter } from "./mikrotikService";
import { SyncResult } from "../types";

export async function runSync(routerId: string): Promise<SyncResult> {
  const router = getRouterRecord(routerId);
  if (!router) {
    throw new AppError(404, "الراوتر غير موجود", "ROUTER_NOT_FOUND");
  }

  const historyId = randomUUID();
  const startedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO sync_history (id, router_id, status, message, started_at) VALUES (?, ?, 'running', NULL, ?)`
  ).run(historyId, routerId, startedAt);

  try {
    const result = await synchronizeRouter(router);

    db.prepare(
      `INSERT INTO sync_cache (router_id, identity, routeros_version, uptime, cpu_load, free_memory, total_memory,
        customers_json, profiles_json, users_count, active_sessions_count, expired_users_count, disabled_users_count,
        last_synced_at, last_sync_status, last_sync_error)
       VALUES (@routerId, @identity, @routerosVersion, @uptime, @cpuLoad, @freeMemory, @totalMemory,
        @customersJson, @profilesJson, @usersCount, @activeSessionsCount, @expiredUsersCount, @disabledUsersCount,
        @syncedAt, 'success', NULL)
       ON CONFLICT(router_id) DO UPDATE SET
        identity=excluded.identity, routeros_version=excluded.routeros_version, uptime=excluded.uptime,
        cpu_load=excluded.cpu_load, free_memory=excluded.free_memory, total_memory=excluded.total_memory,
        customers_json=excluded.customers_json, profiles_json=excluded.profiles_json,
        users_count=excluded.users_count, active_sessions_count=excluded.active_sessions_count,
        expired_users_count=excluded.expired_users_count, disabled_users_count=excluded.disabled_users_count,
        last_synced_at=excluded.last_synced_at, last_sync_status='success', last_sync_error=NULL`
    ).run({
      routerId,
      identity: result.identity,
      routerosVersion: result.routerosVersion,
      uptime: result.uptime,
      cpuLoad: result.cpuLoad,
      freeMemory: result.freeMemory,
      totalMemory: result.totalMemory,
      customersJson: JSON.stringify(result.customers),
      profilesJson: JSON.stringify(result.profiles),
      usersCount: result.usersCount,
      activeSessionsCount: result.activeSessionsCount,
      expiredUsersCount: result.expiredUsersCount,
      disabledUsersCount: result.disabledUsersCount,
      syncedAt: result.syncedAt,
    });

    db.prepare(
      `UPDATE sync_history SET status='success', message=?, finished_at=? WHERE id=?`
    ).run(`تمت المزامنة بنجاح (${result.usersCount} مستخدم)`, new Date().toISOString(), historyId);

    return result;
  } catch (err) {
    const message = (err as Error).message;
    db.prepare(
      `UPDATE sync_history SET status='error', message=?, finished_at=? WHERE id=?`
    ).run(message, new Date().toISOString(), historyId);

    db.prepare(
      `INSERT INTO sync_cache (router_id, last_sync_status, last_sync_error, last_synced_at)
       VALUES (?, 'error', ?, ?)
       ON CONFLICT(router_id) DO UPDATE SET last_sync_status='error', last_sync_error=excluded.last_sync_error, last_synced_at=excluded.last_synced_at`
    ).run(routerId, message, new Date().toISOString());

    throw err;
  }
}

export function getCachedSync(routerId: string) {
  const row = db.prepare("SELECT * FROM sync_cache WHERE router_id = ?").get(routerId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    ...row,
    customers: JSON.parse((row.customers_json as string) ?? "[]"),
    profiles: JSON.parse((row.profiles_json as string) ?? "[]"),
  };
}

export function getSyncHistory(routerId?: string) {
  if (routerId) {
    return db
      .prepare("SELECT * FROM sync_history WHERE router_id = ? ORDER BY started_at DESC LIMIT 50")
      .all(routerId);
  }
  return db.prepare("SELECT * FROM sync_history ORDER BY started_at DESC LIMIT 50").all();
}
