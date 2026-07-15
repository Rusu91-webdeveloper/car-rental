
-- Phase 2B migration 5/6: private-document metadata and append-only audit storage.
-- No file contents, public URLs, provider credentials, IP addresses, or user agents are stored.

-- CreateTable
CREATE TABLE "CustomerDocument" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "customerUserId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "side" "DocumentSide" NOT NULL DEFAULT 'SINGLE',
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "storageProviderId" TEXT NOT NULL,
    "storageRegion" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT,
    "normalizedMimeType" VARCHAR(127) NOT NULL,
    "detectedMimeType" VARCHAR(127),
    "detectedFileType" TEXT,
    "fileExtension" VARCHAR(16),
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" CHAR(64) NOT NULL,
    "uploadStatus" "CustomerDocumentUploadStatus" NOT NULL DEFAULT 'PENDING',
    "scanStatus" "MalwareScanStatus" NOT NULL DEFAULT 'PENDING',
    "scanProviderReference" TEXT,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "deletionStatus" "DocumentDeletionStatus" NOT NULL DEFAULT 'RETAINED',
    "deletedAt" TIMESTAMP(3),
    "deletionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerDocument_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "category" "AuditCategory" NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "configurationReleaseId" TEXT,
    "customerDocumentId" TEXT,
    "correlationId" TEXT,
    "beforeSummary" JSONB,
    "afterSummary" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE INDEX "CustomerDocument_bookingId_documentTypeId_idx" ON "CustomerDocument"("bookingId", "documentTypeId");


-- CreateIndex
CREATE INDEX "CustomerDocument_customerUserId_documentTypeId_idx" ON "CustomerDocument"("customerUserId", "documentTypeId");


-- CreateIndex
CREATE INDEX "CustomerDocument_retentionUntil_legalHold_deletionStatus_idx" ON "CustomerDocument"("retentionUntil", "legalHold", "deletionStatus");


-- CreateIndex
CREATE INDEX "CustomerDocument_scanStatus_uploadStatus_idx" ON "CustomerDocument"("scanStatus", "uploadStatus");


-- CreateIndex
CREATE INDEX "CustomerDocument_deletionStatus_deletedAt_idx" ON "CustomerDocument"("deletionStatus", "deletedAt");


-- CreateIndex
CREATE INDEX "CustomerDocument_documentTypeId_idx" ON "CustomerDocument"("documentTypeId");


-- CreateIndex
CREATE UNIQUE INDEX "CustomerDocument_storageProviderId_storageKey_key" ON "CustomerDocument"("storageProviderId", "storageKey");


-- CreateIndex
CREATE UNIQUE INDEX "CustomerDocument_bookingId_documentTypeId_side_sequence_key" ON "CustomerDocument"("bookingId", "documentTypeId", "side", "sequence");


-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");


-- CreateIndex
CREATE INDEX "AuditEvent_category_action_createdAt_idx" ON "AuditEvent"("category", "action", "createdAt");


-- CreateIndex
CREATE INDEX "AuditEvent_targetType_targetId_createdAt_idx" ON "AuditEvent"("targetType", "targetId", "createdAt");


-- CreateIndex
CREATE INDEX "AuditEvent_configurationReleaseId_createdAt_idx" ON "AuditEvent"("configurationReleaseId", "createdAt");


-- CreateIndex
CREATE INDEX "AuditEvent_customerDocumentId_createdAt_idx" ON "AuditEvent"("customerDocumentId", "createdAt");


-- CreateIndex
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");


-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");


-- AddForeignKey
ALTER TABLE "CustomerDocument" ADD CONSTRAINT "CustomerDocument_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "CustomerDocument" ADD CONSTRAINT "CustomerDocument_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "CustomerDocument" ADD CONSTRAINT "CustomerDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "CustomerDocument" ADD CONSTRAINT "CustomerDocument_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentTypeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_configurationReleaseId_fkey" FOREIGN KEY ("configurationReleaseId") REFERENCES "BusinessConfigurationRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_customerDocumentId_fkey" FOREIGN KEY ("customerDocumentId") REFERENCES "CustomerDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
