-- Add ownerUserId to Evidence for real user-linked ownership
-- The legacy 'owner' text field is kept for backward compatibility
-- but ownerUserId is the source of truth for due-item routing

ALTER TABLE "Evidence" ADD COLUMN "ownerUserId" TEXT;

-- Foreign key to User
ALTER TABLE "Evidence"
  ADD CONSTRAINT "Evidence_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Index for efficient owner-scoped queries within a tenant
CREATE INDEX "Evidence_tenantId_ownerUserId_idx" ON "Evidence"("tenantId", "ownerUserId");
