import { randomUUID } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db/database";
import { AppError } from "../middleware/errorHandler";
import { exportScriptToRouter } from "../services/mikrotikService";
import { getRouterRecord } from "../services/routerRepository";
import { getLibraryFile } from "../services/fileService";
import fs from "fs";

export const exportRouter = Router();

const exportSchema = z.object({
  routerId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  scriptContent: z.string().min(1).optional(),
  libraryFileId: z.string().uuid().optional(),
});

/**
 * One-click "Export to MikroTik": generates/loads the script, uploads it to the
 * router, runs `/import`, waits for the result, then deletes the uploaded file.
 */
exportRouter.post("/", async (req, res, next) => {
  try {
    const input = exportSchema.parse(req.body);
    const router = getRouterRecord(input.routerId);
    if (!router) throw new AppError(404, "الراوتر غير موجود", "ROUTER_NOT_FOUND");

    let scriptContent = input.scriptContent;
    if (!scriptContent && input.libraryFileId) {
      const file = getLibraryFile(input.libraryFileId);
      if (!file) throw new AppError(404, "الملف غير موجود في المكتبة", "FILE_NOT_FOUND");
      scriptContent = fs.readFileSync(file.stored_path, "utf-8");
    }
    if (!scriptContent) {
      throw new AppError(400, "لا يوجد محتوى سكريبت للتصدير", "MISSING_SCRIPT");
    }

    const historyId = randomUUID();
    try {
      const result = await exportScriptToRouter(router, input.fileName, scriptContent);
      db.prepare(
        `INSERT INTO export_history (id, router_id, library_file_id, status, message, created_at)
         VALUES (?, ?, ?, 'success', ?, ?)`
      ).run(historyId, router.id, input.libraryFileId ?? null, result.log.join(" | "), new Date().toISOString());
      res.json({ data: result });
    } catch (err) {
      db.prepare(
        `INSERT INTO export_history (id, router_id, library_file_id, status, message, created_at)
         VALUES (?, ?, ?, 'error', ?, ?)`
      ).run(
        historyId,
        router.id,
        input.libraryFileId ?? null,
        (err as Error).message,
        new Date().toISOString()
      );
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

exportRouter.get("/history", (_req, res) => {
  res.json({
    data: db.prepare("SELECT * FROM export_history ORDER BY created_at DESC LIMIT 100").all(),
  });
});
