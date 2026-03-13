-- CreateIndex
CREATE INDEX "Asset_tenantId_name_idx" ON "Asset"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Policy_tenantId_slug_idx" ON "Policy"("tenantId", "slug");
