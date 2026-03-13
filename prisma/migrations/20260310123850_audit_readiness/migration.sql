-- CreateEnum
CREATE TYPE "AuditCycleStatus" AS ENUM ('PLANNING', 'IN_PROGRESS', 'READY', 'COMPLETE');

-- CreateEnum
CREATE TYPE "AuditPackStatus" AS ENUM ('DRAFT', 'FROZEN', 'EXPORTED');

-- CreateEnum
CREATE TYPE "AuditorStatus" AS ENUM ('INVITED', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "AuditPackItemEntityType" AS ENUM ('CONTROL', 'POLICY', 'EVIDENCE', 'FILE', 'ISSUE', 'READINESS_REPORT', 'FRAMEWORK_COVERAGE');

-- CreateTable
CREATE TABLE "AuditCycle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "frameworkKey" TEXT NOT NULL,
    "frameworkVersion" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodStartAt" TIMESTAMP(3),
    "periodEndAt" TIMESTAMP(3),
    "status" "AuditCycleStatus" NOT NULL DEFAULT 'PLANNING',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPack" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "auditCycleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AuditPackStatus" NOT NULL DEFAULT 'DRAFT',
    "frozenAt" TIMESTAMP(3),
    "frozenByUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPackItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "auditPackId" TEXT NOT NULL,
    "entityType" "AuditPackItemEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditPackItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPackShare" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "auditPackId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditPackShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditorAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" "AuditorStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditorAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditorPackAccess" (
    "id" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "auditPackId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditorPackAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditCycle_tenantId_frameworkKey_status_idx" ON "AuditCycle"("tenantId", "frameworkKey", "status");

-- CreateIndex
CREATE INDEX "AuditPack_tenantId_auditCycleId_idx" ON "AuditPack"("tenantId", "auditCycleId");

-- CreateIndex
CREATE INDEX "AuditPackItem_tenantId_auditPackId_idx" ON "AuditPackItem"("tenantId", "auditPackId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditPackItem_auditPackId_entityType_entityId_key" ON "AuditPackItem"("auditPackId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditPackShare_tokenHash_idx" ON "AuditPackShare"("tokenHash");

-- CreateIndex
CREATE INDEX "AuditPackShare_tenantId_auditPackId_idx" ON "AuditPackShare"("tenantId", "auditPackId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditorAccount_tenantId_email_key" ON "AuditorAccount"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "AuditorPackAccess_auditorId_auditPackId_key" ON "AuditorPackAccess"("auditorId", "auditPackId");

-- AddForeignKey
ALTER TABLE "AuditCycle" ADD CONSTRAINT "AuditCycle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditCycle" ADD CONSTRAINT "AuditCycle_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPack" ADD CONSTRAINT "AuditPack_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPack" ADD CONSTRAINT "AuditPack_auditCycleId_fkey" FOREIGN KEY ("auditCycleId") REFERENCES "AuditCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPack" ADD CONSTRAINT "AuditPack_frozenByUserId_fkey" FOREIGN KEY ("frozenByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPackItem" ADD CONSTRAINT "AuditPackItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPackItem" ADD CONSTRAINT "AuditPackItem_auditPackId_fkey" FOREIGN KEY ("auditPackId") REFERENCES "AuditPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPackShare" ADD CONSTRAINT "AuditPackShare_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPackShare" ADD CONSTRAINT "AuditPackShare_auditPackId_fkey" FOREIGN KEY ("auditPackId") REFERENCES "AuditPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPackShare" ADD CONSTRAINT "AuditPackShare_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorAccount" ADD CONSTRAINT "AuditorAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorPackAccess" ADD CONSTRAINT "AuditorPackAccess_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "AuditorAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorPackAccess" ADD CONSTRAINT "AuditorPackAccess_auditPackId_fkey" FOREIGN KEY ("auditPackId") REFERENCES "AuditPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
