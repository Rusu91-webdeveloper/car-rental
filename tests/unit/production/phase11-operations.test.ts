import { describe, expect, it } from "vitest"
import {
  AUTOMATED_PRODUCTION_WORKER_JOBS,
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

  it("requires deliberate ownership, alert configuration, and the complete worker rollout", () => {
    const report = readProductionOperationsEnvironment({
      PRODUCTION_OWNER: "production-primary",
      PRODUCTION_ALERT_OWNER: "operations-primary",
      PRODUCTION_ALERT_RECIPIENT: "alerts@example.invalid",
      GMAIL_SMTP_USER: "bookings@example.invalid",
      GMAIL_SMTP_APP_PASSWORD: "abcdefghijklmnop",
      DATABASE_RECOVERY_OWNER: "database-primary",
      WORKER_MAINTENANCE_OWNER: "worker-primary",
      PRODUCTION_WORKERS_ENABLED_AT: "2026-07-15T12:00:00.000Z",
      PHASE8FB_WORKER_JOBS_ENABLED: PRODUCTION_WORKER_JOBS.join(","),
    })
    expect(report).toMatchObject({
      alertingConfigured: true,
      allOwnersAssigned: true,
      allWorkerJobsEnabled: true,
      allAutomatedWorkerJobsEnabled: true,
      legacyAlertAttestation: false,
      workerActivationAt: new Date("2026-07-15T12:00:00.000Z"),
    })
  })

  it("does not treat legacy timestamp or alert flags as readiness evidence", () => {
    const report = readProductionOperationsEnvironment({
      PRODUCTION_ALERTING_ATTESTED: "true",
      DATABASE_RECOVERY_OWNER: "database-primary",
      DATABASE_BACKUP_VERIFIED_AT: "2026-07-14T11:00:00.000Z",
      DATABASE_RESTORE_VERIFIED_AT: "2026-07-14T11:00:00.000Z",
      PHASE8FB_WORKER_JOBS_ENABLED: AUTOMATED_PRODUCTION_WORKER_JOBS.join(","),
    })
    expect(report.legacyAlertAttestation).toBe(true)
    expect(report.alertingConfigured).toBe(false)
    expect(report.allAutomatedWorkerJobsEnabled).toBe(true)
  })

  it("keeps destructive and costly jobs outside the automatic schedule", () => {
    expect(AUTOMATED_PRODUCTION_WORKER_JOBS).toEqual([
      "application-expiry",
      "review-backlog",
    ])
  })
})
