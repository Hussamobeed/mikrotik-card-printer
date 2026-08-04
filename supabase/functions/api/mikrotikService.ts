export { connectRouterOS } from "./mikrotikClient.ts";
import { connectRouterOS } from "./mikrotikClient.ts";
import { decrypt } from "./cryptoService.ts";

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
  let conn: Awaited<ReturnType<typeof connectRouterOS>> | null = null;
  try {
    conn = await connectRouterOS({
      host: router.host,
      port: router.port,
      username: router.username,
      password,
      ssl: router.ssl_enabled,
    });
    return await fn(conn);
  } catch (err) {
    throw new Error(`تعذّر الاتصال بالراوتر "${router.name}": ${(err as Error).message}`);
  } finally {
    conn?.close();
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

async function getUserPolicy(
  conn: Awaited<ReturnType<typeof connectRouterOS>>,
  username: string
): Promise<string | null> {
  try {
    const users = await conn.command(["/user/print", `?name=${username}`]);
    const group = users[0]?.group;
    if (!group) return null;
    const groups = await conn.command(["/user/group/print", `?name=${group}`]);
    const rawPolicy = groups[0]?.policy ?? null;
    if (!rawPolicy) return null;

    // RouterOS script policies are a strict subset of user group policies.
    // Passing invalid ones (api, rest-api, winbox, web, ftp, etc.) causes
    // "unknown parameter" on /system/script/add.
    const validScriptPolicies = new Set([
      "read", "write", "test", "policy", "sensitive", "reboot",
    ]);
    const filtered = String(rawPolicy)
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter((p) => validScriptPolicies.has(p));
    return filtered.length ? filtered.join(",") : null;
  } catch {
    return null;
  }
}

export async function exportScriptToRouter(
  router: RouterRow,
  fileName: string,
  scriptContent: string
) {
  return withConnection(router, async (conn) => {
    const log: string[] = [];

    const sanitized = fileName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    const scriptName = `obaidmgr_${sanitized}_${Date.now()}`;

    // Only attach policy if it is 100% safe. If null/empty, skip it entirely.
    const policy = await getUserPolicy(conn, router.username);

    log.push(`إنشاء سكريبت مؤقت "${scriptName}" على الراوتر...`);
    const addWords = ["/system/script/add", `=name=${scriptName}`, `=source=${scriptContent}`];
    if (policy) {
      addWords.push(`=policy=${policy}`);
    }
    await conn.command(addWords);

    try {
      log.push("تنفيذ السكريبت...");
      // RouterOS API: /system/script/run uses =.id= (not =numbers=) in most versions
      await conn.command(["/system/script/run", `=.id=${scriptName}`]);
      log.push("تم تنفيذ السكريبت بنجاح.");
    } finally {
      log.push("حذف السكريبت المؤقت من الراوتر...");
      try {
        await conn.command(["/system/script/remove", `=.id=${scriptName}`]);
      } catch {
        log.push("تعذّر حذف السكريبت المؤقت تلقائيًا، يرجى حذفه يدويًا من System > Scripts إن لزم.");
      }
    }

    return { success: true, log };
  });
}
