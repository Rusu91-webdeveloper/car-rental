import "server-only"

import { prisma } from "@/lib/db"
import { getEmailConfigStatus } from "@/lib/email"
import { readPrivateDocumentEnvironment } from "@/lib/private-documents/infrastructure/environment"
import { SCHEDULED_PRODUCTION_JOBS } from "@/lib/production/cron-schedule"
import { readProductionOperationsEnvironment } from "@/lib/production/operations-environment"

const DAY_MS = 24 * 60 * 60_000
const WORKER_MAX_AGE_MS = 48 * 60 * 60_000
const ALERT_MAX_AGE_MS = 30 * DAY_MS
const RESTORE_MAX_AGE_MS = 90 * DAY_MS

export type HealthStatus =
  | "READY"
  | "PENDING"
  | "BLOCKED"
  | "STALE"
  | "FAILING"
  | "NOT_CONFIGURED"
  | "MANUAL_VERIFICATION_REQUIRED"

export interface ProductionHealthCheck {
  key: string
  label: string
  status: HealthStatus
  evidence: string
  lastVerifiedAt?: string
  blockedReason?: string
  remediation: string
  verificationMode: "AUTOMATIC" | "MANUAL"
}

function check(input: ProductionHealthCheck) {
  return input
}

function recent(value: Date | null | undefined, maximumAgeMs: number, now: Date) {
  return Boolean(
    value && value.getTime() <= now.getTime() && now.getTime() - value.getTime() <= maximumAgeMs,
  )
}

function latestBy<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T>()
  for (const row of rows) if (!result.has(key(row))) result.set(key(row), row)
  return result
}

type WorkerEvidenceRow = {
  job: string
  status: string
  triggerSource?: string
  startedAt: Date
  completedAt: Date | null
  failureCode?: string | null
}

type OperationalEvidenceRow = {
  type: string
  status: string
  requestedAt: Date
  verifiedAt: Date | null
  completedAt?: Date | null
  failureCode?: string | null
}

export function evaluateScheduledWorkerStatus(input: {
  configured: boolean
  rows: WorkerEvidenceRow[]
  now: Date
  jobs?: readonly string[]
  initialGraceStartedAt?: Date
}) {
  const jobs = input.jobs ?? SCHEDULED_PRODUCTION_JOBS
  const cronRows = input.rows.filter((row) => row.triggerSource === "vercel-cron")
  const latest = latestBy(cronRows, (row) => row.job)
  const successful = latestBy(
    cronRows.filter((row) => row.status === "SUCCEEDED" && row.completedAt),
    (row) => row.job,
  )
  const failing = jobs.some((job) => {
    const row = latest.get(job)
    return Boolean(
      row &&
      (["FAILED", "PARTIAL", "SKIPPED"].includes(row.status) ||
        (row.status === "RUNNING" && input.now.getTime() - row.startedAt.getTime() > 10 * 60_000)),
    )
  })
  const stale = jobs.some(
    (job) => !recent(successful.get(job)?.completedAt, WORKER_MAX_AGE_MS, input.now),
  )
  const withinInitialGrace = Boolean(
    jobs.some((job) => !latest.has(job)) &&
    input.initialGraceStartedAt &&
    input.initialGraceStartedAt.getTime() <= input.now.getTime() &&
    input.now.getTime() - input.initialGraceStartedAt.getTime() <= WORKER_MAX_AGE_MS,
  )
  const status: HealthStatus = !input.configured
    ? "NOT_CONFIGURED"
    : failing
      ? "FAILING"
      : withinInitialGrace
        ? "PENDING"
        : stale
          ? "STALE"
          : "READY"
  const initialGraceExpiresAt = input.initialGraceStartedAt
    ? new Date(input.initialGraceStartedAt.getTime() + WORKER_MAX_AGE_MS)
    : undefined
  return { status, latest, successful, initialGraceExpiresAt }
}

export function evaluateAlertEvidenceStatus(input: {
  configured: boolean
  rows: OperationalEvidenceRow[]
  now: Date
}) {
  const latest = latestBy(input.rows, (row) => row.type)
  const successful = latestBy(
    input.rows.filter((row) => row.status === "SUCCEEDED" && row.verifiedAt),
    (row) => row.type,
  )
  const attempt = latest.get("ALERT_DELIVERY")
  const success = successful.get("ALERT_DELIVERY")
  let status: HealthStatus = "READY"
  if (!input.configured) status = "NOT_CONFIGURED"
  else if (attempt?.status === "FAILED" && (!success || attempt.requestedAt > success.requestedAt)) status = "FAILING"
  else if (!success) status = "MANUAL_VERIFICATION_REQUIRED"
  else if (!recent(success.verifiedAt, ALERT_MAX_AGE_MS, input.now)) status = "STALE"
  return { status, attempt, success }
}

export function evaluateRecoveryEvidenceStatus(input: {
  ownerConfigured: boolean
  rows: OperationalEvidenceRow[]
  now: Date
}) {
  const latest = latestBy(input.rows, (row) => row.type)
  const successful = latestBy(
    input.rows.filter((row) => row.status === "SUCCEEDED" && row.verifiedAt),
    (row) => row.type,
  )
  const backupAttempt = latest.get("BACKUP_VERIFICATION")
  const restoreAttempt = latest.get("RESTORE_VERIFICATION")
  const backupSuccess = successful.get("BACKUP_VERIFICATION")
  const restoreSuccess = successful.get("RESTORE_VERIFICATION")
  const failed =
    (backupAttempt?.status === "FAILED" && (!backupSuccess || backupAttempt.requestedAt > backupSuccess.requestedAt)) ||
    (restoreAttempt?.status === "FAILED" && (!restoreSuccess || restoreAttempt.requestedAt > restoreSuccess.requestedAt))
  let status: HealthStatus = "READY"
  if (!input.ownerConfigured) status = "NOT_CONFIGURED"
  else if (failed) status = "FAILING"
  else if (!backupSuccess || !restoreSuccess) status = "MANUAL_VERIFICATION_REQUIRED"
  else if (!recent(backupSuccess.verifiedAt, DAY_MS, input.now) || !recent(restoreSuccess.verifiedAt, RESTORE_MAX_AGE_MS, input.now)) status = "STALE"
  return { status, backupSuccess, restoreSuccess }
}

export async function getProductionHealthReport(now = new Date()) {
  const environment = readPrivateDocumentEnvironment()
  const operations = readProductionOperationsEnvironment()
  const dayAgo = new Date(now.getTime() - DAY_MS)
  const staleReviewAt = new Date(now.getTime() - DAY_MS)

  const [databaseOk, release, legalCounts, workerRows, roleRows, pendingReviews, staleReviews, overdueRetention, recentAudit, evidenceRows] =
    await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      prisma.businessConfigurationRelease.findFirst({
        where: { status: "ACTIVE" },
        orderBy: { activatedAt: "desc" },
        include: { fleetRateSet: { include: { rates: { select: { id: true }, take: 1 } } } },
      }),
      prisma.legalDocumentVersion.groupBy({
        by: ["type"],
        where: { status: "PUBLISHED", validationStatus: "VALID" },
        _count: true,
      }),
      prisma.workerExecution.findMany({
        where: {
          job: { in: [...SCHEDULED_PRODUCTION_JOBS] },
          triggerSource: "vercel-cron",
        },
        orderBy: { startedAt: "desc" },
        take: 100,
        select: {
          job: true,
          status: true,
          triggerSource: true,
          startedAt: true,
          completedAt: true,
          failureCode: true,
        },
      }),
      prisma.accessRole.findMany({
        where: {
          key: { in: ["DOCUMENT_REVIEWER", "DOCUMENT_SECURITY_ADMIN", "DOCUMENT_RETENTION_OPERATOR"] },
          status: "ACTIVE",
        },
        select: { key: true, _count: { select: { userAssignments: true } } },
      }),
      prisma.customerDocument.count({ where: { manualReviewStatus: "PENDING_REVIEW", isCurrent: true } }),
      prisma.customerDocument.count({
        where: {
          manualReviewStatus: "PENDING_REVIEW",
          isCurrent: true,
          metadataVerifiedAt: { lt: staleReviewAt },
        },
      }),
      prisma.customerDocument.count({
        where: {
          deletionStatus: { in: ["RETAINED", "SCHEDULED", "FAILED"] },
          legalHold: false,
          deletionEligibleAt: { lte: now },
        },
      }),
      prisma.auditEvent.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.operationalEvidence.findMany({
        where: { environment: "production" },
        orderBy: { requestedAt: "desc" },
        take: 100,
        select: {
          type: true,
          status: true,
          requestedAt: true,
          verifiedAt: true,
          completedAt: true,
          failureCode: true,
        },
      }),
    ])

  const checks: ProductionHealthCheck[] = []
  checks.push(check({
    key: "database",
    label: "Database",
    status: databaseOk ? "READY" : "FAILING",
    evidence: databaseOk ? "A live SELECT 1 query succeeded." : "The live database query failed.",
    lastVerifiedAt: databaseOk ? now.toISOString() : undefined,
    blockedReason: databaseOk ? undefined : "The application cannot verify database connectivity.",
    remediation: databaseOk ? "No action required." : "Restore database connectivity and rerun this report.",
    verificationMode: "AUTOMATIC",
  }))

  const configurationReady = Boolean(release && release.validationStatus === "VALID")
  checks.push(check({
    key: "configuration",
    label: "Configuration release",
    status: configurationReady ? "READY" : "BLOCKED",
    evidence: configurationReady ? "One validated active release is available." : "No validated active release was found.",
    blockedReason: configurationReady ? undefined : "Bookings require an active validated configuration release.",
    remediation: configurationReady ? "No action required." : "Validate and activate a Business Configuration release.",
    verificationMode: "AUTOMATIC",
  }))

  const pricingReady = Boolean(
    release?.fleetRateSet.status === "RELEASED" &&
      release.fleetRateSet.validationStatus === "VALID" &&
      release.fleetRateSet.rates.length > 0,
  )
  checks.push(check({
    key: "pricing",
    label: "Pricing",
    status: pricingReady ? "READY" : "BLOCKED",
    evidence: pricingReady ? "The active release has a validated non-empty rate set." : "No usable released rate set was found.",
    blockedReason: pricingReady ? undefined : "A validated released rate is required for authoritative quotes.",
    remediation: pricingReady ? "No action required." : "Release a validated rate set and attach it to the active release.",
    verificationMode: "AUTOMATIC",
  }))

  const publishedTypes = new Set(legalCounts.map((row) => row.type))
  const legalReady = publishedTypes.has("RENTAL_TERMS") && publishedTypes.has("PRIVACY_NOTICE")
  checks.push(check({
    key: "legal",
    label: "Legal publication",
    status: legalReady ? "READY" : "BLOCKED",
    evidence: legalReady ? "Validated Rental Terms and Privacy Notice are published." : "One or more required validated publications are missing.",
    blockedReason: legalReady ? undefined : "Required legal documents are not both published and valid.",
    remediation: legalReady ? "No action required." : "Publish validated Rental Terms and Privacy Notice versions.",
    verificationMode: "AUTOMATIC",
  }))

  const blobReady =
    environment.storageProvider === "vercel-blob-private" &&
    Boolean(environment.expectedStoreId) &&
    environment.expectedStoreId === environment.actualStoreId &&
    environment.privateAccessAttested &&
    environment.regionAttested &&
    !environment.staticTokenAvailable
  checks.push(check({
    key: "blob",
    label: "Private Blob",
    status: blobReady ? "READY" : "BLOCKED",
    evidence: blobReady ? "Private store identity, OIDC-only access, and region attestations match." : "Private Blob configuration is incomplete or mismatched.",
    blockedReason: blobReady ? undefined : "Private document storage cannot be trusted until identity and access checks match.",
    remediation: blobReady ? "No action required." : "Verify the private store ID, private access, FRA1 region, and absence of a static token.",
    verificationMode: "AUTOMATIC",
  }))

  checks.push(check({
    key: "oidc",
    label: "OIDC",
    status: environment.oidcAvailable ? "READY" : "BLOCKED",
    evidence: environment.oidcAvailable ? "Runtime OIDC identity is available." : "Runtime OIDC identity is unavailable.",
    blockedReason: environment.oidcAvailable ? undefined : "Private Blob requests require platform-issued OIDC identity.",
    remediation: environment.oidcAvailable ? "No action required." : "Use a Vercel production deployment with System Environment Variables enabled.",
    verificationMode: "AUTOMATIC",
  }))

  checks.push(check({
    key: "ownership",
    label: "Operational ownership",
    status: operations.allOwnersAssigned ? "READY" : "NOT_CONFIGURED",
    evidence: `Production owner: ${operations.ownership.production ? "configured" : "missing"}; alert responder: ${operations.ownership.alertResponder ? "configured" : "missing"}; database recovery owner: ${operations.ownership.databaseRecovery ? "configured" : "missing"}; worker maintenance owner: ${operations.ownership.workerMaintenance ? "configured" : "missing"}.`,
    blockedReason: operations.allOwnersAssigned ? undefined : "Every operational responsibility must be deliberately assigned.",
    remediation: operations.allOwnersAssigned ? "No action required." : "Configure PRODUCTION_OWNER, PRODUCTION_ALERT_OWNER, DATABASE_RECOVERY_OWNER, and WORKER_MAINTENANCE_OWNER.",
    verificationMode: "MANUAL",
  }))

  const alertEvaluation = evaluateAlertEvidenceStatus({
    configured: operations.alertingConfigured,
    rows: evidenceRows,
    now,
  })
  const alertSuccess = alertEvaluation.success
  const alertStatus = alertEvaluation.status
  checks.push(check({
    key: "monitoring",
    label: "Monitoring and alerts",
    status: alertStatus,
    evidence: alertSuccess?.verifiedAt
      ? `Last durable successful alert-delivery test: ${alertSuccess.verifiedAt.toISOString()}.`
      : "No durable successful alert-delivery test exists.",
    lastVerifiedAt: alertSuccess?.verifiedAt?.toISOString(),
    blockedReason: alertStatus === "READY" ? undefined : "An owner, recipient, provider, and successful delivery test within 30 days are required.",
    remediation: alertStatus === "READY" ? "Repeat the delivery test at least monthly." : "Configure the alert recipient, then invoke the protected alert-test endpoint as an authorized operator.",
    verificationMode: "MANUAL",
  }))

  const recoveryEvaluation = evaluateRecoveryEvidenceStatus({
    ownerConfigured: operations.ownership.databaseRecovery,
    rows: evidenceRows,
    now,
  })
  const { backupSuccess, restoreSuccess } = recoveryEvaluation
  const recoveryStatus = recoveryEvaluation.status
  checks.push(check({
    key: "recovery",
    label: "Backup and restore",
    status: recoveryStatus,
    evidence: `Backup: ${backupSuccess?.verifiedAt?.toISOString() ?? "no successful evidence"}; restore: ${restoreSuccess?.verifiedAt?.toISOString() ?? "no successful evidence"}.`,
    lastVerifiedAt: backupSuccess?.verifiedAt && restoreSuccess?.verifiedAt
      ? new Date(Math.min(backupSuccess.verifiedAt.getTime(), restoreSuccess.verifiedAt.getTime())).toISOString()
      : undefined,
    blockedReason: recoveryStatus === "READY" ? undefined : "A genuine backup within 24 hours and restore rehearsal within 90 days are required.",
    remediation: recoveryStatus === "READY" ? "Continue the documented backup and restore cadence." : "Execute the recovery runbook, then submit the protected evidence record with a safe database fingerprint.",
    verificationMode: "MANUAL",
  }))

  const workersConfigured =
    process.env.PHASE8FB_WORKERS_ENABLED === "true" &&
    process.env.BOOKING_MAINTENANCE_WORKER_ENABLED === "true" &&
    operations.allAutomatedWorkerJobsEnabled &&
    Boolean(operations.workerActivationAt)
  const workerEvaluation = evaluateScheduledWorkerStatus({
    configured: workersConfigured,
    rows: workerRows,
    now,
    initialGraceStartedAt: operations.workerActivationAt,
  })
  const latestWorkerRows = workerEvaluation.latest
  const successfulWorkerRows = workerEvaluation.successful
  const workerStatus = workerEvaluation.status
  const workerSuccessTimes = SCHEDULED_PRODUCTION_JOBS
    .map((job) => successfulWorkerRows.get(job)?.completedAt)
    .filter((value): value is Date => Boolean(value))
  checks.push(check({
    key: "workers",
    label: "Scheduled workers",
    status: workerStatus,
    evidence: SCHEDULED_PRODUCTION_JOBS.map((job) => {
      const row = latestWorkerRows.get(job)
      return `${job}: ${row ? `${row.status} at ${row.completedAt?.toISOString() ?? row.startedAt.toISOString()}` : "never executed"}`
    }).join("; ") + (workerStatus === "PENDING" && workerEvaluation.initialGraceExpiresAt
      ? `; initial activation grace expires ${workerEvaluation.initialGraceExpiresAt.toISOString()}`
      : ""),
    lastVerifiedAt: workerSuccessTimes.length === SCHEDULED_PRODUCTION_JOBS.length
      ? new Date(Math.min(...workerSuccessTimes.map((value) => value.getTime()))).toISOString()
      : undefined,
    blockedReason: workerStatus === "READY"
      ? undefined
      : workerStatus === "PENDING"
        ? "The first scheduled heartbeat has not occurred, but the initial 48-hour activation grace is still open."
        : "Configured schedules require a successful heartbeat for every automatic job within 48 hours.",
    remediation: workerStatus === "READY"
      ? "Monitor daily heartbeats and investigate partial or failed runs."
      : workerStatus === "PENDING"
        ? "Wait for the next registered cron windows, then inspect execution evidence and runtime logs."
        : "Confirm the two Vercel Cron entries are deployed, then inspect the protected execution evidence and runtime logs.",
    verificationMode: "AUTOMATIC",
  }))

  const assignedRoles = new Set(
    roleRows.filter((row) => row._count.userAssignments > 0).map((row) => row.key),
  )
  const rolesReady = ["DOCUMENT_REVIEWER", "DOCUMENT_SECURITY_ADMIN", "DOCUMENT_RETENTION_OPERATOR"].every(
    (key) => assignedRoles.has(key),
  )
  checks.push(check({
    key: "roles",
    label: "Restricted roles",
    status: rolesReady ? "READY" : "BLOCKED",
    evidence: rolesReady ? "All required restricted roles have active assignments." : "One or more restricted roles lack an active assignment.",
    blockedReason: rolesReady ? undefined : "Document review, security, and retention operations require explicit assignees.",
    remediation: rolesReady ? "Review role assignments periodically." : "Assign DOCUMENT_REVIEWER, DOCUMENT_SECURITY_ADMIN, and DOCUMENT_RETENTION_OPERATOR.",
    verificationMode: "MANUAL",
  }))

  checks.push(check({
    key: "review-queue",
    label: "Review queue",
    status: staleReviews > 0 ? "STALE" : "READY",
    evidence: `${pendingReviews} pending; ${staleReviews} older than 24 hours.`,
    blockedReason: staleReviews > 0 ? "At least one manual review is outside the 24-hour target." : undefined,
    remediation: staleReviews > 0 ? "Process the stale review queue using an assigned document reviewer." : "Continue daily queue monitoring.",
    verificationMode: "AUTOMATIC",
  }))

  checks.push(check({
    key: "retention",
    label: "Retention",
    status: overdueRetention > 0 ? "BLOCKED" : "READY",
    evidence: `${overdueRetention} document records currently require manual deletion processing.`,
    blockedReason: overdueRetention > 0 ? "Destructive deletion work is deliberately not scheduled automatically." : undefined,
    remediation: overdueRetention > 0 ? "Have the retention operator review and process eligible deletion requests manually." : "Continue manual retention review.",
    verificationMode: "MANUAL",
  }))

  checks.push(check({
    key: "audit",
    label: "Audit trail",
    status: recentAudit > 0 ? "READY" : "STALE",
    evidence: `${recentAudit} audit events were persisted within 24 hours.`,
    blockedReason: recentAudit > 0 ? undefined : "No recent audit persistence evidence is available.",
    remediation: recentAudit > 0 ? "No action required." : "Exercise an approved audited operation and confirm persistence.",
    verificationMode: "AUTOMATIC",
  }))

  const emailStatus = getEmailConfigStatus()
  checks.push(check({
    key: "emails",
    label: "Email",
    status: emailStatus.enabled ? "READY" : "NOT_CONFIGURED",
    evidence: emailStatus.enabled ? `${emailStatus.provider} is configured; this check sends no message.` : "No email provider is configured.",
    blockedReason: emailStatus.enabled ? undefined : "Transactional and alert-test email delivery require a configured provider.",
    remediation: emailStatus.enabled ? "Use the protected alert test for delivery evidence." : "Configure a verified Resend sender and API key.",
    verificationMode: "AUTOMATIC",
  }))

  const blockingStatuses: HealthStatus[] = [
    "BLOCKED",
    "FAILING",
    "NOT_CONFIGURED",
    "MANUAL_VERIFICATION_REQUIRED",
  ]
  return {
    generatedAt: now.toISOString(),
    status: checks.every((item) => item.status === "READY")
      ? "READY" as const
      : checks.some((item) => blockingStatuses.includes(item.status))
        ? "BLOCKED" as const
        : "DEGRADED" as const,
    checks,
  }
}
