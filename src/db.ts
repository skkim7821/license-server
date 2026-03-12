import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl =
  process.env["DATABASE_URL"] ?? "postgresql://license:license@localhost:5532/license_server?schema=public";

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma: any = new PrismaClient({ adapter });
let initialized = false;

export async function initDb(): Promise<void> {
  if (initialized) {
    return;
  }

  await prisma.$connect();
  initialized = true;
}

export { prisma };
