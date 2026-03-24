ALTER TABLE "LicenseDevice" RENAME COLUMN "ipAddr" TO "deviceId";

DROP INDEX "LicenseDevice_licenseId_ipAddr_key";

CREATE UNIQUE INDEX "LicenseDevice_licenseId_deviceId_key" ON "LicenseDevice"("licenseId", "deviceId");
