CREATE TABLE "RateLimitBucket" (
  "id" TEXT NOT NULL,
  "scope" VARCHAR(64) NOT NULL,
  "subjectHash" CHAR(64) NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RateLimitBucket_scope_subjectHash_windowStartedAt_key"
  ON "RateLimitBucket"("scope", "subjectHash", "windowStartedAt");
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

CREATE TABLE "WorkerExecution" (
  "id" TEXT NOT NULL,
  "job" VARCHAR(64) NOT NULL,
  "invocationId" VARCHAR(64) NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "examined" INTEGER,
  "succeeded" INTEGER,
  "failed" INTEGER,
  "failureCode" VARCHAR(64),
  CONSTRAINT "WorkerExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkerExecution_invocationId_key" ON "WorkerExecution"("invocationId");
CREATE INDEX "WorkerExecution_job_startedAt_idx" ON "WorkerExecution"("job", "startedAt");
CREATE INDEX "WorkerExecution_status_startedAt_idx" ON "WorkerExecution"("status", "startedAt");
