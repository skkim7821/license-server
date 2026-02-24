import "dotenv/config";
import { execSync } from "node:child_process";
import { addDays } from "date-fns";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  databaseUrl,
  ensureDatabaseDirectory,
  clearSqliteFiles,
  resolveSqliteFile,
} from "./config";

const argv = process.argv.slice(2);
const shouldReset = argv.includes("--reset") || argv.includes("-r");
const skipSeed = argv.includes("--no-seed");

ensureDatabaseDirectory(databaseUrl);

const resolvedDatabasePath = resolveSqliteFile(databaseUrl);
const tempDatabasePath = resolvedDatabasePath ? `${resolvedDatabasePath}.tmp` : null;
const tempDatabaseUrl = tempDatabasePath ? pathToFileURL(tempDatabasePath).href : null;

async function seed(prisma: PrismaClient) {
  await prisma.licenseDevice.deleteMany();
  await prisma.license.deleteMany();
  await prisma.product.deleteMany();

  const product = await prisma.product.create({
    data: {
      code: "BASIC",
      name: "Basic Product",
      maxDevices: 3,
      defaultPeriod: 30,
    },
  });

  const license = await prisma.license.create({
    data: {
      email: "owner@example.com",
      productCode: product.code,
      expiresAt: addDays(new Date(), 30),
      status: "active",
      maxDevices: product.maxDevices,
    },
  });

  await prisma.licenseDevice.create({
    data: {
      licenseId: license.id,
      ipAddr: "127.0.0.1",
    },
  });

  console.log("Seeded sample license", license.id, "for product", product.code);
}

async function main() {
  if (shouldReset && tempDatabasePath) {
    fs.mkdirSync(path.dirname(tempDatabasePath), { recursive: true });
    clearSqliteFiles(tempDatabaseUrl!);
  } else if (shouldReset) {
    console.log("Resetting SQLite content for", databaseUrl);
    clearSqliteFiles(databaseUrl);
  }

  const pushUrl = tempDatabaseUrl ?? databaseUrl;
  console.log("Applying Prisma schema to", pushUrl);
  execSync("pnpm prisma db push", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: pushUrl,
    },
  });

  if (tempDatabasePath && resolvedDatabasePath) {
    console.log("Replacing old database with reset copy");
    clearSqliteFiles(databaseUrl);

    try {
      fs.renameSync(tempDatabasePath, resolvedDatabasePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    for (const suffix of ["-wal", "-shm"]) {
      const tempFile = `${tempDatabasePath}${suffix}`;
      const targetFile = `${resolvedDatabasePath}${suffix}`;
      try {
        fs.renameSync(tempFile, targetFile);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }
  }

  console.log("Generating Prisma client");
  execSync("pnpm prisma generate", {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  const generatedPath = new URL("../../generated/prisma/client.ts", import.meta.url).href;
  const { PrismaClient: Client } = await import(generatedPath);
  const prisma = new Client({
    adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
  });

  await prisma.$connect();
  if (!skipSeed) {
    await seed(prisma);
  }
  await prisma.$disconnect();
  console.log("Bootstrap complete:", databaseUrl);
}

main().catch((error) => {
  console.error("Bootstrap failed:", error);
  process.exit(1);
});
