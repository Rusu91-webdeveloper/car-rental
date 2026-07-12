-- Phase 8C migration 1/6: provider-neutral upload and policy foundations.
-- Additive only. Existing released policies retain schema-version-1 compatibility.

CREATE TYPE "IdentityDocumentChoice" AS ENUM (
  'DISABLED', 'IDENTITY_CARD_ONLY', 'PASSPORT_ONLY',
  'EITHER_IDENTITY_CARD_OR_PASSPORT', 'BOTH'
);

CREATE TYPE "DocumentUploadSessionStatus" AS ENUM ('OPEN', 'CONSUMED', 'EXPIRED', 'ABORTED');
CREATE TYPE "DocumentUploadIntentStatus" AS ENUM (
  'INTENT_CREATED', 'UPLOADING', 'UPLOADED', 'VERIFYING', 'QUARANTINED',
  'SCAN_PENDING', 'CLEAN', 'REJECTED', 'FAILED', 'ABORTED', 'EXPIRED'
);
CREATE TYPE "DocumentQuarantineStatus" AS ENUM ('QUARANTINED', 'RELEASED', 'REJECTED', 'DELETED');
CREATE TYPE "DocumentRetentionBasis" AS ENUM (
  'UPLOAD_SESSION_EXPIRY', 'BOOKING_CANCELLED', 'RENTAL_COMPLETED',
  'REJECTED_UPLOAD', 'INCIDENT_PRESERVATION'
);
CREATE TYPE "DocumentDeletionRequestStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'FAILED');
CREATE TYPE "DocumentDeletionAttemptOutcome" AS ENUM (
  'DELETED', 'ALREADY_MISSING', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE'
);

ALTER TABLE "DocumentPolicyConfigVersion"
  ADD COLUMN "identityDocumentChoice" "IdentityDocumentChoice" NOT NULL DEFAULT 'DISABLED',
  ADD COLUMN "showReminderInConfirmation" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "DocumentPolicyRolePermission"
  ADD COLUMN "mayManageLegalHold" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "DocumentRequirementTranslation" (
  "id" TEXT NOT NULL,
  "documentPolicyConfigVersionId" TEXT NOT NULL,
  "documentTypeId" TEXT NOT NULL,
  "locale" VARCHAR(10) NOT NULL,
  "instructions" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentRequirementTranslation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentUploadSession" (
  "id" TEXT NOT NULL,
  "customerUserId" TEXT NOT NULL,
  "carId" TEXT NOT NULL,
  "pickupAt" TIMESTAMP(3) NOT NULL,
  "returnAt" TIMESTAMP(3) NOT NULL,
  "locale" VARCHAR(10) NOT NULL,
  "configurationReleaseId" TEXT NOT NULL,
  "documentPolicyConfigVersionId" TEXT NOT NULL,
  "bookingId" TEXT,
  "status" "DocumentUploadSessionStatus" NOT NULL DEFAULT 'OPEN',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "abortedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentUploadSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentUploadIntent" (
  "id" TEXT NOT NULL,
  "uploadSessionId" TEXT NOT NULL,
  "documentPolicyConfigVersionId" TEXT NOT NULL,
  "documentTypeId" TEXT NOT NULL,
  "side" "DocumentSide" NOT NULL,
  "slotNumber" INTEGER NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "filePolicyVersion" INTEGER NOT NULL,
  "originalFileName" TEXT,
  "normalizedExtension" VARCHAR(16) NOT NULL,
  "declaredMimeType" VARCHAR(127) NOT NULL,
  "expectedSizeBytes" INTEGER NOT NULL,
  "expectedChecksumSha256" CHAR(64) NOT NULL,
  "storageProviderId" TEXT NOT NULL,
  "storageRegion" TEXT NOT NULL,
  "storageContainerId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "providerUploadId" TEXT,
  "providerObjectVersionId" TEXT,
  "status" "DocumentUploadIntentStatus" NOT NULL DEFAULT 'INTENT_CREATED',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "cleanupEligibleAt" TIMESTAMP(3) NOT NULL,
  "uploadCompletedAt" TIMESTAMP(3),
  "verificationStartedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "abortedAt" TIMESTAMP(3),
  "failureCode" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentUploadIntent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentRequirementTranslation_locale_idx" ON "DocumentRequirementTranslation"("locale");
CREATE INDEX "DocumentRequirementTranslation_documentTypeId_locale_idx" ON "DocumentRequirementTranslation"("documentTypeId", "locale");
CREATE UNIQUE INDEX "DocumentRequirementTranslation_documentPolicyConfigVersionI_key" ON "DocumentRequirementTranslation"("documentPolicyConfigVersionId", "documentTypeId", "locale");

CREATE UNIQUE INDEX "DocumentUploadSession_bookingId_key" ON "DocumentUploadSession"("bookingId");
CREATE INDEX "DocumentUploadSession_customerUserId_status_expiresAt_idx" ON "DocumentUploadSession"("customerUserId", "status", "expiresAt");
CREATE INDEX "DocumentUploadSession_configurationReleaseId_idx" ON "DocumentUploadSession"("configurationReleaseId");
CREATE INDEX "DocumentUploadSession_documentPolicyConfigVersionId_idx" ON "DocumentUploadSession"("documentPolicyConfigVersionId");
CREATE INDEX "DocumentUploadSession_status_expiresAt_idx" ON "DocumentUploadSession"("status", "expiresAt");
CREATE INDEX "DocumentUploadSession_carId_pickupAt_returnAt_idx" ON "DocumentUploadSession"("carId", "pickupAt", "returnAt");

CREATE UNIQUE INDEX "DocumentUploadIntent_idempotencyKey_key" ON "DocumentUploadIntent"("idempotencyKey");
CREATE INDEX "DocumentUploadIntent_uploadSessionId_status_idx" ON "DocumentUploadIntent"("uploadSessionId", "status");
CREATE INDEX "DocumentUploadIntent_status_expiresAt_idx" ON "DocumentUploadIntent"("status", "expiresAt");
CREATE INDEX "DocumentUploadIntent_status_cleanupEligibleAt_idx" ON "DocumentUploadIntent"("status", "cleanupEligibleAt");
CREATE INDEX "DocumentUploadIntent_documentPolicyConfigVersionId_document_idx" ON "DocumentUploadIntent"("documentPolicyConfigVersionId", "documentTypeId");
CREATE UNIQUE INDEX "DocumentUploadIntent_uploadSessionId_documentTypeId_side_sl_key" ON "DocumentUploadIntent"("uploadSessionId", "documentTypeId", "side", "slotNumber", "attemptNumber");
CREATE UNIQUE INDEX "DocumentUploadIntent_storageProviderId_storageContainerId_s_key" ON "DocumentUploadIntent"("storageProviderId", "storageContainerId", "storageKey");
CREATE UNIQUE INDEX "DocumentUploadIntent_storageProviderId_providerUploadId_key" ON "DocumentUploadIntent"("storageProviderId", "providerUploadId");

ALTER TABLE "DocumentRequirementTranslation"
  ADD CONSTRAINT "DocumentRequirementTranslation_documentPolicyConfigVersion_fkey"
  FOREIGN KEY ("documentPolicyConfigVersionId", "documentTypeId")
  REFERENCES "DocumentRequirementRule"("documentPolicyConfigVersionId", "documentTypeId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentUploadSession"
  ADD CONSTRAINT "DocumentUploadSession_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DocumentUploadSession_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DocumentUploadSession_configurationReleaseId_fkey" FOREIGN KEY ("configurationReleaseId") REFERENCES "BusinessConfigurationRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DocumentUploadSession_documentPolicyConfigVersionId_fkey" FOREIGN KEY ("documentPolicyConfigVersionId") REFERENCES "DocumentPolicyConfigVersion"("configurationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DocumentUploadSession_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentUploadIntent"
  ADD CONSTRAINT "DocumentUploadIntent_uploadSessionId_fkey" FOREIGN KEY ("uploadSessionId") REFERENCES "DocumentUploadSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DocumentUploadIntent_documentPolicyConfigVersionId_documen_fkey"
  FOREIGN KEY ("documentPolicyConfigVersionId", "documentTypeId")
  REFERENCES "DocumentRequirementRule"("documentPolicyConfigVersionId", "documentTypeId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
