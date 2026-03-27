-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'DEACTIVATED', 'REMOVED');

-- CreateEnum
CREATE TYPE "IntegrationExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'ERROR');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "accessTokenEncrypted" TEXT,
ADD COLUMN     "refreshTokenEncrypted" TEXT;

-- AlterTable
ALTER TABLE "Asset" ALTER COLUMN "retentionUntil" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Audit" ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AuditCycle" ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "actorType" TEXT NOT NULL DEFAULT 'USER',
ADD COLUMN     "detailsJson" JSONB,
ADD COLUMN     "entryHash" TEXT,
ADD COLUMN     "previousHash" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "AuditPack" ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Control" ALTER COLUMN "retentionUntil" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FileRecord" ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "retentionUntil" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Finding" ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Policy" ALTER COLUMN "retentionUntil" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Risk" ALTER COLUMN "retentionUntil" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "retentionUntil" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TenantMembership" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "invitedAt" TIMESTAMP(3),
ADD COLUMN     "invitedByUserId" TEXT,
ADD COLUMN     "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Vendor" ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "retentionUntil" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TenantInvite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'READER',
    "token" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantScimToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantScimToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "configJson" JSONB NOT NULL DEFAULT '{}',
    "secretEncrypted" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationExecution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT,
    "provider" TEXT NOT NULL,
    "automationKey" TEXT NOT NULL,
    "controlId" TEXT,
    "status" "IntegrationExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "resultJson" JSONB,
    "evidenceId" TEXT,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "triggeredBy" TEXT NOT NULL DEFAULT 'scheduled',
    "jobRunId" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationWebhookEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "provider" TEXT NOT NULL,
    "eventType" TEXT,
    "payloadJson" JSONB NOT NULL,
    "headersJson" JSONB,
    "payloadHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvite_token_key" ON "TenantInvite"("token");

-- CreateIndex
CREATE INDEX "TenantInvite_token_idx" ON "TenantInvite"("token");

-- CreateIndex
CREATE INDEX "TenantInvite_tenantId_idx" ON "TenantInvite"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvite_tenantId_email_key" ON "TenantInvite"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "TenantScimToken_tokenHash_key" ON "TenantScimToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TenantScimToken_tenantId_idx" ON "TenantScimToken"("tenantId");

-- CreateIndex
CREATE INDEX "IntegrationConnection_tenantId_idx" ON "IntegrationConnection"("tenantId");

-- CreateIndex
CREATE INDEX "IntegrationConnection_tenantId_provider_idx" ON "IntegrationConnection"("tenantId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_tenantId_provider_name_key" ON "IntegrationConnection"("tenantId", "provider", "name");

-- CreateIndex
CREATE INDEX "IntegrationExecution_tenantId_idx" ON "IntegrationExecution"("tenantId");

-- CreateIndex
CREATE INDEX "IntegrationExecution_tenantId_automationKey_idx" ON "IntegrationExecution"("tenantId", "automationKey");

-- CreateIndex
CREATE INDEX "IntegrationExecution_tenantId_controlId_idx" ON "IntegrationExecution"("tenantId", "controlId");

-- CreateIndex
CREATE INDEX "IntegrationExecution_tenantId_status_idx" ON "IntegrationExecution"("tenantId", "status");

-- CreateIndex
CREATE INDEX "IntegrationExecution_jobRunId_idx" ON "IntegrationExecution"("jobRunId");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_tenantId_idx" ON "IntegrationWebhookEvent"("tenantId");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_provider_receivedAt_idx" ON "IntegrationWebhookEvent"("provider", "receivedAt");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_provider_payloadHash_createdAt_idx" ON "IntegrationWebhookEvent"("provider", "payloadHash", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_status_idx" ON "IntegrationWebhookEvent"("status");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entryHash_idx" ON "AuditLog"("tenantId", "entryHash");

-- CreateIndex
CREATE INDEX "TenantMembership_tenantId_status_idx" ON "TenantMembership"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantInvite" ADD CONSTRAINT "TenantInvite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantInvite" ADD CONSTRAINT "TenantInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantScimToken" ADD CONSTRAINT "TenantScimToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationExecution" ADD CONSTRAINT "IntegrationExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationExecution" ADD CONSTRAINT "IntegrationExecution_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationExecution" ADD CONSTRAINT "IntegrationExecution_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWebhookEvent" ADD CONSTRAINT "IntegrationWebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
