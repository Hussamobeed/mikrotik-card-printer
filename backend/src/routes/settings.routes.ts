import { randomUUID } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db/database";

export const settingsRouter = Router();

settingsRouter.get("/", (_req, res) => {
  const rows = db.prepare("SELECT key, value_json FROM settings").all() as {
    key: string;
    value_json: string;
  }[];
  const settings: Record<string, unknown> = {};
  for (const row of rows) settings[row.key] = JSON.parse(row.value_json);
  res.json({ data: settings });
});

settingsRouter.put("/:key", (req, res) => {
  const { value } = z.object({ value: z.unknown() }).parse({ value: req.body });
  db.prepare(
    `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
  ).run(req.params.key, JSON.stringify(value), new Date().toISOString());
  res.json({ data: value });
});

settingsRouter.get("/export/json", (_req, res) => {
  const rows = db.prepare("SELECT key, value_json FROM settings").all() as {
    key: string;
    value_json: string;
  }[];
  const presets = db.prepare("SELECT * FROM presets").all();
  const settings: Record<string, unknown> = {};
  for (const row of rows) settings[row.key] = JSON.parse(row.value_json);
  res.setHeader("Content-Disposition", "attachment; filename=hersnnet-settings.json");
  res.json({ settings, presets, exportedAt: new Date().toISOString() });
});

const importSchema = z.object({
  settings: z.record(z.unknown()).default({}),
  presets: z
    .array(z.object({ name: z.string(), settings_json: z.unknown() }))
    .default([]),
});

settingsRouter.post("/import/json", (req, res) => {
  const input = importSchema.parse(req.body);
  const now = new Date().toISOString();
  const upsertSetting = db.prepare(
    `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
  );
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(input.settings)) {
      upsertSetting.run(key, JSON.stringify(value), now);
    }
  });
  tx();
  res.json({ data: { imported: true } });
});

// ---- Presets ----

settingsRouter.get("/presets/all", (_req, res) => {
  res.json({ data: db.prepare("SELECT * FROM presets ORDER BY created_at DESC").all() });
});

settingsRouter.post("/presets/all", (req, res) => {
  const input = z.object({ name: z.string().min(1), settings: z.record(z.unknown()) }).parse(req.body);
  const id = randomUUID();
  db.prepare(
    "INSERT INTO presets (id, name, settings_json, created_at) VALUES (?, ?, ?, ?)"
  ).run(id, input.name, JSON.stringify(input.settings), new Date().toISOString());
  res.status(201).json({ data: { id, name: input.name, settings: input.settings } });
});

settingsRouter.delete("/presets/all/:id", (req, res) => {
  db.prepare("DELETE FROM presets WHERE id = ?").run(req.params.id);
  res.status(204).send();
});
