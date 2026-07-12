-- Phase 8C migration 3/6: precise malware outcomes and append-only terminal attempts.

ALTER TYPE "MalwareScanStatus" ADD VALUE IF NOT EXISTS 'ERROR';
ALTER TYPE "MalwareScanStatus" ADD VALUE IF NOT EXISTS 'TIMEOUT';
ALTER TYPE "MalwareScanStatus" ADD VALUE IF NOT EXISTS 'UNSUPPORTED';
ALTER TYPE "MalwareScanStatus" ADD VALUE IF NOT EXISTS 'PASSWORD_PROTECTED';

CREATE TABLE "DocumentMalwareScanAttempt" (
  "id" TEXT NOT NULL,
  "customerDocumentId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "scannerProviderId" TEXT NOT NULL,
  "providerReference" TEXT,
  "providerEventId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "outcome" "MalwareScanStatus" NOT NULL,
  "safeResultCode" VARCHAR(64),
  "retryable" BOOLEAN NOT NULL,
  "sanitizedMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentMalwareScanAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentMalwareScanAttempt_customerDocumentId_completedAt_idx" ON "DocumentMalwareScanAttempt"("customerDocumentId", "completedAt");
CREATE INDEX "DocumentMalwareScanAttempt_outcome_completedAt_idx" ON "DocumentMalwareScanAttempt"("outcome", "completedAt");
CREATE INDEX "DocumentMalwareScanAttempt_scannerProviderId_completedAt_idx" ON "DocumentMalwareScanAttempt"("scannerProviderId", "completedAt");
CREATE UNIQUE INDEX "DocumentMalwareScanAttempt_customerDocumentId_attemptNumber_key" ON "DocumentMalwareScanAttempt"("customerDocumentId", "attemptNumber");
CREATE UNIQUE INDEX "DocumentMalwareScanAttempt_scannerProviderId_providerRefere_key" ON "DocumentMalwareScanAttempt"("scannerProviderId", "providerReference");
CREATE UNIQUE INDEX "DocumentMalwareScanAttempt_scannerProviderId_providerEventI_key" ON "DocumentMalwareScanAttempt"("scannerProviderId", "providerEventId");

ALTER TABLE "DocumentMalwareScanAttempt"
  ADD CONSTRAINT "DocumentMalwareScanAttempt_customerDocumentId_fkey"
  FOREIGN KEY ("customerDocumentId") REFERENCES "CustomerDocument"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
