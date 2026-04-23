-- Epic C.3 — concurrent session limit policy.
ALTER TABLE "TenantSecuritySettings"
    ADD COLUMN "maxConcurrentSessions" INTEGER;
