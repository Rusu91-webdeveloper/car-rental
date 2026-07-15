import "server-only"

import { randomUUID } from "node:crypto"
import { Prisma, type PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/db"

export const WORKER_TIMEOUT_MS = 50_000
const WORKER_LEASE_MS = WORKER_TIMEOUT_MS + 10_000

export type WorkerTriggerSource = "vercel-cron" | "manual"
export type WorkerCompletionStatus = "SUCCEEDED" | "PARTIAL"
export type WorkerRunStatus = WorkerCompletionStatus | "FAILED" | "DUPLICATE" | "CONCURRENT"

export interface WorkerSummary {
  examined?: number
  succeeded?: number
  failed?: number
}

interface ClaimInput {
  job: string
  invocationId: string
  deduplicationKey: string
  triggerSource: WorkerTriggerSource
  environment?: string
  deploymentRef?: string
  startedAt: Date
  leaseExpiresAt: Date
}

export interface WorkerExecutionRepository {
  claim(input: ClaimInput): Promise<"CLAIMED" | "DUPLICATE" | "CONCURRENT">
  complete(input: {
    job: string
    invocationId: string
    completedAt: Date
    status: WorkerCompletionStatus
    summary: WorkerSummary
  }): Promise<void>
  fail(input: {
    job: string
    invocationId: string
    completedAt: Date
    failureCode: string
    failureSummary: string
    releaseLease?: boolean
  }): Promise<void>
}

function isUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

export class PrismaWorkerExecutionRepository implements WorkerExecutionRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async claim(input: ClaimInput) {
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.workerExecution.create({
          data: {
            job: input.job,
            invocationId: input.invocationId,
            deduplicationKey: input.deduplicationKey,
            status: "RUNNING",
            triggerSource: input.triggerSource,
            environment: input.environment,
            deploymentRef: input.deploymentRef,
            startedAt: input.startedAt,
          },
        })
        const acquired = await tx.$executeRaw`
          INSERT INTO "WorkerLease" ("job", "invocationId", "acquiredAt", "leaseExpiresAt", "updatedAt")
          VALUES (${input.job}, ${input.invocationId}, ${input.startedAt}, ${input.leaseExpiresAt}, ${input.startedAt})
          ON CONFLICT ("job") DO UPDATE SET
            "invocationId" = EXCLUDED."invocationId",
            "acquiredAt" = EXCLUDED."acquiredAt",
            "leaseExpiresAt" = EXCLUDED."leaseExpiresAt",
            "updatedAt" = EXCLUDED."updatedAt"
          WHERE "WorkerLease"."leaseExpiresAt" <= ${input.startedAt}
        `
        if (acquired === 1) return "CLAIMED" as const
        await tx.workerExecution.update({
          where: { invocationId: input.invocationId },
          data: {
            status: "SKIPPED",
            completedAt: input.startedAt,
            failureCode: "CONCURRENT_EXECUTION",
            failureSummary: "A non-expired lease already exists for this job.",
          },
        })
        return "CONCURRENT" as const
      })
    } catch (error) {
      if (isUniqueConstraint(error)) return "DUPLICATE" as const
      throw error
    }
  }

  async complete(input: {
    job: string
    invocationId: string
    completedAt: Date
    status: WorkerCompletionStatus
    summary: WorkerSummary
  }) {
    await this.db.$transaction([
      this.db.workerExecution.update({
        where: { invocationId: input.invocationId },
        data: {
          status: input.status,
          completedAt: input.completedAt,
          examined: input.summary.examined,
          succeeded: input.summary.succeeded,
          failed: input.summary.failed,
          failureCode: input.status === "PARTIAL" ? "PARTIAL_FAILURE" : null,
          failureSummary: input.status === "PARTIAL" ? "One or more bounded items failed." : null,
        },
      }),
      this.db.workerLease.deleteMany({ where: { job: input.job, invocationId: input.invocationId } }),
    ])
  }

  async fail(input: {
    job: string
    invocationId: string
    completedAt: Date
    failureCode: string
    failureSummary: string
    releaseLease?: boolean
  }) {
    const update = this.db.workerExecution.update({
      where: { invocationId: input.invocationId },
      data: {
        status: "FAILED",
        completedAt: input.completedAt,
        failureCode: input.failureCode,
        failureSummary: input.failureSummary,
      },
    })
    if (input.releaseLease === false) {
      await update
      return
    }
    await this.db.$transaction([
      update,
      this.db.workerLease.deleteMany({ where: { job: input.job, invocationId: input.invocationId } }),
    ])
  }
}

function safeFailure(error: unknown) {
  if (error instanceof WorkerTimeoutError)
    return { code: "WORKER_TIMEOUT", summary: "Execution exceeded the application time budget.", releaseLease: false }
  return {
    code: "WORKER_FAILED",
    summary: `Execution failed with ${error instanceof Error ? error.name : "UnknownError"}.`,
    releaseLease: true,
  }
}

class WorkerTimeoutError extends Error {
  constructor() {
    super("Worker execution timed out.")
    this.name = "WorkerTimeoutError"
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new WorkerTimeoutError()), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export async function executeProtectedWorker<T>(input: {
  job: string
  deduplicationKey: string
  triggerSource: WorkerTriggerSource
  run: () => Promise<T>
  summarize: (result: T) => WorkerSummary
  repository?: WorkerExecutionRepository
  now?: () => Date
  timeoutMs?: number
  environment?: string
  deploymentRef?: string
}) {
  const repository = input.repository ?? new PrismaWorkerExecutionRepository()
  const now = input.now ?? (() => new Date())
  const invocationId = randomUUID()
  const startedAt = now()
  const claim = await repository.claim({
    job: input.job,
    invocationId,
    deduplicationKey: input.deduplicationKey,
    triggerSource: input.triggerSource,
    environment: input.environment ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    deploymentRef:
      input.deploymentRef ??
      process.env.VERCEL_DEPLOYMENT_ID ??
      process.env.VERCEL_URL ??
      process.env.VERCEL_GIT_COMMIT_SHA,
    startedAt,
    leaseExpiresAt: new Date(startedAt.getTime() + WORKER_LEASE_MS),
  })
  if (claim === "DUPLICATE") return { status: "DUPLICATE" as const, invocationId }
  if (claim === "CONCURRENT") return { status: "CONCURRENT" as const, invocationId }

  try {
    const result = await withTimeout(input.run(), input.timeoutMs ?? WORKER_TIMEOUT_MS)
    const summary = input.summarize(result)
    const status: WorkerCompletionStatus = (summary.failed ?? 0) > 0 ? "PARTIAL" : "SUCCEEDED"
    await repository.complete({ job: input.job, invocationId, completedAt: now(), status, summary })
    return { status, invocationId, result, summary }
  } catch (error) {
    const failure = safeFailure(error)
    await repository.fail({
      job: input.job,
      invocationId,
      completedAt: now(),
      failureCode: failure.code,
      failureSummary: failure.summary,
      releaseLease: failure.releaseLease,
    })
    return { status: "FAILED" as const, invocationId, failureCode: failure.code }
  }
}
