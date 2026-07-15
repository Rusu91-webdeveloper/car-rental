const DAY_MS = 24 * 60 * 60_000
type OperationsEnvironment = Readonly<Record<string, string | undefined>>

function verifiedWithin(value: string | undefined, maximumAgeMs: number, now: Date) {
  if (!value) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp <= now.getTime() && now.getTime() - timestamp <= maximumAgeMs
}

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
  now = new Date(),
) {
  const enabledWorkerJobs = enabledProductionWorkerJobs(env)
  return {
    alertingReady: env.PRODUCTION_ALERTING_ATTESTED === "true" && Boolean(env.PRODUCTION_ALERT_OWNER),
    alertOwnerAssigned: Boolean(env.PRODUCTION_ALERT_OWNER),
    backupReady:
      Boolean(env.DATABASE_RECOVERY_OWNER) &&
      verifiedWithin(env.DATABASE_BACKUP_VERIFIED_AT, DAY_MS, now),
    restoreReady:
      Boolean(env.DATABASE_RECOVERY_OWNER) &&
      verifiedWithin(env.DATABASE_RESTORE_VERIFIED_AT, 90 * DAY_MS, now),
    enabledWorkerJobs,
    allWorkerJobsEnabled: PRODUCTION_WORKER_JOBS.every((job) => enabledWorkerJobs.has(job)),
  }
}
