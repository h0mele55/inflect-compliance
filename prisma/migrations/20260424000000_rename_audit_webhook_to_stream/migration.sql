-- Rename Epic C.4 audit-stream columns on TenantSecuritySettings.
-- Pure rename — ALTER TABLE ... RENAME COLUMN preserves all existing
-- tenant configuration rows. No data loss.
ALTER TABLE "TenantSecuritySettings" RENAME COLUMN "auditWebhookUrl" TO "auditStreamUrl";
ALTER TABLE "TenantSecuritySettings" RENAME COLUMN "auditWebhookSecretEncrypted" TO "auditStreamSecretEncrypted";
