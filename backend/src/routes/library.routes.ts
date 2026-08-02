import fs from "fs";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler";
import {
  deleteLibraryFile,
  duplicateLibraryFile,
  getLibraryFile,
  listLibraryFiles,
  renameLibraryFile,
  saveLibraryFile,
} from "../services/fileService";

export const libraryRouter = Router();
const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } });

libraryRouter.get("/", (_req, res) => {
  res.json({ data: listLibraryFiles() });
});

const metaSchema = z.object({
  name: z.string().min(1),
  fileType: z.enum(["txt", "pdf", "xlsx", "mikrotik-script"]),
  customer: z.string().optional(),
  profile: z.string().optional(),
  prefix: z.string().optional(),
  numberCount: z.coerce.number().int().optional(),
});

/** Frontend generates the file client-side (jsPDF/xlsx) then uploads it here to persist it. */
libraryRouter.post("/", upload.single("file"), (req, res) => {
  if (!req.file) throw new AppError(400, "لم يتم إرفاق أي ملف", "MISSING_FILE");
  const meta = metaSchema.parse(req.body);
  const saved = saveLibraryFile({ ...meta, content: req.file.buffer });
  res.status(201).json({ data: saved });
});

libraryRouter.get("/:id/download", (req, res) => {
  const file = getLibraryFile(req.params.id);
  if (!file || !fs.existsSync(file.stored_path)) {
    throw new AppError(404, "الملف غير موجود", "FILE_NOT_FOUND");
  }
  res.download(file.stored_path, file.name);
});

libraryRouter.patch("/:id", (req, res) => {
  const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
  renameLibraryFile(req.params.id, name);
  res.json({ data: getLibraryFile(req.params.id) });
});

libraryRouter.post("/:id/duplicate", (req, res) => {
  res.status(201).json({ data: duplicateLibraryFile(req.params.id) });
});

libraryRouter.delete("/:id", (req, res) => {
  deleteLibraryFile(req.params.id);
  res.status(204).send();
});
