type OperationsEnvironment = Readonly<Record<string, string | undefined>>

export const PRODUCTION_WORKER_JOBS = [
  "review-backlog",
  "stale-review",
  "application-expiry",
  "abandoned-upload-cleanup",
  "retention-processing",
  "orphan-reconciliation",
  "deletion-processing",
  "failed-deletion-retry",
] as const

export type ProductionWorkerJob = typeof PRODUCTION_WORKER_JOBS[number]

export function isProductionWorkerJob(value: string): value is ProductionWorkerJob {
  return PRODUCTION_WORKER_JOBS.includes(value as ProductionWorkerJob)
}

export const AUTOMATED_PRODUCTION_WORKER_JOBS = [
  "application-expiry",
  "review-backlog",
] as const satisfies readonly ProductionWorkerJob[]

export const MANUAL_PRODUCTION_WORKER_JOBS = PRODUCTION_WORKER_JOBS.filter(
  (job) => !AUTOMATED_PRODUCTION_WORKER_JOBS.includes(job as typeof AUTOMATED_PRODUCTION_WORKER_JOBS[number]),
)

export function enabledProductionWorkerJobs(env: OperationsEnvironment = process.env) {
  const configured = new Set(
    (env.PHASE8FB_WORKER_JOBS_ENABLED ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  )
  return new Set(PRODUCTION_WORKER_JOBS.filter((job) => configured.has(job)))
}

export function readProductionOperationsEnvironment(
  env: OperationsEnvironment = process.env,
) {
  const enabledWorkerJobs = enabledProductionWorkerJobs(env)
  const ownership = {
    production: Boolean(env.PRODUCTION_OWNER),
    alertResponder: Boolean(env.PRODUCTION_ALERT_OWNER),
    databaseRecovery: Boolean(env.DATABASE_RECOVERY_OWNER),
    workerMaintenance: Boolean(env.WORKER_MAINTENANCE_OWNER),
  }
  return {
    ownership,
    allOwnersAssigned: Object.values(ownership).every(Boolean),
    alertingConfigured:
      ownership.alertResponder &&
      Boolean(env.PRODUCTION_ALERT_RECIPIENT) &&
      Boolean(env.RESEND_API_KEY),
    legacyAlertAttestation: env.PRODUCTION_ALERTING_ATTESTED === "true",
    enabledWorkerJobs,
    allWorkerJobsEnabled: PRODUCTION_WORKER_JOBS.every((job) => enabledWorkerJobs.has(job)),
    allAutomatedWorkerJobsEnabled: AUTOMATED_PRODUCTION_WORKER_JOBS.every((job) => enabledWorkerJobs.has(job)),
  }
}
