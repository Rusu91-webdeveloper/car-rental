import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/email", () => ({ getEmailConfigStatus: () => ({ enabled: true, provider: "Synthetic" }) }))

import {
  evaluateAlertEvidenceStatus,
  evaluateRecoveryEvidenceStatus,
  evaluateScheduledWorkerStatus,
} from "@/lib/production/health"
import {
  recordRecoveryEvidence,
  recoveryEvidenceSchema,
  confirmAlertDelivery,
  verifyAlertDelivery,
  type OperationalEvidenceRepository,
} from "@/lib/production/operational-evidence"

class MemoryEvidenceRepository implements OperationalEvidenceRepository {
  duplicate = false
  created: Parameters<OperationalEvidenceRepository["create"]>[0][] = []
  finished: Parameters<OperationalEvidenceRepository["finish"]>[0][] = []
  confirmations: Parameters<OperationalEvidenceRepository["confirmAlert"]>[0][] = []

  async create(input: Parameters<OperationalEvidenceRepository["create"]>[0]) {
    this.created.push(input)
    return this.duplicate ? "DUPLICATE" as const : { id: `evidence-${this.created.length}` }
  }

  async finish(input: Parameters<OperationalEvidenceRepository["finish"]>[0]) {
    this.finished.push(input)
  }

  async confirmAlert(input: Parameters<OperationalEvidenceRepository["confirmAlert"]>[0]) {
    this.confirmations.push(input)
    return true
  }
}

describe("alert delivery evidence", () => {
  it("requires operator confirmation after provider acceptance before recording success", async () => {
    const repository = new MemoryEvidenceRepository()
    const result = await verifyAlertDelivery({
      operatorId: "operator-1",
      environment: "production",
      recipient: "alerts@example.invalid",
      repository,
      now: () => new Date("2026-07-15T10:00:00.000Z"),
      send: vi.fn(async () => ({ id: "provider-message-id" })),
    })
    expect(result.status).toBe("AWAITING_CONFIRMATION")
    expect(repository.created[0]).toMatchObject({
      type: "ALERT_DELIVERY",
      operatorId: "operator-1",
    })
    expect(repository.created[0]?.deduplicationKey).toMatch(/^alert:production:\d+:[a-f0-9]{16}$/)
    expect(repository.finished).toHaveLength(0)
    const confirmation = await confirmAlertDelivery({
      evidenceId: result.evidenceId!,
      operatorId: "operator-2",
      body: { result: "DELIVERED" },
      repository,
      now: () => new Date("2026-07-15T10:05:00.000Z"),
    })
    expect(confirmation.status).toBe("SUCCEEDED")
    expect(repository.confirmations[0]).toMatchObject({
      status: "SUCCEEDED",
      verifiedById: "operator-2",
    })
  })

  it("records delivery failure and rate-limits repeated hourly requests", async () => {
    const repository = new MemoryEvidenceRepository()
    const failed = await verifyAlertDelivery({
      operatorId: "operator-1",
      environment: "production",
      recipient: "alerts@example.invalid",
      repository,
      send: async () => ({ error: "synthetic provider failure" }),
    })
    expect(failed.status).toBe("FAILED")
    expect(repository.finished[0]).toMatchObject({
      status: "FAILED",
      failureCode: "ALERT_DELIVERY_FAILED",
    })
    repository.duplicate = true
    expect((await verifyAlertDelivery({
      operatorId: "operator-1",
      environment: "production",
      recipient: "alerts@example.invalid",
      repository,
      send: async () => ({ id: "should-not-send" }),
    })).status).toBe("RATE_LIMITED")
  })
})

describe("database recovery evidence", () => {
  it("validates backup and restore evidence and requires failure details", () => {
    expect(recoveryEvidenceSchema.safeParse({
      type: "BACKUP",
      verifiedAt: "2026-07-15T09:00:00.000Z",
      databaseFingerprint: "a".repeat(64),
      result: "SUCCEEDED",
    }).success).toBe(true)
    expect(recoveryEvidenceSchema.safeParse({
      type: "RESTORE",
      verifiedAt: "2026-07-15T09:00:00.000Z",
      databaseFingerprint: "a".repeat(64),
      result: "FAILED",
    }).success).toBe(false)
  })

  it("records authenticated recovery evidence but rejects future timestamps", async () => {
    const repository = new MemoryEvidenceRepository()
    const now = () => new Date("2026-07-15T10:00:00.000Z")
    const success = await recordRecoveryEvidence({
      body: {
        type: "BACKUP",
        verifiedAt: "2026-07-15T09:30:00.000Z",
        databaseFingerprint: "b".repeat(64),
        result: "SUCCEEDED",
      },
      operatorId: "operator-1",
      environment: "production",
      idempotencyKey: "recovery-run-20260715-001",
      repository,
      now,
    })
    expect(success.status).toBe("SUCCEEDED")
    expect(repository.created[0]).toMatchObject({
      type: "BACKUP_VERIFICATION",
      operatorId: "operator-1",
      databaseFingerprint: "b".repeat(64),
    })
    expect((await recordRecoveryEvidence({
      body: {
        type: "RESTORE",
        verifiedAt: "2026-07-16T09:30:00.000Z",
        databaseFingerprint: "b".repeat(64),
        result: "SUCCEEDED",
      },
      operatorId: "operator-1",
      environment: "production",
      idempotencyKey: "recovery-run-20260715-002",
      repository,
      now,
    })).status).toBe("INVALID_FUTURE_TIMESTAMP")
  })
})

describe("readiness evidence gates", () => {
  const now = new Date("2026-07-15T12:00:00.000Z")

  it("keeps workers stale until every scheduled job has a recent success", () => {
    const oneJob = [{
      job: "application-expiry",
      status: "SUCCEEDED",
      triggerSource: "vercel-cron",
      startedAt: new Date("2026-07-15T03:15:00.000Z"),
      completedAt: new Date("2026-07-15T03:15:10.000Z"),
    }]
    expect(evaluateScheduledWorkerStatus({
      configured: true,
      rows: oneJob,
      jobs: ["application-expiry", "review-backlog"],
      now,
    }).status).toBe("STALE")
    expect(evaluateScheduledWorkerStatus({
      configured: true,
      rows: [...oneJob, {
        job: "review-backlog",
        status: "SUCCEEDED",
        triggerSource: "vercel-cron",
        startedAt: new Date("2026-07-15T03:15:10.000Z"),
        completedAt: new Date("2026-07-15T03:15:20.000Z"),
      }],
      jobs: ["application-expiry", "review-backlog"],
      now,
    }).status).toBe("READY")
  })

  it("does not treat a manual execution as a scheduled heartbeat", () => {
    expect(evaluateScheduledWorkerStatus({
      configured: true,
      rows: [{
        job: "review-backlog",
        status: "SUCCEEDED",
        triggerSource: "manual",
        startedAt: new Date("2026-07-15T03:15:10.000Z"),
        completedAt: new Date("2026-07-15T03:15:20.000Z"),
      }],
      jobs: ["review-backlog"],
      now,
    }).status).toBe("STALE")
  })

  it("keeps the first scheduled heartbeat pending during a bounded activation grace", () => {
    const activation = new Date("2026-07-15T11:30:00.000Z")
    expect(evaluateScheduledWorkerStatus({
      configured: true,
      rows: [{
        job: "application-expiry",
        status: "SUCCEEDED",
        triggerSource: "vercel-cron",
        startedAt: new Date("2026-07-15T11:45:00.000Z"),
        completedAt: new Date("2026-07-15T11:45:10.000Z"),
      }],
      jobs: ["application-expiry", "review-backlog"],
      now,
      initialGraceStartedAt: activation,
    }).status).toBe("PENDING")
    expect(evaluateScheduledWorkerStatus({
      configured: true,
      rows: [],
      jobs: ["review-backlog"],
      now: new Date("2026-07-17T11:30:01.000Z"),
      initialGraceStartedAt: activation,
    }).status).toBe("STALE")
    expect(evaluateScheduledWorkerStatus({
      configured: true,
      rows: [],
      jobs: ["review-backlog"],
      now,
      initialGraceStartedAt: new Date("2026-07-16T11:30:00.000Z"),
    }).status).toBe("STALE")
  })

  it("requires genuine alert, backup, and restore success before readiness", () => {
    expect(evaluateAlertEvidenceStatus({ configured: true, rows: [], now }).status)
      .toBe("MANUAL_VERIFICATION_REQUIRED")
    expect(evaluateRecoveryEvidenceStatus({ ownerConfigured: true, rows: [], now }).status)
      .toBe("MANUAL_VERIFICATION_REQUIRED")
    const rows = [
      { type: "BACKUP_VERIFICATION", status: "SUCCEEDED", requestedAt: now, verifiedAt: new Date("2026-07-15T11:30:00.000Z") },
      { type: "RESTORE_VERIFICATION", status: "SUCCEEDED", requestedAt: now, verifiedAt: new Date("2026-07-01T10:00:00.000Z") },
    ]
    expect(evaluateRecoveryEvidenceStatus({ ownerConfigured: true, rows, now }).status).toBe("READY")
    expect(evaluateRecoveryEvidenceStatus({
      ownerConfigured: true,
      rows: [{ ...rows[0], verifiedAt: new Date("2026-07-13T10:00:00.000Z") }, rows[1]],
      now,
    }).status).toBe("STALE")
  })
})
