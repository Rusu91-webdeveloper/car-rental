-- Phase 8C migration 4/6: typed legal holds, deletion requests, and terminal attempts.
-- Existing summary fields are not converted into historical evidence.

CREATE TABLE "DocumentLegalHold" (
  "id" TEXT NOT NULL,
  "customerDocumentId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "appliedById" TEXT NOT NULL,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "releasedById" TEXT,
  "releasedAt" TIMESTAMP(3),
  "releaseReason" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentLegalHold_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentDeletionRequest" (
  "id" TEXT NOT NULL,
  "customerDocumentId" TEXT NOT NULL,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "requestedById" TEXT,
  "reason" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "eligibleAt" TIMESTAMP(3) NOT NULL,
  "mustCompleteBy" TIMESTAMP(3) NOT NULL,
  "status" "DocumentDeletionRequestStatus" NOT NULL DEFAULT 'SCHEDULED',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "providerConfirmationRef" TEXT,
  "providerConfirmedAt" TIMESTAMP(3),
  "lastFailureCode" VARCHAR(64),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentDeletionAttempt" (
  "id" TEXT NOT NULL,
  "deletionRequestId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "storageProviderId" TEXT NOT NULL,
  "providerRequestId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "outcome" "DocumentDeletionAttemptOutcome" NOT NULL,
  "retryable" BOOLEAN NOT NULL,
  "safeFailureCode" VARCHAR(64),
  "providerConfirmationRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentDeletionAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentLegalHold_customerDocumentId_appliedAt_idx" ON "DocumentLegalHold"("customerDocumentId", "appliedAt");
CREATE INDEX "DocumentLegalHold_reviewAt_idx" ON "DocumentLegalHold"("reviewAt");
CREATE INDEX "DocumentLegalHold_expiresAt_idx" ON "DocumentLegalHold"("expiresAt");
CREATE INDEX "DocumentLegalHold_appliedById_appliedAt_idx" ON "DocumentLegalHold"("appliedById", "appliedAt");
CREATE INDEX "DocumentLegalHold_releasedById_releasedAt_idx" ON "DocumentLegalHold"("releasedById", "releasedAt");

CREATE UNIQUE INDEX "DocumentDeletionRequest_idempotencyKey_key" ON "DocumentDeletionRequest"("idempotencyKey");
CREATE INDEX "DocumentDeletionRequest_customerDocumentId_status_idx" ON "DocumentDeletionRequest"("customerDocumentId", "status");
CREATE INDEX "DocumentDeletionRequest_status_eligibleAt_idx" ON "DocumentDeletionRequest"("status", "eligibleAt");
CREATE INDEX "DocumentDeletionRequest_status_mustCompleteBy_idx" ON "DocumentDeletionRequest"("status", "mustCompleteBy");
CREATE INDEX "DocumentDeletionRequest_requestedById_createdAt_idx" ON "DocumentDeletionRequest"("requestedById", "createdAt");

CREATE INDEX "DocumentDeletionAttempt_deletionRequestId_completedAt_idx" ON "DocumentDeletionAttempt"("deletionRequestId", "completedAt");
CREATE INDEX "DocumentDeletionAttempt_outcome_completedAt_idx" ON "DocumentDeletionAttempt"("outcome", "completedAt");
CREATE UNIQUE INDEX "DocumentDeletionAttempt_deletionRequestId_attemptNumber_key" ON "DocumentDeletionAttempt"("deletionRequestId", "attemptNumber");
CREATE UNIQUE INDEX "DocumentDeletionAttempt_storageProviderId_providerRequestId_key" ON "DocumentDeletionAttempt"("storageProviderId", "providerRequestId");

ALTER TABLE "DocumentLegalHold"
  ADD CONSTRAINT "DocumentLegalHold_customerDocumentId_fkey" FOREIGN KEY ("customerDocumentId") REFERENCES "CustomerDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DocumentLegalHold_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DocumentLegalHold_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentDeletionRequest"
  ADD CONSTRAINT "DocumentDeletionRequest_customerDocumentId_fkey" FOREIGN KEY ("customerDocumentId") REFERENCES "CustomerDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DocumentDeletionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentDeletionAttempt"
  ADD CONSTRAINT "DocumentDeletionAttempt_deletionRequestId_fkey" FOREIGN KEY ("deletionRequestId") REFERENCES "DocumentDeletionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
