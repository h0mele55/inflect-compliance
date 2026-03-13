-- Framework: rename "name" -> "key", add new "name", "version", "metadataJson", "createdAt"
ALTER TABLE "Framework" RENAME COLUMN "name" TO "key";
ALTER TABLE "Framework" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Framework" ADD COLUMN "version" TEXT;
ALTER TABLE "Framework" ADD COLUMN "metadataJson" TEXT;
ALTER TABLE "Framework" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Set name = key for any existing data
UPDATE "Framework" SET "name" = "key" WHERE "name" = '';

-- FrameworkRequirement: add theme + themeNumber
ALTER TABLE "FrameworkRequirement" ADD COLUMN "theme" TEXT;
ALTER TABLE "FrameworkRequirement" ADD COLUMN "themeNumber" INTEGER;

-- FrameworkPack
CREATE TABLE "FrameworkPack" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "version" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FrameworkPack_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FrameworkPack_key_key" ON "FrameworkPack"("key");
ALTER TABLE "FrameworkPack" ADD CONSTRAINT "FrameworkPack_frameworkId_fkey"
    FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PackTemplateLink
CREATE TABLE "PackTemplateLink" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "PackTemplateLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PackTemplateLink_packId_templateId_key" ON "PackTemplateLink"("packId", "templateId");
ALTER TABLE "PackTemplateLink" ADD CONSTRAINT "PackTemplateLink_packId_fkey"
    FOREIGN KEY ("packId") REFERENCES "FrameworkPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackTemplateLink" ADD CONSTRAINT "PackTemplateLink_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "ControlTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
