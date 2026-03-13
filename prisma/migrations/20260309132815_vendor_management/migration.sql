-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE', 'ONBOARDING', 'OFFBOARDING', 'OFFBOARDED');

-- CreateEnum
CREATE TYPE "VendorCriticality" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "VendorDataAccess" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "VendorDocumentType" AS ENUM ('CONTRACT', 'SOC2', 'ISO_CERT', 'DPA', 'SECURITY_POLICY', 'PEN_TEST', 'OTHER');

-- CreateEnum
CREATE TYPE "AnswerType" AS ENUM ('YES_NO', 'SINGLE_SELECT', 'MULTI_SELECT', 'TEXT', 'NUMBER');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VendorLinkEntityType" AS ENUM ('ASSET', 'RISK', 'ISSUE', 'CONTROL');

-- CreateEnum
CREATE TYPE "VendorLinkRelation" AS ENUM ('USES', 'STORES_DATA_FOR', 'PROVIDES_SERVICE_TO', 'MITIGATES', 'RELATED');

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "websiteUrl" TEXT,
    "domain" TEXT,
    "country" TEXT,
    "description" TEXT,
    "ownerUserId" TEXT,
    "status" "VendorStatus" NOT NULL DEFAULT 'ONBOARDING',
    "criticality" "VendorCriticality" NOT NULL DEFAULT 'MEDIUM',
    "inherentRisk" "VendorCriticality",
    "residualRisk" "VendorCriticality",
    "nextReviewAt" TIMESTAMP(3),
    "contractRenewalAt" TIMESTAMP(3),
    "dataAccess" "VendorDataAccess",
    "isSubprocessor" BOOLEAN NOT NULL DEFAULT false,
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "title" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "type" "VendorDocumentType" NOT NULL,
    "fileId" TEXT,
    "externalUrl" TEXT,
    "title" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "notes" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionnaireTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isGlobal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionnaireTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionnaireQuestion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "answerType" "AnswerType" NOT NULL,
    "optionsJson" JSONB,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "riskPointsJson" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuestionnaireQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorAssessment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "requestedByUserId" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "score" DOUBLE PRECISION,
    "riskRating" "VendorCriticality",
    "notes" TEXT,
    "nextReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorAssessmentAnswer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerJson" JSONB NOT NULL,
    "computedPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorAssessmentAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "entityType" "VendorLinkEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "relation" "VendorLinkRelation" NOT NULL DEFAULT 'RELATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vendor_tenantId_idx" ON "Vendor"("tenantId");

-- CreateIndex
CREATE INDEX "Vendor_tenantId_status_idx" ON "Vendor"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Vendor_tenantId_criticality_idx" ON "Vendor"("tenantId", "criticality");

-- CreateIndex
CREATE INDEX "Vendor_tenantId_nextReviewAt_idx" ON "Vendor"("tenantId", "nextReviewAt");

-- CreateIndex
CREATE INDEX "Vendor_tenantId_contractRenewalAt_idx" ON "Vendor"("tenantId", "contractRenewalAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_tenantId_name_key" ON "Vendor"("tenantId", "name");

-- CreateIndex
CREATE INDEX "VendorContact_tenantId_vendorId_idx" ON "VendorContact"("tenantId", "vendorId");

-- CreateIndex
CREATE INDEX "VendorDocument_tenantId_vendorId_idx" ON "VendorDocument"("tenantId", "vendorId");

-- CreateIndex
CREATE INDEX "VendorDocument_tenantId_vendorId_type_idx" ON "VendorDocument"("tenantId", "vendorId", "type");

-- CreateIndex
CREATE INDEX "VendorDocument_tenantId_validTo_idx" ON "VendorDocument"("tenantId", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireTemplate_key_key" ON "QuestionnaireTemplate"("key");

-- CreateIndex
CREATE INDEX "QuestionnaireQuestion_templateId_section_sortOrder_idx" ON "QuestionnaireQuestion"("templateId", "section", "sortOrder");

-- CreateIndex
CREATE INDEX "VendorAssessment_tenantId_vendorId_idx" ON "VendorAssessment"("tenantId", "vendorId");

-- CreateIndex
CREATE INDEX "VendorAssessment_tenantId_status_idx" ON "VendorAssessment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "VendorAssessment_tenantId_riskRating_idx" ON "VendorAssessment"("tenantId", "riskRating");

-- CreateIndex
CREATE INDEX "VendorAssessmentAnswer_tenantId_assessmentId_idx" ON "VendorAssessmentAnswer"("tenantId", "assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorAssessmentAnswer_assessmentId_questionId_key" ON "VendorAssessmentAnswer"("assessmentId", "questionId");

-- CreateIndex
CREATE INDEX "VendorLink_tenantId_vendorId_idx" ON "VendorLink"("tenantId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorLink_tenantId_vendorId_entityType_entityId_key" ON "VendorLink"("tenantId", "vendorId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorContact" ADD CONSTRAINT "VendorContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorContact" ADD CONSTRAINT "VendorContact_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDocument" ADD CONSTRAINT "VendorDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDocument" ADD CONSTRAINT "VendorDocument_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDocument" ADD CONSTRAINT "VendorDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireQuestion" ADD CONSTRAINT "QuestionnaireQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "QuestionnaireTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessment" ADD CONSTRAINT "VendorAssessment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessment" ADD CONSTRAINT "VendorAssessment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessment" ADD CONSTRAINT "VendorAssessment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "QuestionnaireTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessment" ADD CONSTRAINT "VendorAssessment_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessment" ADD CONSTRAINT "VendorAssessment_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessmentAnswer" ADD CONSTRAINT "VendorAssessmentAnswer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessmentAnswer" ADD CONSTRAINT "VendorAssessmentAnswer_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "VendorAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessmentAnswer" ADD CONSTRAINT "VendorAssessmentAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuestionnaireQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorLink" ADD CONSTRAINT "VendorLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorLink" ADD CONSTRAINT "VendorLink_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
