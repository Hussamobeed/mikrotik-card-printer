import { Hono } from "jsr:@hono/hono@4";
import { z } from "npm:zod@3.23.8";
import { LIBRARY_BUCKET, supabase } from "./db.ts";
import { encrypt } from "./cryptoService.ts";
import {
  exportScriptToRouter,
  synchronizeRouter,
  testConnection,
  type RouterRow,
} from "./mikrotikService.ts";

type Vars = { userId: string };
const app = new Hono<{ Variables: Vars }>().basePath("/api");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") return c.text("ok", 200, corsHeaders);
  await next();
  Object.entries(corsHeaders).forEach(([k, v]) => c.res.headers.set(k, v));
});

function fail(c: any, status: number, message: string, code = "ERROR") {
  return c.json({ error: { code, message } }, status);
}

// ---------------------------------------------------------------- health --
// (No auth required — simple liveness check.)
app.get("/health", (c) =>
  c.json({ status: "ok", service: "obaid-manager-api", timestamp: new Date().toISOString() })
);

// ---------------------------------------------------------- auth gate ----
// Every route below requires a real logged-in Supabase user (not just the
// anon key). The frontend sends the user's session access token as the
// Authorization header once they've signed in.
app.use("/*", async (c, next) => {
  const authHeader = c.req.header("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return fail(c, 401, "الرجاء تسجيل الدخول أولًا", "UNAUTHENTICATED");
  }
  c.set("userId", data.user.id);
  await next();
});

// -------------------------------------------------------------- routers --
const routerSchema = z.object({
  name: z.string().min(1).max(100),
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(8728),
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(255),
  sslEnabled: z.boolean().default(false),
  description: z.string().max(500).optional(),
  isDefault: z.boolean().default(false),
});

function toPublicRouter(r: any) {
  return {
    id: r.id,
    name: r.name,
    host: r.host,
    port: r.port,
    username: r.username,
    sslEnabled: r.ssl_enabled,
    description: r.description,
    isDefault: r.is_default,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

app.get("/routers", async (c) => {
  const userId = c.get("userId");
  const { data, error } = await supabase
    .from("routers")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return fail(c, 500, error.message);
  return c.json({ data: (data ?? []).map(toPublicRouter) });
});

app.post("/routers", async (c) => {
  const userId = c.get("userId");
  const parsed = routerSchema.safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "بيانات غير صالحة", "VALIDATION_ERROR");
  const input = parsed.data;

  if (input.isDefault) {
    await supabase.from("routers").update({ is_default: false }).eq("user_id", userId);
  }

  const { data, error } = await supabase
    .from("routers")
    .insert({
      user_id: userId,
      name: input.name,
      host: input.host,
      port: input.port,
      username: input.username,
      password_encrypted: await encrypt(input.password),
      ssl_enabled: input.sslEnabled,
      description: input.description ?? null,
      is_default: input.isDefault,
    })
    .select()
    .single();

  if (error) return fail(c, 500, error.message);
  return c.json({ data: toPublicRouter(data) }, 201);
});

app.put("/routers/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const parsed = routerSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "بيانات غير صالحة", "VALIDATION_ERROR");
  const input = parsed.data;

  if (input.isDefault) {
    await supabase.from("routers").update({ is_default: false }).eq("user_id", userId);
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) update.name = input.name;
  if (input.host !== undefined) update.host = input.host;
  if (input.port !== undefined) update.port = input.port;
  if (input.username !== undefined) update.username = input.username;
  if (input.password) update.password_encrypted = await encrypt(input.password);
  if (input.sslEnabled !== undefined) update.ssl_enabled = input.sslEnabled;
  if (input.description !== undefined) update.description = input.description;
  if (input.isDefault !== undefined) update.is_default = input.isDefault;

  const { data, error } = await supabase
    .from("routers")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) return fail(c, 500, error.message);
  return c.json({ data: toPublicRouter(data) });
});

app.delete("/routers/:id", async (c) => {
  const userId = c.get("userId");
  const { error } = await supabase.from("routers").delete().eq("id", c.req.param("id")).eq("user_id", userId);
  if (error) return fail(c, 500, error.message);
  return c.body(null, 204);
});

async function getRouterRow(id: string, userId: string): Promise<RouterRow | null> {
  const { data } = await supabase.from("routers").select("*").eq("id", id).eq("user_id", userId).single();
  return (data as RouterRow) ?? null;
}

app.post("/routers/:id/test-connection", async (c) => {
  const router = await getRouterRow(c.req.param("id"), c.get("userId"));
  if (!router) return fail(c, 404, "الراوتر غير موجود", "ROUTER_NOT_FOUND");
  try {
    const result = await testConnection(router);
    return c.json({ data: { connected: true, ...result } });
  } catch (err) {
    return fail(c, 502, (err as Error).message, "MIKROTIK_CONNECTION_FAILED");
  }
});

// ----------------------------------------------------------------- sync --
app.post("/sync/:routerId", async (c) => {
  const userId = c.get("userId");
  const routerId = c.req.param("routerId");
  const router = await getRouterRow(routerId, userId);
  if (!router) return fail(c, 404, "الراوتر غير موجود", "ROUTER_NOT_FOUND");

  const startedAt = new Date().toISOString();
  const { data: historyRow } = await supabase
    .from("sync_history")
    .insert({ user_id: userId, router_id: routerId, status: "running", started_at: startedAt })
    .select()
    .single();

  try {
    const result = await synchronizeRouter(router);

    await supabase.from("sync_cache").upsert({
      router_id: routerId,
      user_id: userId,
      identity: result.identity,
      routeros_version: result.routerosVersion,
      uptime: result.uptime,
      cpu_load: result.cpuLoad,
      free_memory: result.freeMemory,
      total_memory: result.totalMemory,
      customers: result.customers,
      profiles: result.profiles,
      users_count: result.usersCount,
      active_sessions_count: result.activeSessionsCount,
      expired_users_count: result.expiredUsersCount,
      disabled_users_count: result.disabledUsersCount,
      last_synced_at: result.syncedAt,
      last_sync_status: "success",
      last_sync_error: null,
    });

    if (historyRow) {
      await supabase
        .from("sync_history")
        .update({
          status: "success",
          message: `تمت المزامنة بنجاح (${result.usersCount} مستخدم)`,
          finished_at: new Date().toISOString(),
        })
        .eq("id", historyRow.id);
    }

    return c.json({ data: { routerId, ...result } });
  } catch (err) {
    const message = (err as Error).message;
    if (historyRow) {
      await supabase
        .from("sync_history")
        .update({ status: "error", message, finished_at: new Date().toISOString() })
        .eq("id", historyRow.id);
    }
    await supabase.from("sync_cache").upsert({
      router_id: routerId,
      user_id: userId,
      last_sync_status: "error",
      last_sync_error: message,
      last_synced_at: new Date().toISOString(),
    });
    return fail(c, 502, message, "SYNC_FAILED");
  }
});

app.get("/sync/:routerId/cache", async (c) => {
  const { data } = await supabase
    .from("sync_cache")
    .select("*")
    .eq("router_id", c.req.param("routerId"))
    .eq("user_id", c.get("userId"))
    .maybeSingle();
  return c.json({ data: data ?? null });
});

app.get("/sync/:routerId/history", async (c) => {
  const { data } = await supabase
    .from("sync_history")
    .select("*")
    .eq("router_id", c.req.param("routerId"))
    .eq("user_id", c.get("userId"))
    .order("started_at", { ascending: false })
    .limit(50);
  return c.json({ data: data ?? [] });
});

app.get("/sync/history/all", async (c) => {
  const { data } = await supabase
    .from("sync_history")
    .select("*")
    .eq("user_id", c.get("userId"))
    .order("started_at", { ascending: false })
    .limit(50);
  return c.json({ data: data ?? [] });
});

// ------------------------------------------------------ export-to-mikrotik --
const exportSchema = z.object({
  routerId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  scriptContent: z.string().min(1).optional(),
  libraryFileId: z.string().uuid().optional(),
});

app.post("/export-to-mikrotik", async (c) => {
  const userId = c.get("userId");
  const parsed = exportSchema.safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "بيانات غير صالحة", "VALIDATION_ERROR");
  const input = parsed.data;

  const router = await getRouterRow(input.routerId, userId);
  if (!router) return fail(c, 404, "الراوتر غير موجود", "ROUTER_NOT_FOUND");

  let scriptContent = input.scriptContent;
  if (!scriptContent && input.libraryFileId) {
    const { data: fileRow } = await supabase
      .from("library_files")
      .select("*")
      .eq("id", input.libraryFileId)
      .eq("user_id", userId)
      .single();
    if (!fileRow) return fail(c, 404, "الملف غير موجود في المكتبة", "FILE_NOT_FOUND");
    const { data: blob, error } = await supabase.storage.from(LIBRARY_BUCKET).download(fileRow.storage_path);
    if (error || !blob) return fail(c, 500, "تعذّر قراءة الملف من المكتبة");
    scriptContent = await blob.text();
  }
  if (!scriptContent) return fail(c, 400, "لا يوجد محتوى سكريبت للتصدير", "MISSING_SCRIPT");

  try {
    const result = await exportScriptToRouter(router, input.fileName, scriptContent);
    await supabase.from("export_history").insert({
      user_id: userId,
      router_id: router.id,
      library_file_id: input.libraryFileId ?? null,
      status: "success",
      message: result.log.join(" | "),
    });
    return c.json({ data: result });
  } catch (err) {
    const message = (err as Error).message;
    await supabase.from("export_history").insert({
      user_id: userId,
      router_id: router.id,
      library_file_id: input.libraryFileId ?? null,
      status: "error",
      message,
    });
    return fail(c, 502, message, "EXPORT_FAILED");
  }
});

app.get("/export-to-mikrotik/history", async (c) => {
  const { data } = await supabase
    .from("export_history")
    .select("*")
    .eq("user_id", c.get("userId"))
    .order("created_at", { ascending: false })
    .limit(100);
  return c.json({ data: data ?? [] });
});

// ------------------------------------------------------------- library --
app.get("/library", async (c) => {
  const { data, error } = await supabase
    .from("library_files")
    .select("*")
    .eq("user_id", c.get("userId"))
    .order("created_at", { ascending: false });
  if (error) return fail(c, 500, error.message);
  return c.json({ data: data ?? [] });
});

app.post("/library", async (c) => {
  const userId = c.get("userId");
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail(c, 400, "لم يتم إرفاق أي ملف", "MISSING_FILE");

  const name = String(form.get("name") ?? file.name);
  const fileType = String(form.get("fileType") ?? "txt");
  const customer = form.get("customer") ? String(form.get("customer")) : null;
  const profile = form.get("profile") ? String(form.get("profile")) : null;
  const prefix = form.get("prefix") ? String(form.get("prefix")) : null;
  const numberCount = form.get("numberCount") ? Number(form.get("numberCount")) : null;

  const storagePath = `${userId}/${crypto.randomUUID()}_${name}`.replace(/\s+/g, "_");
  const { error: uploadError } = await supabase.storage
    .from(LIBRARY_BUCKET)
    .upload(storagePath, file, { contentType: file.type || "application/octet-stream" });
  if (uploadError) return fail(c, 500, uploadError.message);

  const { data, error } = await supabase
    .from("library_files")
    .insert({
      user_id: userId,
      name,
      file_type: fileType,
      storage_path: storagePath,
      customer,
      profile,
      prefix,
      number_count: numberCount,
    })
    .select()
    .single();

  if (error) return fail(c, 500, error.message);
  return c.json({ data }, 201);
});

app.get("/library/:id/download", async (c) => {
  const userId = c.get("userId");
  const { data: fileRow } = await supabase
    .from("library_files")
    .select("*")
    .eq("id", c.req.param("id"))
    .eq("user_id", userId)
    .single();
  if (!fileRow) return fail(c, 404, "الملف غير موجود", "FILE_NOT_FOUND");

  const { data: blob, error } = await supabase.storage.from(LIBRARY_BUCKET).download(fileRow.storage_path);
  if (error || !blob) return fail(c, 500, "تعذّر تنزيل الملف");
  return new Response(blob, {
    headers: {
      "Content-Type": blob.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileRow.name}"`,
    },
  });
});

app.patch("/library/:id", async (c) => {
  const { name } = z.object({ name: z.string().min(1) }).parse(await c.req.json());
  const { data, error } = await supabase
    .from("library_files")
    .update({ name })
    .eq("id", c.req.param("id"))
    .eq("user_id", c.get("userId"))
    .select()
    .single();
  if (error) return fail(c, 500, error.message);
  return c.json({ data });
});

app.post("/library/:id/duplicate", async (c) => {
  const userId = c.get("userId");
  const { data: fileRow } = await supabase
    .from("library_files")
    .select("*")
    .eq("id", c.req.param("id"))
    .eq("user_id", userId)
    .single();
  if (!fileRow) return fail(c, 404, "الملف غير موجود", "FILE_NOT_FOUND");

  const newPath = `${userId}/${crypto.randomUUID()}_${fileRow.name}`.replace(/\s+/g, "_");
  const { error: copyError } = await supabase.storage.from(LIBRARY_BUCKET).copy(fileRow.storage_path, newPath);
  if (copyError) return fail(c, 500, copyError.message);

  const { data, error } = await supabase
    .from("library_files")
    .insert({
      user_id: userId,
      name: `نسخة من ${fileRow.name}`,
      file_type: fileRow.file_type,
      storage_path: newPath,
      customer: fileRow.customer,
      profile: fileRow.profile,
      prefix: fileRow.prefix,
      number_count: fileRow.number_count,
    })
    .select()
    .single();

  if (error) return fail(c, 500, error.message);
  return c.json({ data }, 201);
});

app.delete("/library/:id", async (c) => {
  const userId = c.get("userId");
  const { data: fileRow } = await supabase
    .from("library_files")
    .select("*")
    .eq("id", c.req.param("id"))
    .eq("user_id", userId)
    .single();
  if (fileRow) await supabase.storage.from(LIBRARY_BUCKET).remove([fileRow.storage_path]);
  await supabase.from("library_files").delete().eq("id", c.req.param("id")).eq("user_id", userId);
  return c.body(null, 204);
});

// ------------------------------------------------------------- settings --
app.get("/settings", async (c) => {
  const { data } = await supabase.from("app_settings").select("key, value").eq("user_id", c.get("userId"));
  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) settings[row.key] = row.value;
  return c.json({ data: settings });
});

app.put("/settings/:key", async (c) => {
  const value = await c.req.json();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ user_id: c.get("userId"), key: c.req.param("key"), value, updated_at: new Date().toISOString() });
  if (error) return fail(c, 500, error.message);
  return c.json({ data: value });
});

app.get("/settings/export/json", async (c) => {
  const userId = c.get("userId");
  const { data: settingsRows } = await supabase.from("app_settings").select("key, value").eq("user_id", userId);
  const { data: presets } = await supabase.from("presets").select("*").eq("user_id", userId);
  const settings: Record<string, unknown> = {};
  for (const row of settingsRows ?? []) settings[row.key] = row.value;
  return c.json({ settings, presets: presets ?? [], exportedAt: new Date().toISOString() });
});

app.post("/settings/import/json", async (c) => {
  const userId = c.get("userId");
  const body = z
    .object({
      settings: z.record(z.unknown()).default({}),
      presets: z.array(z.object({ name: z.string(), settings_json: z.unknown() })).default([]),
    })
    .parse(await c.req.json());

  for (const [key, value] of Object.entries(body.settings)) {
    await supabase.from("app_settings").upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() });
  }
  return c.json({ data: { imported: true } });
});

app.get("/settings/presets/all", async (c) => {
  const { data } = await supabase
    .from("presets")
    .select("*")
    .eq("user_id", c.get("userId"))
    .order("created_at", { ascending: false });
  return c.json({ data: data ?? [] });
});

app.post("/settings/presets/all", async (c) => {
  const userId = c.get("userId");
  const body = z.object({ name: z.string().min(1), settings: z.record(z.unknown()) }).parse(await c.req.json());
  const { data, error } = await supabase
    .from("presets")
    .insert({ user_id: userId, name: body.name, settings: body.settings })
    .select()
    .single();
  if (error) return fail(c, 500, error.message);
  return c.json({ data }, 201);
});

app.delete("/settings/presets/all/:id", async (c) => {
  await supabase.from("presets").delete().eq("id", c.req.param("id")).eq("user_id", c.get("userId"));
  return c.body(null, 204);
});

// ------------------------------------------------------------- templates --
// Per-profile print templates: each optionally links to a MikroTik User
// Manager profile name so the frontend can auto-apply the right layout when
// that profile is selected in the generator.
const templateSchema = z.object({
  name: z.string().min(1).max(100),
  profile: z.string().max(100).nullable().optional(),
  layout: z.record(z.unknown()),
});

app.get("/templates", async (c) => {
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .eq("user_id", c.get("userId"))
    .order("created_at", { ascending: false });
  if (error) return fail(c, 500, error.message);
  return c.json({ data: data ?? [] });
});

app.post("/templates", async (c) => {
  const userId = c.get("userId");
  const parsed = templateSchema.safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "بيانات غير صالحة", "VALIDATION_ERROR");
  const input = parsed.data;
  const { data, error } = await supabase
    .from("templates")
    .insert({ user_id: userId, name: input.name, profile: input.profile ?? null, layout: input.layout })
    .select()
    .single();
  if (error) return fail(c, 500, error.message);
  return c.json({ data }, 201);
});

app.put("/templates/:id", async (c) => {
  const userId = c.get("userId");
  const parsed = templateSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "بيانات غير صالحة", "VALIDATION_ERROR");
  const input = parsed.data;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) update.name = input.name;
  if (input.profile !== undefined) update.profile = input.profile;
  if (input.layout !== undefined) update.layout = input.layout;

  const { data, error } = await supabase
    .from("templates")
    .update(update)
    .eq("id", c.req.param("id"))
    .eq("user_id", userId)
    .select()
    .single();
  if (error) return fail(c, 500, error.message);
  return c.json({ data });
});

app.delete("/templates/:id", async (c) => {
  await supabase.from("templates").delete().eq("id", c.req.param("id")).eq("user_id", c.get("userId"));
  return c.body(null, 204);
});

Deno.serve(app.fetch);
