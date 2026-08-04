import axios from "axios";
import { supabaseAuth } from "@/lib/supabaseClient";
import {
  CachedSyncData,
  LibraryFile,
  ReportFilters,
  RouterInput,
  RouterPublic,
  SyncResult,
  UserManagerReport,
} from "@/types";

// VITE_SUPABASE_FUNCTION_URL looks like:
//   https://<project-ref>.supabase.co/functions/v1/api
// VITE_SUPABASE_ANON_KEY is the "anon public" key from
// Supabase Dashboard -> Project Settings -> API.
export const api = axios.create({
  baseURL: import.meta.env.VITE_SUPABASE_FUNCTION_URL,
  timeout: 30_000,
});

// Every request carries the current user's session token (not just the anon
// key) so the Edge Function can identify who's calling and scope data to
// them. `apikey` is still required by Supabase's gateway regardless of auth.
api.interceptors.request.use(async (config) => {
  const { data } = await supabaseAuth.auth.getSession();
  const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  config.headers = config.headers ?? {};
  config.headers.apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const message = error?.response?.data?.error?.message ?? error.message ?? "حدث خطأ غير متوقع";
    const code = error?.response?.data?.error?.code ?? "ERROR";
    const enhancedError = new Error(message) as any;
    enhancedError.status = status;
    enhancedError.code = code;
    enhancedError.original = error;
    return Promise.reject(enhancedError);
  }
);

// ---- Routers ----
export const routersApi = {
  list: () => api.get<{ data: RouterPublic[] }>("/routers").then((r) => r.data.data),
  create: (input: RouterInput) =>
    api.post<{ data: RouterPublic }>("/routers", input).then((r) => r.data.data),
  update: (id: string, input: Partial<RouterInput>) =>
    api.put<{ data: RouterPublic }>(`/routers/${id}`, input).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/routers/${id}`),
  testConnection: (id: string) =>
    api
      .post<{ data: { connected: boolean; identity: string; routerosVersion: string } }>(
        `/routers/${id}/test-connection`
      )
      .then((r) => r.data.data),
};

// ---- Sync ----
export const syncApi = {
  run: (routerId: string) =>
    api.post<{ data: SyncResult }>(`/sync/${routerId}`).then((r) => r.data.data),
  cache: (routerId: string) =>
    api.get<{ data: CachedSyncData | null }>(`/sync/${routerId}/cache`).then((r) => r.data.data),
  history: (routerId: string) => api.get(`/sync/${routerId}/history`).then((r) => r.data.data),
};

// ---- Export to MikroTik ----
export const exportApi = {
  run: (input: {
    routerId: string;
    fileName: string;
    scriptContent?: string;
    libraryFileId?: string;
  }) =>
    api
      .post<{ data: { success: boolean; log: string[] } }>("/export-to-mikrotik", input)
      .then((r) => r.data.data),
};

// ---- Library ----
// ---- Reports ----
export const reportsApi = {
  // Fast: reads from DB cache (no timeout issues)
  fetch: (routerId: string) =>
    api
      .get<{ data: UserManagerReport }>(`/reports/${routerId}`)
      .then((r) => r.data.data),
  // Slow: fetches from MikroTik and stores in DB (expect 5-10 min for 3000+ users)
  sync: (routerId: string) =>
    api
      .post<{ data: { success: boolean; usersCount: number; syncedAt: string } }>(`/sync-users/${routerId}`, {}, { timeout: 600_000 })
      .then((r) => r.data.data),
};

export const libraryApi = {
  list: () => api.get<{ data: LibraryFile[] }>("/library").then((r) => r.data.data),
  upload: (file: Blob, meta: Record<string, string | number>) => {
    const form = new FormData();
    form.append("file", file, String(meta.name));
    Object.entries(meta).forEach(([k, v]) => form.append(k, String(v)));
    return api
      .post<{ data: LibraryFile }>("/library", form)
      .then((r) => r.data.data);
  },
  /**
   * Downloads now go through an authenticated request (the Edge Function
   * requires the anon-key headers, which a plain <a href> click can't send)
   * and trigger the browser's save dialog via a Blob URL.
   */
  download: async (id: string, fileName: string) => {
    const res = await api.get(`/library/${id}/download`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  },
  rename: (id: string, name: string) => api.patch(`/library/${id}`, { name }),
  duplicate: (id: string) => api.post(`/library/${id}/duplicate`),
  remove: (id: string) => api.delete(`/library/${id}`),
};

// ---- Templates (per-profile print layouts) ----
export const templatesApi = {
  list: () => api.get("/templates").then((r) => r.data.data),
  create: (name: string, profile: string | null, layout: unknown) =>
    api.post("/templates", { name, profile, layout }).then((r) => r.data.data),
  update: (id: string, input: { name?: string; profile?: string | null; layout?: unknown }) =>
    api.put(`/templates/${id}`, input).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/templates/${id}`),
};

// ---- Settings ----
export const settingsApi = {
  getAll: () => api.get("/settings").then((r) => r.data.data),
  set: (key: string, value: unknown) => api.put(`/settings/${key}`, value),
  exportJson: () => api.get("/settings/export/json").then((r) => r.data),
  importJson: (payload: unknown) => api.post("/settings/import/json", payload),
  presets: {
    list: () => api.get("/settings/presets/all").then((r) => r.data.data),
    create: (name: string, settings: unknown) =>
      api.post("/settings/presets/all", { name, settings }).then((r) => r.data.data),
    remove: (id: string) => api.delete(`/settings/presets/all/${id}`),
  },
};
