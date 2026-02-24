import fs from "node:fs";
import path from "node:path";

const NODE_ENV = process.env["NODE_ENV"]?.toLowerCase() || "development";
const defaultDatabaseFile = NODE_ENV === "production" ? "db/prod.db" : "db/dev.db";
const defaultDatabaseUrl = `file:./${defaultDatabaseFile}`;

export const databaseUrl = process.env["DATABASE_URL"] ?? defaultDatabaseUrl;

export function resolveSqliteFile(url: string): string | null {
  if (!url.startsWith("file:")) {
    return null;
  }

  const rawPath = url.slice("file:".length);
  if (!rawPath || rawPath.startsWith(":memory")) {
    return null;
  }

  return path.resolve(process.cwd(), rawPath);
}

export function ensureDatabaseDirectory(url: string): void {
  const resolved = resolveSqliteFile(url);
  if (resolved) {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
  }
}

export function clearSqliteFiles(url: string): void {
  const resolved = resolveSqliteFile(url);
  if (!resolved) {
    return;
  }

  try {
    fs.rmSync(resolved, { force: true });
  } catch {
    // ignore
  }

  for (const suffix of ["-wal", "-shm"]) {
    const journalPath = `${resolved}${suffix}`;
    try {
      fs.rmSync(journalPath, { force: true });
    } catch {
      // ignore
    }
  }
}
