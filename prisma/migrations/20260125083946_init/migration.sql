-- CreateTable
CREATE TABLE "Product" (
  "code" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "maxDevices" INTEGER NOT NULL,
  "defaultPeriod" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "License" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "productCode" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "maxDevices" INTEGER NOT NULL,
  CONSTRAINT "License_productCode_fkey" FOREIGN KEY ("productCode") REFERENCES "Product" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LicenseDevice" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "licenseId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LicenseDevice_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "License_email_productCode_key" ON "License"("email", "productCode");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseDevice_licenseId_fingerprint_key" ON "LicenseDevice"("licenseId", "fingerprint");
