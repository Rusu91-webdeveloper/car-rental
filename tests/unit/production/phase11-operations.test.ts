import { describe, expect, it } from "vitest"
import {
  PRODUCTION_WORKER_JOBS,
  enabledProductionWorkerJobs,
  readProductionOperationsEnvironment,
} from "@/lib/production/operations-environment"

describe("production operations environment", () => {
  it("enables only explicitly staged known worker jobs", () => {
    const enabled = enabledProductionWorkerJobs({
      PHASE8FB_WORKER_JOBS_ENABLED: "review-backlog,unknown,deletion-processing",
    })
    expect([...enabled]).toEqual(["review-backlog", "deletion-processing"])
  })

  it("requires fresh recovery evidence, alert ownership, and the complete worker rollout", () => {
    const now = new Date("2026-07-14T12:00:00.000Z")
    const report = readProductionOperationsEnvironment({
      PRODUCTION_ALERTING_ATTESTED: "true",
      PRODUCTION_ALERT_OWNER: "operations-primary",
      DATABASE_RECOVERY_OWNER: "database-primary",
      DATABASE_BACKUP_VERIFIED_AT: "2026-07-14T11:00:00.000Z",
      DATABASE_RESTORE_VERIFIED_AT: "2026-06-14T12:00:00.000Z",
      PHASE8FB_WORKER_JOBS_ENABLED: PRODUCTION_WORKER_JOBS.join(","),
    }, now)
    expect(report).toMatchObject({
      alertingReady: true,
      backupReady: true,
      restoreReady: true,
      allWorkerJobsEnabled: true,
    })
  })

  it("expires stale backup and restore attestations", () => {
    const report = readProductionOperationsEnvironment({
      DATABASE_RECOVERY_OWNER: "database-primary",
      DATABASE_BACKUP_VERIFIED_AT: "2026-07-12T00:00:00.000Z",
      DATABASE_RESTORE_VERIFIED_AT: "2026-01-01T00:00:00.000Z",
    }, new Date("2026-07-14T12:00:00.000Z"))
    expect(report.backupReady).toBe(false)
    expect(report.restoreReady).toBe(false)
  })
})
