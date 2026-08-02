import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { env } from "../config/env";
import { db } from "../db/database";
import { LibraryFileRecord } from "../types";

export interface SaveFileInput {
  name: string;
  fileType: LibraryFileRecord["file_type"];
  content: Buffer;
  customer?: string;
  profile?: string;
  prefix?: string;
  numberCount?: number;
}

export function saveLibraryFile(input: SaveFileInput): LibraryFileRecord {
  const id = randomUUID();
  const safeName = input.name.replace(/[^\w.\-\u0600-\u06FF]/g, "_");
  const storedPath = path.join(env.libraryPath, `${id}_${safeName}`);
  fs.writeFileSync(storedPath, input.content);

  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO library_files (id, name, file_type, stored_path, customer, profile, prefix, number_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.fileType,
    storedPath,
    input.customer ?? null,
    input.profile ?? null,
    input.prefix ?? null,
    input.numberCount ?? null,
    createdAt
  );

  return {
    id,
    name: input.name,
    file_type: input.fileType,
    stored_path: storedPath,
    customer: input.customer ?? null,
    profile: input.profile ?? null,
    prefix: input.prefix ?? null,
    number_count: input.numberCount ?? null,
    created_at: createdAt,
  };
}

export function listLibraryFiles(): LibraryFileRecord[] {
  return db
    .prepare("SELECT * FROM library_files ORDER BY created_at DESC")
    .all() as LibraryFileRecord[];
}

export function getLibraryFile(id: string): LibraryFileRecord | undefined {
  return db.prepare("SELECT * FROM library_files WHERE id = ?").get(id) as
    | LibraryFileRecord
    | undefined;
}

export function renameLibraryFile(id: string, newName: string): void {
  db.prepare("UPDATE library_files SET name = ? WHERE id = ?").run(newName, id);
}

export function deleteLibraryFile(id: string): void {
  const record = getLibraryFile(id);
  if (record && fs.existsSync(record.stored_path)) {
    fs.unlinkSync(record.stored_path);
  }
  db.prepare("DELETE FROM library_files WHERE id = ?").run(id);
}

export function duplicateLibraryFile(id: string): LibraryFileRecord {
  const record = getLibraryFile(id);
  if (!record) throw new Error("File not found");
  const content = fs.readFileSync(record.stored_path);
  return saveLibraryFile({
    name: `نسخة من ${record.name}`,
    fileType: record.file_type,
    content,
    customer: record.customer ?? undefined,
    profile: record.profile ?? undefined,
    prefix: record.prefix ?? undefined,
    numberCount: record.number_count ?? undefined,
  });
}
