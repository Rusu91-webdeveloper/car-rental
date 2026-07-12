
-- Phase 2B migration 2/6: legal publication draft/version tables.
-- No legal content or publication status is backfilled by this migration.

-- CreateTable
CREATE TABLE "LegalDocumentVersion" (
    "id" TEXT NOT NULL,
    "type" "LegalDocumentType" NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "LegalPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "versionLabel" TEXT NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "manifestHash" CHAR(64),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "LegalDocumentVersion_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "LegalDocumentTranslation" (
    "id" TEXT NOT NULL,
    "legalDocumentVersionId" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "title" TEXT NOT NULL,
    "canonicalContent" TEXT NOT NULL,
    "sanitizedHtml" TEXT,
    "contentHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalDocumentTranslation_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE INDEX "LegalDocumentVersion_type_status_idx" ON "LegalDocumentVersion"("type", "status");


-- CreateIndex
CREATE INDEX "LegalDocumentVersion_publishedAt_idx" ON "LegalDocumentVersion"("publishedAt");


-- CreateIndex
CREATE UNIQUE INDEX "LegalDocumentVersion_type_versionNumber_key" ON "LegalDocumentVersion"("type", "versionNumber");


-- CreateIndex
CREATE UNIQUE INDEX "LegalDocumentVersion_type_versionLabel_key" ON "LegalDocumentVersion"("type", "versionLabel");


-- CreateIndex
CREATE INDEX "LegalDocumentTranslation_locale_idx" ON "LegalDocumentTranslation"("locale");


-- CreateIndex
CREATE INDEX "LegalDocumentTranslation_contentHash_idx" ON "LegalDocumentTranslation"("contentHash");


-- CreateIndex
CREATE UNIQUE INDEX "LegalDocumentTranslation_legalDocumentVersionId_locale_key" ON "LegalDocumentTranslation"("legalDocumentVersionId", "locale");


-- AddForeignKey
ALTER TABLE "LegalDocumentVersion" ADD CONSTRAINT "LegalDocumentVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "LegalDocumentVersion" ADD CONSTRAINT "LegalDocumentVersion_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "LegalDocumentVersion" ADD CONSTRAINT "LegalDocumentVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "LegalDocumentTranslation" ADD CONSTRAINT "LegalDocumentTranslation_legalDocumentVersionId_fkey" FOREIGN KEY ("legalDocumentVersionId") REFERENCES "LegalDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
