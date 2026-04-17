-- Add digest notification type enum values
-- These values are required by the digest-dispatcher to write
-- grouped notification records to the outbox.
--
-- Without this migration, any INSERT to NotificationOutbox with
-- type = DEADLINE_DIGEST | EVIDENCE_EXPIRY_DIGEST | VENDOR_RENEWAL_DIGEST
-- will fail with a Postgres enum constraint violation.

ALTER TYPE "EmailNotificationType" ADD VALUE IF NOT EXISTS 'DEADLINE_DIGEST';
ALTER TYPE "EmailNotificationType" ADD VALUE IF NOT EXISTS 'EVIDENCE_EXPIRY_DIGEST';
ALTER TYPE "EmailNotificationType" ADD VALUE IF NOT EXISTS 'VENDOR_RENEWAL_DIGEST';
