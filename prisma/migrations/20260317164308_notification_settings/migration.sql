-- CreateEnum
CREATE TYPE "EmailNotificationType" AS ENUM ('TASK_ASSIGNED', 'EVIDENCE_EXPIRING', 'POLICY_APPROVAL_REQUESTED', 'POLICY_APPROVED', 'POLICY_REJECTED');

-- CreateEnum
CREATE TYPE "EmailOutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationDelivery" AS ENUM ('IMMEDIATE', 'DAILY_DIGEST', 'DISABLED');

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "EmailNotificationType" NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sendAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "dedupeKey" TEXT NOT NULL,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantNotificationSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultFromName" TEXT NOT NULL DEFAULT 'Inflect Compliance',
    "defaultFromEmail" TEXT NOT NULL DEFAULT 'noreply@inflect.app',
    "complianceMailbox" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantNotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "delivery" "NotificationDelivery" NOT NULL DEFAULT 'IMMEDIATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_dedupeKey_key" ON "NotificationOutbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_sendAfter_idx" ON "NotificationOutbox"("status", "sendAfter");

-- CreateIndex
CREATE INDEX "NotificationOutbox_tenantId_idx" ON "NotificationOutbox"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantNotificationSettings_tenantId_key" ON "TenantNotificationSettings"("tenantId");

-- CreateIndex
CREATE INDEX "UserNotificationPreference_tenantId_idx" ON "UserNotificationPreference"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationPreference_userId_tenantId_key" ON "UserNotificationPreference"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "Asset_tenantId_createdAt_idx" ON "Asset"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Control_tenantId_createdAt_idx" ON "Control"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Evidence_tenantId_createdAt_idx" ON "Evidence"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Policy_tenantId_createdAt_idx" ON "Policy"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Policy_tenantId_category_idx" ON "Policy"("tenantId", "category");

-- CreateIndex
CREATE INDEX "Risk_tenantId_createdAt_idx" ON "Risk"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Risk_tenantId_category_idx" ON "Risk"("tenantId", "category");

-- CreateIndex
CREATE INDEX "Task_tenantId_createdAt_idx" ON "Task"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Vendor_tenantId_createdAt_idx" ON "Vendor"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantNotificationSettings" ADD CONSTRAINT "TenantNotificationSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
