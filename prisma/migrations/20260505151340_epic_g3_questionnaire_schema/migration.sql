-- Epic G-3 — Vendor Risk Questionnaire Builder (schema foundation)
--
-- Adds the normalized questionnaire template structure and the
-- send-and-collect lifecycle fields on VendorAssessment. Purely
-- additive: every new column on existing tables is nullable or
-- carries a backward-compatible default; no columns are dropped or
-- renamed; the legacy QuestionnaireTemplate / QuestionnaireQuestion
-- tables remain untouched so existing approval-flow callers
-- (AssessmentRepository, /vendors/questionnaires/templates routes)
-- keep working unchanged.

-- AlterEnum — extend AnswerType with SCALE + FILE_UPLOAD
ALTER TYPE "AnswerType" ADD VALUE 'SCALE';
ALTER TYPE "AnswerType" ADD VALUE 'FILE_UPLOAD';

-- AlterEnum — extend AssessmentStatus with the G-3 lifecycle.
-- Existing legacy values (DRAFT/IN_REVIEW/APPROVED/REJECTED) stay
-- valid; new code paths drive DRAFT → SENT → IN_PROGRESS →
-- SUBMITTED → REVIEWED → CLOSED.
ALTER TYPE "AssessmentStatus" ADD VALUE 'SENT';
ALTER TYPE "AssessmentStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "AssessmentStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "AssessmentStatus" ADD VALUE 'REVIEWED';
ALTER TYPE "AssessmentStatus" ADD VALUE 'CLOSED';

-- AlterTable — VendorAssessment lifecycle fields
ALTER TABLE "VendorAssessment" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedByUserId" TEXT,
ADD COLUMN     "externalAccessTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "externalAccessTokenHash" TEXT,
ADD COLUMN     "respondentEmail" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUserId" TEXT,
ADD COLUMN     "reviewerNotes" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentByUserId" TEXT,
ADD COLUMN     "templateVersionId" TEXT;

-- AlterTable — reviewer override + evidence FK on answers
ALTER TABLE "VendorAssessmentAnswer" ADD COLUMN     "evidenceId" TEXT,
ADD COLUMN     "reviewerNotes" TEXT,
ADD COLUMN     "reviewerOverridePoints" DOUBLE PRECISION,
ADD COLUMN     "templateQuestionId" TEXT;

-- CreateTable — VendorAssessmentTemplate
CREATE TABLE "VendorAssessmentTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isLatestVersion" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorAssessmentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable — VendorAssessmentTemplateSection
CREATE TABLE "VendorAssessmentTemplateSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "weight" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorAssessmentTemplateSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable — VendorAssessmentTemplateQuestion
CREATE TABLE "VendorAssessmentTemplateQuestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "prompt" TEXT NOT NULL,
    "answerType" "AnswerType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "optionsJson" JSONB,
    "scaleConfigJson" JSONB,
    "riskPointsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorAssessmentTemplateQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorAssessmentTemplate_tenantId_idx" ON "VendorAssessmentTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "VendorAssessmentTemplate_tenantId_isLatestVersion_idx" ON "VendorAssessmentTemplate"("tenantId", "isLatestVersion");

-- CreateIndex
CREATE INDEX "VendorAssessmentTemplate_tenantId_isPublished_idx" ON "VendorAssessmentTemplate"("tenantId", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "VendorAssessmentTemplate_tenantId_key_version_key" ON "VendorAssessmentTemplate"("tenantId", "key", "version");

-- CreateIndex
CREATE INDEX "VendorAssessmentTemplateSection_tenantId_templateId_sortOrd_idx" ON "VendorAssessmentTemplateSection"("tenantId", "templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "VendorAssessmentTemplateQuestion_tenantId_templateId_sortOr_idx" ON "VendorAssessmentTemplateQuestion"("tenantId", "templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "VendorAssessmentTemplateQuestion_tenantId_sectionId_sortOrd_idx" ON "VendorAssessmentTemplateQuestion"("tenantId", "sectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "VendorAssessment_externalAccessTokenHash_idx" ON "VendorAssessment"("externalAccessTokenHash");

-- CreateIndex
CREATE INDEX "VendorAssessmentAnswer_tenantId_templateQuestionId_idx" ON "VendorAssessmentAnswer"("tenantId", "templateQuestionId");

-- AddForeignKey
ALTER TABLE "VendorAssessmentTemplate" ADD CONSTRAINT "VendorAssessmentTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessmentTemplate" ADD CONSTRAINT "VendorAssessmentTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessmentTemplateSection" ADD CONSTRAINT "VendorAssessmentTemplateSection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessmentTemplateSection" ADD CONSTRAINT "VendorAssessmentTemplateSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "VendorAssessmentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessmentTemplateQuestion" ADD CONSTRAINT "VendorAssessmentTemplateQuestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessmentTemplateQuestion" ADD CONSTRAINT "VendorAssessmentTemplateQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "VendorAssessmentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessmentTemplateQuestion" ADD CONSTRAINT "VendorAssessmentTemplateQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "VendorAssessmentTemplateSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessment" ADD CONSTRAINT "VendorAssessment_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessment" ADD CONSTRAINT "VendorAssessment_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessment" ADD CONSTRAINT "VendorAssessment_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessment" ADD CONSTRAINT "VendorAssessment_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "VendorAssessmentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessmentAnswer" ADD CONSTRAINT "VendorAssessmentAnswer_templateQuestionId_fkey" FOREIGN KEY ("templateQuestionId") REFERENCES "VendorAssessmentTemplateQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssessmentAnswer" ADD CONSTRAINT "VendorAssessmentAnswer_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
