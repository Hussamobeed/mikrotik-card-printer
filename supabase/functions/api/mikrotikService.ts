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
    throw new Error(`تعذّر الاتصال بالراوتر "${router.name}": ${(err as Error).message}`);
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

export async function exportScriptToRouter(
  router: RouterRow,
  fileName: string,
  scriptContent: string
) {
  return withConnection(router, async (conn) => {
    const log: string[] = [];

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

    log.push(`إنشاء سكريبت مؤقت "${scriptName}" على الراوتر...`);
    await conn.command([
      "/system/script/add",
      `=name=${scriptName}`,
      "=policy=ftp,reboot,read,write,policy,test,winbox,password,sniff,sensitive,api",
      `=source=${scriptContent}`,
    ]);

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
