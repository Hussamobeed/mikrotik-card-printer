import dotenv from "dotenv";
import path from "path";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  encryptionKey: required(
    "ENCRYPTION_KEY",
    process.env.NODE_ENV === "production" ? undefined : "0".repeat(64)
  ),
  jwtSecret: required(
    "JWT_SECRET",
    process.env.NODE_ENV === "production" ? undefined : "dev-secret"
  ),
  databasePath: path.resolve(process.env.DATABASE_PATH ?? "./data/hersnnet.db"),
  libraryPath: path.resolve(process.env.LIBRARY_PATH ?? "./data/library"),
  logLevel: process.env.LOG_LEVEL ?? "info",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
};
