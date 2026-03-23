-- Add encrypted + hash companion columns for PII fields (Epic 8: Column Encryption)
-- Dual-write strategy: plaintext columns preserved during migration period.

-- ─── User ───
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailEncrypted" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nameEncrypted" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_emailHash_key" ON "User"("emailHash");

-- ─── VendorContact ───
ALTER TABLE "VendorContact" ADD COLUMN IF NOT EXISTS "nameEncrypted" TEXT;
ALTER TABLE "VendorContact" ADD COLUMN IF NOT EXISTS "emailEncrypted" TEXT;
ALTER TABLE "VendorContact" ADD COLUMN IF NOT EXISTS "emailHash" TEXT;
ALTER TABLE "VendorContact" ADD COLUMN IF NOT EXISTS "phoneEncrypted" TEXT;

-- ─── AuditorAccount ───
ALTER TABLE "AuditorAccount" ADD COLUMN IF NOT EXISTS "emailEncrypted" TEXT;
ALTER TABLE "AuditorAccount" ADD COLUMN IF NOT EXISTS "emailHash" TEXT;
ALTER TABLE "AuditorAccount" ADD COLUMN IF NOT EXISTS "nameEncrypted" TEXT;
CREATE INDEX IF NOT EXISTS "AuditorAccount_emailHash_idx" ON "AuditorAccount"("emailHash");

-- ─── NotificationOutbox ───
ALTER TABLE "NotificationOutbox" ADD COLUMN IF NOT EXISTS "toEmailEncrypted" TEXT;

-- ─── UserIdentityLink ───
ALTER TABLE "UserIdentityLink" ADD COLUMN IF NOT EXISTS "emailAtLinkTimeEncrypted" TEXT;
ALTER TABLE "UserIdentityLink" ADD COLUMN IF NOT EXISTS "emailAtLinkTimeHash" TEXT;
