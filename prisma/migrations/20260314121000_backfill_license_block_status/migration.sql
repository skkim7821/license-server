-- Backfill legacy expired rows after the suspended enum value exists in a committed migration.
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

-- Expiration is now computed from expiresAt in verify/read responses.
UPDATE "License"
SET "status" = 'active'
WHERE "status" = 'expired' AND "expiresAt" <= NOW();
