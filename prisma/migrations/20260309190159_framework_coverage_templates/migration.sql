/*
  Warnings:

  - A unique constraint covering the columns `[key,version]` on the table `Framework` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "FrameworkKind" AS ENUM ('ISO_STANDARD', 'EU_DIRECTIVE');

-- DropIndex
DROP INDEX "Framework_key_key";

-- AlterTable
ALTER TABLE "Framework" ADD COLUMN     "kind" "FrameworkKind" NOT NULL DEFAULT 'ISO_STANDARD';

-- AlterTable
ALTER TABLE "FrameworkRequirement" ADD COLUMN     "section" TEXT;

-- CreateTable
CREATE TABLE "ControlRequirementLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlRequirementLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ControlRequirementLink_tenantId_requirementId_idx" ON "ControlRequirementLink"("tenantId", "requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlRequirementLink_controlId_requirementId_key" ON "ControlRequirementLink"("controlId", "requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "Framework_key_version_key" ON "Framework"("key", "version");

-- AddForeignKey
ALTER TABLE "ControlRequirementLink" ADD CONSTRAINT "ControlRequirementLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlRequirementLink" ADD CONSTRAINT "ControlRequirementLink_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlRequirementLink" ADD CONSTRAINT "ControlRequirementLink_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "FrameworkRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
