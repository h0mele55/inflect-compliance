-- Epic C.4 — outbound audit-event streaming config.
ALTER TABLE "TenantSecuritySettings"
    ADD COLUMN "auditWebhookUrl" TEXT,
    ADD COLUMN "auditWebhookSecretEncrypted" TEXT;
