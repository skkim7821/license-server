-- Add a dedicated operational block status and block metadata fields.
ALTER TYPE "LicenseStatus" ADD VALUE IF NOT EXISTS 'suspended';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'LicenseBlockReason'
  ) THEN
    CREATE TYPE "LicenseBlockReason" AS ENUM (
      'abuse',
      'manual_review',
      'security_risk',
      'server_impact',
      'billing_issue',
      'other'
    );
  END IF;
END $$;

ALTER TABLE "License"
  ADD COLUMN IF NOT EXISTS "blockReason" "LicenseBlockReason",
  ADD COLUMN IF NOT EXISTS "blockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "blockedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "blockNote" TEXT,
  ADD COLUMN IF NOT EXISTS "unblockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "unblockedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "unblockedNote" TEXT;

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
