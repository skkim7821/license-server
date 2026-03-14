-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('active', 'suspended', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "LicenseBlockReason" AS ENUM ('abuse', 'manual_review', 'security_risk', 'server_impact', 'billing_issue', 'other');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'operator');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('active', 'disabled');

-- CreateTable
CREATE TABLE "Product" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxDevices" INTEGER NOT NULL,
    "defaultPeriod" INTEGER NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'super_admin',
    "status" "AdminStatus" NOT NULL DEFAULT 'active',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "productCode" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'active',
    "blockReason" "LicenseBlockReason",
    "blockedAt" TIMESTAMP(3),
    "blockedBy" TEXT,
    "blockNote" TEXT,
    "unblockedAt" TIMESTAMP(3),
    "unblockedBy" TEXT,
    "unblockedNote" TEXT,
    "maxDevices" INTEGER NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseDevice" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "ipAddr" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "License_licenseKey_key" ON "License"("licenseKey");

-- CreateIndex
CREATE UNIQUE INDEX "License_email_productCode_key" ON "License"("email", "productCode");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseDevice_licenseId_ipAddr_key" ON "LicenseDevice"("licenseId", "ipAddr");

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_productCode_fkey" FOREIGN KEY ("productCode") REFERENCES "Product"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseDevice" ADD CONSTRAINT "LicenseDevice_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
