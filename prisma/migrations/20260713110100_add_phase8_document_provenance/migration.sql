-- Phase 8C migration 2/6: nullable Phase 8 evidence and provenance on final documents.
-- Existing rows remain evidence schema version 1; no historical evidence is fabricated.

ALTER TABLE "CustomerDocument"
  ADD COLUMN "attemptNumber" INTEGER,
  ADD COLUMN "configurationReleaseId" TEXT,
  ADD COLUMN "declaredMimeType" VARCHAR(127),
  ADD COLUMN "deletionEligibleAt" TIMESTAMP(3),
  ADD COLUMN "documentPolicyConfigVersionId" TEXT,
  ADD COLUMN "documentRequirementTypeId" TEXT,
  ADD COLUMN "evidenceSchemaVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "filePolicyVersion" INTEGER,
  ADD COLUMN "fileValidatorVersion" TEXT,
  ADD COLUMN "hardRetentionDaysSnapshot" INTEGER,
  ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "metadataVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "quarantineStatus" "DocumentQuarantineStatus",
  ADD COLUMN "quarantinedAt" TIMESTAMP(3),
  ADD COLUMN "releasedFromQuarantineAt" TIMESTAMP(3),
  ADD COLUMN "replacesDocumentId" TEXT,
  ADD COLUMN "retentionBasis" "DocumentRetentionBasis",
  ADD COLUMN "retentionBasisAt" TIMESTAMP(3),
  ADD COLUMN "retentionPolicyDaysSnapshot" INTEGER,
  ADD COLUMN "scanAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "scanCompletedAt" TIMESTAMP(3),
  ADD COLUMN "scanRequestedAt" TIMESTAMP(3),
  ADD COLUMN "scanResultCode" VARCHAR(64),
  ADD COLUMN "slotNumber" INTEGER,
  ADD COLUMN "storageContainerId" TEXT,
  ADD COLUMN "storageObjectVersionId" TEXT,
  ADD COLUMN "uploadIntentId" TEXT,
  ADD COLUMN "uploadSessionId" TEXT,
  ADD COLUMN "verificationFailureCode" VARCHAR(64);

CREATE UNIQUE INDEX "CustomerDocument_uploadIntentId_key" ON "CustomerDocument"("uploadIntentId");
CREATE INDEX "CustomerDocument_uploadSessionId_idx" ON "CustomerDocument"("uploadSessionId");
CREATE INDEX "CustomerDocument_configurationReleaseId_idx" ON "CustomerDocument"("configurationReleaseId");
CREATE INDEX "CustomerDocument_documentPolicyConfigVersionId_documentRequ_idx" ON "CustomerDocument"("documentPolicyConfigVersionId", "documentRequirementTypeId");
CREATE INDEX "CustomerDocument_replacesDocumentId_idx" ON "CustomerDocument"("replacesDocumentId");
CREATE INDEX "CustomerDocument_scanStatus_scanRequestedAt_idx" ON "CustomerDocument"("scanStatus", "scanRequestedAt");
CREATE INDEX "CustomerDocument_legalHold_retentionUntil_idx" ON "CustomerDocument"("legalHold", "retentionUntil");
CREATE INDEX "CustomerDocument_deletionStatus_deletionEligibleAt_idx" ON "CustomerDocument"("deletionStatus", "deletionEligibleAt");

ALTER TABLE "CustomerDocument"
  ADD CONSTRAINT "CustomerDocument_uploadSessionId_fkey" FOREIGN KEY ("uploadSessionId") REFERENCES "DocumentUploadSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "CustomerDocument_uploadIntentId_fkey" FOREIGN KEY ("uploadIntentId") REFERENCES "DocumentUploadIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "CustomerDocument_configurationReleaseId_fkey" FOREIGN KEY ("configurationReleaseId") REFERENCES "BusinessConfigurationRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "CustomerDocument_documentPolicyConfigVersionId_documentReq_fkey"
    FOREIGN KEY ("documentPolicyConfigVersionId", "documentRequirementTypeId")
    REFERENCES "DocumentRequirementRule"("documentPolicyConfigVersionId", "documentTypeId")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "CustomerDocument_replacesDocumentId_fkey" FOREIGN KEY ("replacesDocumentId") REFERENCES "CustomerDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "CustomerDocument" VALIDATE CONSTRAINT "CustomerDocument_uploadSessionId_fkey";
ALTER TABLE "CustomerDocument" VALIDATE CONSTRAINT "CustomerDocument_uploadIntentId_fkey";
ALTER TABLE "CustomerDocument" VALIDATE CONSTRAINT "CustomerDocument_configurationReleaseId_fkey";
ALTER TABLE "CustomerDocument" VALIDATE CONSTRAINT "CustomerDocument_documentPolicyConfigVersionId_documentReq_fkey";
ALTER TABLE "CustomerDocument" VALIDATE CONSTRAINT "CustomerDocument_replacesDocumentId_fkey";
