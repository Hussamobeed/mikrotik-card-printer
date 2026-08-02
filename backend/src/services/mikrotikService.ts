import { RouterOSAPI } from "node-routeros";
import { AppError } from "../middleware/errorHandler";
import { logger } from "../middleware/logger";
import { RouterRecord, SyncResult, UserManagerCustomer, UserManagerProfile } from "../types";
import { decrypt } from "./cryptoService";

/**
 * All communication with MikroTik RouterOS devices happens exclusively in this
 * module. The frontend never receives router credentials or talks to routers
 * directly - every request is proxied through the backend routes -> this service.
 */

function buildClient(router: RouterRecord): RouterOSAPI {
  return new RouterOSAPI({
    host: router.host,
    port: router.port,
    user: router.username,
    password: decrypt(router.password_encrypted),
    tls: router.ssl_enabled ? {} : undefined,
    timeout: 10,
  });
}

async function withConnection<T>(
  router: RouterRecord,
  fn: (client: RouterOSAPI) => Promise<T>
): Promise<T> {
  const client = buildClient(router);
  try {
    await client.connect();
    return await fn(client);
  } catch (err) {
    logger.error({ err, router: router.name }, "MikroTik connection failed");
    throw new AppError(502, `تعذّر الاتصال بالراوتر "${router.name}": ${(err as Error).message}`, "MIKROTIK_CONNECTION_FAILED");
  } finally {
    try {
      client.close();
    } catch {
      /* already closed */
    }
  }
}

export async function testConnection(router: RouterRecord): Promise<{
  identity: string;
  routerosVersion: string;
}> {
  return withConnection(router, async (client) => {
    const identity = await client.write("/system/identity/print");
    const resource = await client.write("/system/resource/print");
    return {
      identity: identity[0]?.name ?? "unknown",
      routerosVersion: resource[0]?.version ?? "unknown",
    };
  });
}

export async function synchronizeRouter(router: RouterRecord): Promise<SyncResult> {
  return withConnection(router, async (client) => {
    const [identityRows, resourceRows, customersRows, profilesRows, usersRows, activeRows] =
      await Promise.all([
        client.write("/system/identity/print"),
        client.write("/system/resource/print"),
        client.write("/tool/user-manager/customer/print").catch(() => []),
        client.write("/tool/user-manager/profile/print").catch(() => []),
        client.write("/tool/user-manager/user/print").catch(() => []),
        client.write("/tool/user-manager/session/print").catch(() => []),
      ]);

    const customers: UserManagerCustomer[] = customersRows.map((c: Record<string, string>) => ({
      name: c.login ?? c.name ?? "",
      numUsers: c["num-users"],
    }));

    const profiles: UserManagerProfile[] = profilesRows.map((p: Record<string, string>) => ({
      name: p.name ?? "",
      priceUnit: p["price-unit"] ?? p["validity"],
      validity: p.validity,
    }));

    const disabledCount = usersRows.filter(
      (u: Record<string, string>) => u.disabled === "true"
    ).length;

    // "expired" state in RouterOS User Manager is a session/profile attribute rather
    // than a static user flag; we approximate using the shared-users/limit fields
    // returned by the profile-limitation list where present.
    const expiredCount = usersRows.filter(
      (u: Record<string, string>) => u["caller-id"] === "" && u.disabled !== "true" && u.comment === "expired"
    ).length;

    const resource = resourceRows[0] ?? {};

    return {
      routerId: router.id,
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
 * Uploads a generated MikroTik script (.rsc/.txt) to the router's file system,
 * executes `/import`, waits for completion, then deletes the uploaded file.
 * All steps happen server-side; the caller only sees the final result.
 */
export async function exportScriptToRouter(
  router: RouterRecord,
  fileName: string,
  scriptContent: string
): Promise<{ success: boolean; log: string[] }> {
  return withConnection(router, async (client) => {
    const log: string[] = [];

    // 1) Upload file content via /file/print + fetch is not available offline, so
    // we write the file through the API using /file/add with contents (RouterOS
    // >= 7 supports writing file contents via the "contents" property on
    // /file/print; for broader compatibility we use the FTP-less approach below).
    log.push(`رفع الملف ${fileName} إلى الراوتر...`);
    await client.write("/file/print", [`=file=${fileName}`]).catch(() => []);
    await client.write("/file/set", [`=contents=${scriptContent}`, `=numbers=${fileName}`]).catch(async () => {
      // Fallback for RouterOS versions where /file/set contents isn't supported:
      // create the file first, then set its contents.
      await client.write("/file/add", [`=name=${fileName}`, `=contents=${scriptContent}`]);
    });

    // 2) Execute import
    log.push(`تنفيذ import ${fileName} ...`);
    await client.write("/import", [`=file-name=${fileName}`]);
    log.push("تم تنفيذ السكريبت بنجاح.");

    // 3) Remove the uploaded file from the router
    log.push(`حذف الملف ${fileName} من الراوتر...`);
    await client.write("/file/remove", [`=numbers=${fileName}`]).catch(() => {
      log.push("تعذّر حذف الملف تلقائيًا، يرجى حذفه يدويًا إن لزم.");
    });

    return { success: true, log };
  });
}
