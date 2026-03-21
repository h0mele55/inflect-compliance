-- Add tenantId to PolicyVersion
-- Step 1: Add nullable column
ALTER TABLE "PolicyVersion" ADD COLUMN "tenantId" TEXT;

-- Step 2: Backfill from parent Policy
UPDATE "PolicyVersion"
SET "tenantId" = (
    SELECT "tenantId" FROM "Policy" WHERE "Policy".id = "PolicyVersion"."policyId"
)
WHERE "tenantId" IS NULL;

-- Step 3: Make NOT NULL
ALTER TABLE "PolicyVersion" ALTER COLUMN "tenantId" SET NOT NULL;

-- Step 4: Add FK constraint
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 5: Add index for RLS performance
CREATE INDEX "PolicyVersion_tenantId_idx" ON "PolicyVersion"("tenantId");
