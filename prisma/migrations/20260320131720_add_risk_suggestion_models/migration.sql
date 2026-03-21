-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SuggestionSessionStatus" AS ENUM ('DRAFT', 'GENERATED', 'APPLIED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SuggestionItemStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EDITED');

-- CreateTable
CREATE TABLE "TenantOnboarding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "currentStep" TEXT NOT NULL DEFAULT 'COMPANY_PROFILE',
    "completedSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stepData" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskSuggestionSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "status" "SuggestionSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "inputJson" TEXT NOT NULL,
    "modelName" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'stub',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskSuggestionSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskSuggestionItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "threat" TEXT,
    "vulnerability" TEXT,
    "likelihoodSuggested" INTEGER,
    "impactSuggested" INTEGER,
    "rationale" TEXT,
    "suggestedControlsJson" TEXT,
    "status" "SuggestionItemStatus" NOT NULL DEFAULT 'PENDING',
    "editedJson" TEXT,
    "createdRiskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskSuggestionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantOnboarding_tenantId_key" ON "TenantOnboarding"("tenantId");

-- CreateIndex
CREATE INDEX "RiskSuggestionSession_tenantId_idx" ON "RiskSuggestionSession"("tenantId");

-- CreateIndex
CREATE INDEX "RiskSuggestionSession_tenantId_createdAt_idx" ON "RiskSuggestionSession"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "RiskSuggestionSession_tenantId_status_idx" ON "RiskSuggestionSession"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RiskSuggestionItem_sessionId_idx" ON "RiskSuggestionItem"("sessionId");

-- CreateIndex
CREATE INDEX "RiskSuggestionItem_tenantId_idx" ON "RiskSuggestionItem"("tenantId");

-- CreateIndex
CREATE INDEX "RiskSuggestionItem_tenantId_sessionId_idx" ON "RiskSuggestionItem"("tenantId", "sessionId");

-- AddForeignKey
ALTER TABLE "TenantOnboarding" ADD CONSTRAINT "TenantOnboarding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSuggestionSession" ADD CONSTRAINT "RiskSuggestionSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSuggestionSession" ADD CONSTRAINT "RiskSuggestionSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSuggestionItem" ADD CONSTRAINT "RiskSuggestionItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSuggestionItem" ADD CONSTRAINT "RiskSuggestionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RiskSuggestionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSuggestionItem" ADD CONSTRAINT "RiskSuggestionItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
