-- CreateTable
CREATE TABLE "VendorEvidenceBundle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "frozenAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorEvidenceBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorEvidenceBundleItem" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "snapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorEvidenceBundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorRelationship" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "primaryVendorId" TEXT NOT NULL,
    "subprocessorVendorId" TEXT NOT NULL,
    "purpose" TEXT,
    "dataTypes" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorEvidenceBundle_tenantId_vendorId_idx" ON "VendorEvidenceBundle"("tenantId", "vendorId");

-- CreateIndex
CREATE INDEX "VendorEvidenceBundleItem_tenantId_bundleId_idx" ON "VendorEvidenceBundleItem"("tenantId", "bundleId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorEvidenceBundleItem_bundleId_entityType_entityId_key" ON "VendorEvidenceBundleItem"("bundleId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "VendorRelationship_tenantId_primaryVendorId_idx" ON "VendorRelationship"("tenantId", "primaryVendorId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorRelationship_tenantId_primaryVendorId_subprocessorVen_key" ON "VendorRelationship"("tenantId", "primaryVendorId", "subprocessorVendorId");

-- AddForeignKey
ALTER TABLE "VendorEvidenceBundle" ADD CONSTRAINT "VendorEvidenceBundle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorEvidenceBundle" ADD CONSTRAINT "VendorEvidenceBundle_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorEvidenceBundle" ADD CONSTRAINT "VendorEvidenceBundle_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorEvidenceBundleItem" ADD CONSTRAINT "VendorEvidenceBundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "VendorEvidenceBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorEvidenceBundleItem" ADD CONSTRAINT "VendorEvidenceBundleItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRelationship" ADD CONSTRAINT "VendorRelationship_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRelationship" ADD CONSTRAINT "VendorRelationship_primaryVendorId_fkey" FOREIGN KEY ("primaryVendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRelationship" ADD CONSTRAINT "VendorRelationship_subprocessorVendorId_fkey" FOREIGN KEY ("subprocessorVendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
