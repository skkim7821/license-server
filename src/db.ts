import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { databaseUrl, ensureDatabaseDirectory } from "./db/config";

ensureDatabaseDirectory(databaseUrl);

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
});
let initialized = false;

export async function initDb(): Promise<void> {
  if (initialized) {
    return;
  }

  await prisma.$connect();
  await prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL;");
  initialized = true;
}

export { prisma };
