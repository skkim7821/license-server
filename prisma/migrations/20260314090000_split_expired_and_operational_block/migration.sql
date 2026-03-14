-- Add a dedicated operational block status and block metadata fields.
ALTER TYPE "LicenseStatus" ADD VALUE IF NOT EXISTS 'suspended';

CREATE TYPE "LicenseBlockReason" AS ENUM (
  'abuse',
  'manual_review',
  'security_risk',
  'server_impact',
  'billing_issue',
  'other'
);

ALTER TABLE "License"
  ADD COLUMN "blockReason" "LicenseBlockReason",
  ADD COLUMN "blockedAt" TIMESTAMP(3),
  ADD COLUMN "blockedBy" TEXT,
  ADD COLUMN "blockNote" TEXT,
  ADD COLUMN "unblockedAt" TIMESTAMP(3),
  ADD COLUMN "unblockedBy" TEXT,
  ADD COLUMN "unblockedNote" TEXT;

-- Legacy `expired` rows with a future expiration are treated as operational blocks.
UPDATE "License"
SET
  "status" = 'suspended',
  "blockReason" = COALESCE("blockReason", 'manual_review'),
  "blockedAt" = COALESCE("blockedAt", NOW()),
  "blockedBy" = COALESCE("blockedBy", 'migration'),
  "blockNote" = COALESCE(
    "blockNote",
    'Migrated from legacy expired status with future expiresAt. Review and unsuspend/revoke explicitly.'
  )
WHERE "status" = 'expired' AND "expiresAt" > NOW();

-- Legacy `expired` rows that are truly time-expired are converted to active.
-- Expiration is now computed from expiresAt in verify/read responses.
UPDATE "License"
SET "status" = 'active'
WHERE "status" = 'expired' AND "expiresAt" <= NOW();
