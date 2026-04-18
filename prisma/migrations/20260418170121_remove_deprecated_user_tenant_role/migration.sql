-- Remove deprecated User.tenantId and User.role columns.
-- TenantMembership is now the sole source of truth for tenant/role binding.
--
-- Safety: All code paths have been migrated to read from TenantMembership.
-- This migration only removes the columns after code is updated.

-- Step 1: Drop the FK constraint on User.tenantId → Tenant.id
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_tenantId_fkey";

-- Step 2: Drop the columns
ALTER TABLE "User" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "role";
