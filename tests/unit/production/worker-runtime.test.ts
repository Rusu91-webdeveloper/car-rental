import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ prisma: {} }))

import { isProductionWorkerJob } from "@/lib/production/operations-environment"
import { hasValidBearerSecret, manualExecutionKey, validIdempotencyKey } from "@/lib/production/request-auth"
import {
  executeProtectedWorker,
  type WorkerExecutionRepository,
} from "@/lib/production/worker-execution"

class MemoryWorkerRepository implements WorkerExecutionRepository {
  claimResult: "CLAIMED" | "DUPLICATE" | "CONCURRENT" = "CLAIMED"
  claims: Parameters<WorkerExecutionRepository["claim"]>[0][] = []
  completions: Parameters<WorkerExecutionRepository["complete"]>[0][] = []
  failures: Parameters<WorkerExecutionRepository["fail"]>[0][] = []

  async claim(input: Parameters<WorkerExecutionRepository["claim"]>[0]) {
    this.claims.push(input)
    return this.claimResult
  }

  async complete(input: Parameters<WorkerExecutionRepository["complete"]>[0]) {
    this.completions.push(input)
  }

  async fail(input: Parameters<WorkerExecutionRepository["fail"]>[0]) {
    this.failures.push(input)
  }
}

describe("worker request protection", () => {
  it("accepts only an exact bearer secret", () => {
    const secret = "synthetic-secret-at-least-32-characters"
    expect(hasValidBearerSecret(new Request("https://example.test", {
      headers: { authorization: `Bearer ${secret}` },
    }), secret)).toBe(true)
    expect(hasValidBearerSecret(new Request("https://example.test", {
      headers: { authorization: "Bearer wrong" },
    }), secret)).toBe(false)
    expect(hasValidBearerSecret(new Request("https://example.test"), secret)).toBe(false)
  })

  it("requires a bounded safe idempotency key and hashes it for storage", () => {
    const request = new Request("https://example.test", {
      headers: { "idempotency-key": "operator-run-20260715-001" },
    })
    const key = validIdempotencyKey(request)
    expect(key).toBe("operator-run-20260715-001")
    expect(manualExecutionKey("review-backlog", key!)).toMatch(/^manual:review-backlog:[a-f0-9]{64}$/)
    expect(validIdempotencyKey(new Request("https://example.test", {
      headers: { "idempotency-key": "short" },
    }))).toBeUndefined()
  })

  it("rejects job names outside the repository allowlist", () => {
    expect(isProductionWorkerJob("review-backlog")).toBe(true)
    expect(isProductionWorkerJob("delete-everything")).toBe(false)
    expect(isProductionWorkerJob("review-backlog?job=failed-deletion-retry")).toBe(false)
  })
})

describe("worker execution evidence", () => {
  let repository: MemoryWorkerRepository

  beforeEach(() => {
    repository = new MemoryWorkerRepository()
  })

  it("records a successful heartbeat with trigger and bounded counts", async () => {
    const result = await executeProtectedWorker({
      job: "review-backlog",
      deduplicationKey: "cron:2026-07-15:review-backlog",
      triggerSource: "vercel-cron",
      repository,
      now: () => new Date("2026-07-15T03:15:00.000Z"),
      run: async () => ({ pending: 4 }),
      summarize: (value) => ({ examined: value.pending, succeeded: value.pending, failed: 0 }),
    })
    expect(result.status).toBe("SUCCEEDED")
    expect(repository.claims[0]).toMatchObject({
      job: "review-backlog",
      triggerSource: "vercel-cron",
    })
    expect(repository.completions[0]).toMatchObject({
      status: "SUCCEEDED",
      summary: { examined: 4, succeeded: 4, failed: 0 },
    })
  })

  it("records partial and failed executions without raw error messages", async () => {
    const partial = await executeProtectedWorker({
      job: "review-backlog",
      deduplicationKey: "partial-key",
      triggerSource: "manual",
      repository,
      run: async () => ({ failed: 1 }),
      summarize: (value) => ({ examined: 1, succeeded: 0, failed: value.failed }),
    })
    expect(partial.status).toBe("PARTIAL")
    expect(repository.completions[0].status).toBe("PARTIAL")

    const failed = await executeProtectedWorker({
      job: "application-expiry",
      deduplicationKey: "failed-key",
      triggerSource: "manual",
      repository,
      run: async () => { throw new Error("customer@example.test must never be persisted") },
      summarize: () => ({}),
    })
    expect(failed.status).toBe("FAILED")
    expect(repository.failures[0]).toMatchObject({
      failureCode: "WORKER_FAILED",
      failureSummary: "Execution failed with Error.",
    })
    expect(repository.failures[0].failureSummary).not.toContain("customer@example.test")
  })

  it("prevents duplicate and concurrent execution before running job code", async () => {
    const run = vi.fn(async () => ({ ok: true }))
    repository.claimResult = "DUPLICATE"
    expect((await executeProtectedWorker({
      job: "review-backlog",
      deduplicationKey: "same-key",
      triggerSource: "vercel-cron",
      repository,
      run,
      summarize: () => ({}),
    })).status).toBe("DUPLICATE")
    repository.claimResult = "CONCURRENT"
    expect((await executeProtectedWorker({
      job: "review-backlog",
      deduplicationKey: "other-key",
      triggerSource: "manual",
      repository,
      run,
      summarize: () => ({}),
    })).status).toBe("CONCURRENT")
    expect(run).not.toHaveBeenCalled()
  })

  it("records a timeout as a failed execution", async () => {
    const result = await executeProtectedWorker({
      job: "review-backlog",
      deduplicationKey: "timeout-key",
      triggerSource: "manual",
      repository,
      timeoutMs: 5,
      run: () => new Promise<never>(() => undefined),
      summarize: () => ({}),
    })
    expect(result.status).toBe("FAILED")
    expect(repository.failures[0].failureCode).toBe("WORKER_TIMEOUT")
  })
})
