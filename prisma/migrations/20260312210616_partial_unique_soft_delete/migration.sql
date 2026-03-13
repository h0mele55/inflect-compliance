-- Partial Unique Indexes for Soft Delete
-- Allows reuse of unique values (name, slug) after soft-deleting a record.
-- Only active records (deletedAt IS NULL) enforce uniqueness.

-- Asset: replace full unique with partial unique
DROP INDEX IF EXISTS "Asset_tenantId_name_key";
CREATE UNIQUE INDEX "Asset_tenantId_name_key" ON "Asset"("tenantId", "name") WHERE "deletedAt" IS NULL;

-- Policy: replace full unique with partial unique
DROP INDEX IF EXISTS "Policy_tenantId_slug_key";
CREATE UNIQUE INDEX "Policy_tenantId_slug_key" ON "Policy"("tenantId", "slug") WHERE "deletedAt" IS NULL;