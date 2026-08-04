import { connectRouterOS } from "./mikrotikClient.ts";
import { decrypt } from "./cryptoService.ts";
import { API_VERSION } from "./version.ts";

export interface RouterRow {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password_encrypted: string;
  ssl_enabled: boolean;
}

async function withConnection<T>(
  router: RouterRow,
  fn: (conn: Awaited<ReturnType<typeof connectRouterOS>>) => Promise<T>
): Promise<T> {
  const password = await decrypt(router.password_encrypted);
  const conn = await connectRouterOS({
    host: router.host,
    port: router.port,
    username: router.username,
    password,
    ssl: router.ssl_enabled,
  });
  try {
    return await fn(conn);
  } catch (err) {
    throw new Error(
      `[v${API_VERSION}] تعذّر الاتصال بالراوتر "${router.name}": ${(err as Error).message}`
    );
  } finally {
    conn.close();
  }
}

export async function testConnection(router: RouterRow) {
  return withConnection(router, async (conn) => {
    const identity = await conn.command(["/system/identity/print"]);
    const resource = await conn.command(["/system/resource/print"]);
    return {
      identity: identity[0]?.name ?? "unknown",
      routerosVersion: resource[0]?.version ?? "unknown",
    };
  });
}

export async function synchronizeRouter(router: RouterRow) {
  return withConnection(router, async (conn) => {
    const identityRows = await conn.command(["/system/identity/print"]);
    const resourceRows = await conn.command(["/system/resource/print"]);

    const safe = async (words: string[]) => {
      try {
        return await conn.command(words);
      } catch {
        return [] as Record<string, string>[];
      }
    };

    const customersRows = await safe(["/tool/user-manager/customer/print"]);
    const profilesRows = await safe(["/tool/user-manager/profile/print"]);
    const usersRows = await safe(["/tool/user-manager/user/print"]);
    const activeRows = await safe(["/tool/user-manager/session/print"]);

    const customers = customersRows.map((c) => ({
      name: c.login ?? c.name ?? "",
      numUsers: c["num-users"],
    }));
    const profiles = profilesRows.map((p) => ({
      name: p.name ?? "",
      priceUnit: p["price-unit"] ?? p.validity,
      validity: p.validity,
    }));
    const disabledCount = usersRows.filter((u) => u.disabled === "true").length;
    const expiredCount = usersRows.filter((u) => u.comment === "expired").length;
    const resource = resourceRows[0] ?? {};

    return {
      identity: identityRows[0]?.name ?? "unknown",
      routerosVersion: resource.version ?? "unknown",
      uptime: resource.uptime ?? "unknown",
      cpuLoad: resource["cpu-load"] ?? "0",
      freeMemory: resource["free-memory"] ?? "0",
      totalMemory: resource["total-memory"] ?? "0",
      customers,
      profiles,
      usersCount: usersRows.length,
      activeSessionsCount: activeRows.length,
      expiredUsersCount: expiredCount,
      disabledUsersCount: disabledCount,
      syncedAt: new Date().toISOString(),
    };
  });
}

/**
 * Fetches User Manager session data for reporting, on-demand only (never
 * cached/auto-run). Field names in RouterOS User Manager vary somewhat by
 * version/config, so rather than assume specific column names, this returns
 * every raw field the router provides per session, merged with that user's
 * profile name and price where we can match them up. The frontend renders
 * whatever columns actually come back instead of hardcoding a fixed shape.
 */
export async function fetchUserManagerReport(router: RouterRow) {
  return withConnection(router, async (conn) => {
    const safe = async (words: string[]) => {
      try {
        return await conn.command(words);
      } catch {
        return [] as Record<string, string>[];
      }
    };

    const [sessionRows, userRows, profileRows] = await Promise.all([
      safe(["/tool/user-manager/session/print"]),
      safe(["/tool/user-manager/user/print"]),
      safe(["/tool/user-manager/profile/print"]),
    ]);

    // Map username -> profile name (from the user record), and profile name
    // -> price (from the profile record), so we can attach a "profile" and
    // "price" column to each session row even if the session itself doesn't
    // carry them directly (this differs by RouterOS version).
    const userToProfile = new Map<string, string>();
    for (const u of userRows) {
      if (u.name && u.profile) userToProfile.set(u.name, u.profile);
    }
    const profileToPrice = new Map<string, string>();
    for (const p of profileRows) {
      if (p.name) profileToPrice.set(p.name, p["price-unit"] ?? p.price ?? "");
    }

    const rows = sessionRows.map((s) => {
      const username = s.user ?? s.username ?? "";
      const profile = s.profile ?? userToProfile.get(username) ?? "";
      const price = profileToPrice.get(profile) ?? "";
      return {
        ...s,
        profile,
        price,
      };
    });

    return { rows, fetchedAt: new Date().toISOString() };
  });
}

export async function exportScriptToRouter(
  router: RouterRow,
  fileName: string,
  scriptContent: string
) {
  return withConnection(router, async (conn) => {
    const log: string[] = [`[Edge Function version: ${API_VERSION}]`];

    // NOTE ON APPROACH: writing file contents via the RouterOS API
    // (/file/add or /file/print + /file/set "contents=") is documented by
    // MikroTik as an unreliable timing-dependent workaround — it's exactly
    // what produced the empty "*.rsc.txt" files reported in testing. The
    // officially documented, reliable way to run arbitrary script text via
    // the API is to store it as a temporary /system script object (whose
    // "source" property accepts the full script text directly, no file
    // involved), run it, then remove it. This is the same pattern MikroTik's
    // own scripting docs use for API-driven automation.
    const sanitized = fileName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    const scriptName = `obaidmgr_${sanitized}_${Date.now()}`;

    // Deliberately NOT specifying a "policy=" value here: the exact set of
    // valid policy tokens differs across RouterOS versions, and guessing a
    // list (or even copying the connecting user's own group policy) kept
    // hitting "input does not match any value of policy" on this router.
    // Omitting the parameter lets RouterOS apply its own default policy for
    // the script, which is fine here since the connecting API account
    // already has to be a fully-privileged user for the rest of this app
    // (sync, user-manager management, etc.) to work at all.
    log.push(`إنشاء سكريبت مؤقت "${scriptName}" على الراوتر...`);
    await conn.command(["/system/script/add", `=name=${scriptName}`, `=source=${scriptContent}`]);

    try {
      log.push("تنفيذ السكريبت...");
      await conn.command(["/system/script/run", `=numbers=${scriptName}`]);
      log.push("تم تنفيذ السكريبت بنجاح.");
    } finally {
      log.push("حذف السكريبت المؤقت من الراوتر...");
      try {
        await conn.command(["/system/script/remove", `=numbers=${scriptName}`]);
      } catch {
        log.push("تعذّر حذف السكريبت المؤقت تلقائيًا، يرجى حذفه يدويًا من System > Scripts إن لزم.");
      }
    }

    return { success: true, log };
  });
}
