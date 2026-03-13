-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "metadataJson" JSONB,
ADD COLUMN     "recordIds" JSONB,
ADD COLUMN     "requestId" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entity_idx" ON "AuditLog"("tenantId", "entity");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_action_idx" ON "AuditLog"("tenantId", "action");
