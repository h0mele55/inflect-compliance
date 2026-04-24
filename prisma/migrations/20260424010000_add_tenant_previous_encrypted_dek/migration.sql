-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "previousEncryptedDek" TEXT;

-- CHECK constraint: reject rows where both DEK columns carry the
-- same ciphertext. A rotation bug that writes identical values
-- would leave "old key" and "new key" indistinguishable on the
-- decrypt path — silent key mixing. DB-level guard.
ALTER TABLE "Tenant"
    ADD CONSTRAINT "Tenant_previousEncryptedDek_differs"
    CHECK ("previousEncryptedDek" IS NULL OR "previousEncryptedDek" != "encryptedDek");

-- Partial index: a future "sweep pending rotations" operation
-- only cares about tenants with a non-NULL previousEncryptedDek.
-- Keeps that query O(in-flight) instead of O(tenants).
CREATE INDEX IF NOT EXISTS "Tenant_rotation_in_flight_idx"
    ON "Tenant"("id") WHERE "previousEncryptedDek" IS NOT NULL;
