-- Extend worker evidence without changing or deleting legacy execution rows.
ALTER TABLE "WorkerExecution"
  ADD COLUMN "deduplicationKey" VARCHAR(128),
  ADD COLUMN "triggerSource" VARCHAR(32) NOT NULL DEFAULT 'legacy',
  ADD COLUMN "environment" VARCHAR(32),
  ADD COLUMN "deploymentRef" VARCHAR(128),
  ADD COLUMN "failureSummary" VARCHAR(256);

CREATE UNIQUE INDEX "WorkerExecution_deduplicationKey_key"
  ON "WorkerExecution"("deduplicationKey");
CREATE INDEX "WorkerExecution_triggerSource_startedAt_idx"
  ON "WorkerExecution"("triggerSource", "startedAt");

-- One reclaimable lease per concrete job prevents concurrent executions.
CREATE TABLE "WorkerLease" (
  "job" VARCHAR(64) NOT NULL,
  "invocationId" VARCHAR(64) NOT NULL,
  "acquiredAt" TIMESTAMP(3) NOT NULL,
  "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkerLease_pkey" PRIMARY KEY ("job")
);

CREATE UNIQUE INDEX "WorkerLease_invocationId_key"
  ON "WorkerLease"("invocationId");
CREATE INDEX "WorkerLease_leaseExpiresAt_idx"
  ON "WorkerLease"("leaseExpiresAt");

CREATE TYPE "OperationalEvidenceType" AS ENUM (
  'ALERT_DELIVERY',
  'BACKUP_VERIFICATION',
  'RESTORE_VERIFICATION'
);
CREATE TYPE "OperationalEvidenceStatus" AS ENUM (
  'REQUESTED',
  'SUCCEEDED',
  'FAILED'
);

CREATE TABLE "OperationalEvidence" (
  "id" TEXT NOT NULL,
  "type" "OperationalEvidenceType" NOT NULL,
  "status" "OperationalEvidenceStatus" NOT NULL,
  "environment" VARCHAR(32) NOT NULL,
  "operatorId" VARCHAR(64) NOT NULL,
  "verifiedById" VARCHAR(64),
  "deduplicationKey" VARCHAR(128) NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "databaseFingerprint" VARCHAR(128),
  "notes" VARCHAR(500),
  "failureCode" VARCHAR(64),
  "failureSummary" VARCHAR(256),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationalEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalEvidence_deduplicationKey_key"
  ON "OperationalEvidence"("deduplicationKey");
CREATE INDEX "OperationalEvidence_type_environment_requestedAt_idx"
  ON "OperationalEvidence"("type", "environment", "requestedAt");
CREATE INDEX "OperationalEvidence_type_status_verifiedAt_idx"
  ON "OperationalEvidence"("type", "status", "verifiedAt");
CREATE INDEX "OperationalEvidence_operatorId_requestedAt_idx"
  ON "OperationalEvidence"("operatorId", "requestedAt");
CREATE INDEX "OperationalEvidence_verifiedById_verifiedAt_idx"
  ON "OperationalEvidence"("verifiedById", "verifiedAt");
