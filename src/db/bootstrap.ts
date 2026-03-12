import "dotenv/config";
import { execSync } from "node:child_process";
import { addDays } from "date-fns";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { generateLicenseKey } from "../utils/license-key";
import { hashPassword } from "../utils/password";

const databaseUrl = process.env["DATABASE_URL"];

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set");
}

const argv = process.argv.slice(2);
const shouldReset = argv.includes("--reset") || argv.includes("-r");
const skipSeed = argv.includes("--no-seed");
const seedOnly = argv.includes("--seed-only");
const seedModeArg = argv.find((arg) => arg.startsWith("--seed-mode="));
const seedMode = seedModeArg?.split("=")[1] === "prod" ? "prod" : "dev";

async function seedAdmin(prisma: any) {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim() || "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "change_me_password";

  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: hashPassword(adminPassword),
      role: "super_admin",
      status: "active",
    },
    create: {
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      role: "super_admin",
      status: "active",
    },
  });
}

async function seedDev(prisma: any) {
  await prisma.licenseDevice.deleteMany();
  await prisma.license.deleteMany();
  await prisma.user.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.product.deleteMany();

  const product = await prisma.product.create({
    data: {
      code: "BASIC",
      name: "Basic Product",
      maxDevices: 3,
      defaultPeriod: 30,
    },
  });

  const user = await prisma.user.create({
    data: {
      email: "owner@example.com",
      name: "Sample Owner",
    },
  });

  const license = await prisma.license.create({
    data: {
      licenseKey: generateLicenseKey(),
      email: user.email,
      userId: user.id,
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

  await seedAdmin(prisma);

  console.log("Seeded sample license", license.id, "for product", product.code);
}

async function seedProd(prisma: any) {
  await seedAdmin(prisma);
  console.log("Seeded production admin account only");
}

async function main() {
  if (!seedOnly) {
    if (shouldReset) {
      console.log("Resetting database using Prisma migrate reset:", databaseUrl);
      execSync("pnpm prisma migrate reset --force --skip-seed --skip-generate", {
        cwd: process.cwd(),
        stdio: "inherit",
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
        },
      });
    } else {
      console.log("Applying migrations:", databaseUrl);
      execSync("pnpm prisma migrate deploy", {
        cwd: process.cwd(),
        stdio: "inherit",
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
        },
      });
    }

    console.log("Generating Prisma client");
    execSync("pnpm prisma generate", {
      cwd: process.cwd(),
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    });
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma: any = new PrismaClient({ adapter });

  await prisma.$connect();
  if (!skipSeed) {
    if (seedMode === "prod") {
      await seedProd(prisma);
    } else {
      await seedDev(prisma);
    }
  }
  await prisma.$disconnect();
  console.log("Bootstrap complete:", databaseUrl, "seedMode=", seedMode);
}

main().catch((error) => {
  console.error("Bootstrap failed:", error);
  process.exit(1);
});
