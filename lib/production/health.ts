import "server-only"

import { prisma } from "@/lib/db"
import { getEmailConfigStatus } from "@/lib/email"
import { readPrivateDocumentEnvironment } from "@/lib/private-documents/infrastructure/environment"
import { PRODUCTION_WORKER_JOBS, readProductionOperationsEnvironment } from "@/lib/production/operations-environment"

export type HealthStatus = "PASS" | "WARN" | "FAIL"

export interface ProductionHealthCheck {
  key: string
  label: string
  status: HealthStatus
  summary: string
}

function check(
  key: string,
  label: string,
  status: HealthStatus,
  summary: string,
): ProductionHealthCheck {
  return { key, label, status, summary }
}

export async function getProductionHealthReport(now = new Date()) {
  const environment = readPrivateDocumentEnvironment()
  const operations = readProductionOperationsEnvironment(process.env, now)
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000)
  const staleReviewAt = new Date(now.getTime() - 24 * 60 * 60_000)

  const database = await prisma.$queryRaw`SELECT 1`
    .then(() => check("database", "Database", "PASS", "Connection and query succeeded."))
    .catch(() => check("database", "Database", "FAIL", "Connection or query failed."))

  const [release, legalCounts, workerRows, roleRows, pendingReviews, staleReviews, overdueRetention, recentAudit] =
    await Promise.all([
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
        where: { job: { in: [...PRODUCTION_WORKER_JOBS] }, startedAt: { gte: dayAgo } },
        orderBy: { startedAt: "desc" },
        distinct: ["job"],
        select: { job: true, status: true, completedAt: true },
      }),
      prisma.accessRole.findMany({
        where: { key: { in: ["DOCUMENT_REVIEWER", "DOCUMENT_SECURITY_ADMIN", "DOCUMENT_RETENTION_OPERATOR"] }, status: "ACTIVE" },
        select: { key: true, _count: { select: { userAssignments: true } } },
      }),
      prisma.customerDocument.count({ where: { manualReviewStatus: "PENDING_REVIEW", isCurrent: true } }),
      prisma.customerDocument.count({ where: { manualReviewStatus: "PENDING_REVIEW", isCurrent: true, metadataVerifiedAt: { lt: staleReviewAt } } }),
      prisma.customerDocument.count({ where: { deletionStatus: { in: ["RETAINED", "SCHEDULED", "FAILED"] }, legalHold: false, deletionEligibleAt: { lte: now } } }),
      prisma.auditEvent.count({ where: { createdAt: { gte: dayAgo } } }),
    ])

  const configuration = release && release.validationStatus === "VALID"
    ? check("configuration", "Configuration release", "PASS", "One validated active release is available.")
    : check("configuration", "Configuration release", "FAIL", "A validated active release is required.")
  const pricing = release?.fleetRateSet.status === "RELEASED" &&
      release.fleetRateSet.validationStatus === "VALID" && release.fleetRateSet.rates.length > 0
    ? check("pricing", "Pricing", "PASS", "The active release has a validated rate set.")
    : check("pricing", "Pricing", "FAIL", "The active release has no usable validated rate set.")
  const publishedTypes = new Set(legalCounts.map((row) => row.type))
  const legal = publishedTypes.has("RENTAL_TERMS") && publishedTypes.has("PRIVACY_NOTICE")
    ? check("legal", "Legal publication", "PASS", "Required validated publications exist.")
    : check("legal", "Legal publication", "FAIL", "Validated rental terms and privacy notice are required.")

  const blobReady = environment.storageProvider === "vercel-blob-private" &&
    Boolean(environment.expectedStoreId) && environment.expectedStoreId === environment.actualStoreId &&
    environment.privateAccessAttested && environment.regionAttested && !environment.staticTokenAvailable
  const blob = blobReady
    ? check("blob", "Private Blob", "PASS", "Private store identity and attestations are configured.")
    : check("blob", "Private Blob", environment.production ? "FAIL" : "WARN", "Private store configuration is incomplete.")
  const oidc = environment.oidcAvailable
    ? check("oidc", "OIDC", "PASS", "Runtime OIDC identity is available.")
    : check("oidc", "OIDC", environment.production ? "FAIL" : "WARN", "Runtime OIDC identity is unavailable.")

  const successfulJobs = new Set(workerRows.filter((row) => row.status === "SUCCEEDED" && row.completedAt).map((row) => row.job))
  const workersEnabled = process.env.PHASE8FB_WORKERS_ENABLED === "true"
  const workers = workersEnabled && operations.allWorkerJobsEnabled && PRODUCTION_WORKER_JOBS.every((job) => successfulJobs.has(job))
    ? check("workers", "Workers", "PASS", "All required jobs succeeded within 24 hours.")
    : check("workers", "Workers", environment.production ? "FAIL" : "WARN", workersEnabled ? "Worker rollout is incomplete or one or more jobs lack a recent successful heartbeat." : "Worker execution is disabled.")

  const monitoring = operations.alertingReady
    ? check("monitoring", "Monitoring and alerts", "PASS", "External production alerting and an escalation owner are attested.")
    : check("monitoring", "Monitoring and alerts", environment.production ? "FAIL" : "WARN", "External alert delivery and an escalation owner are required.")
  const recovery = operations.backupReady && operations.restoreReady
    ? check("recovery", "Backup and restore", "PASS", "A recent backup and restore rehearsal are recorded with an owner.")
    : check("recovery", "Backup and restore", environment.production ? "FAIL" : "WARN", "A backup within 24 hours and restore rehearsal within 90 days are required.")

  const assignedRoles = new Set(roleRows.filter((row) => row._count.userAssignments > 0).map((row) => row.key))
  const roles = ["DOCUMENT_REVIEWER", "DOCUMENT_SECURITY_ADMIN", "DOCUMENT_RETENTION_OPERATOR"].every((key) => assignedRoles.has(key))
    ? check("roles", "Restricted roles", "PASS", "Required operational roles have explicit assignments.")
    : check("roles", "Restricted roles", "FAIL", "Reviewer, security, and retention owners must be assigned.")
  const reviewQueue = staleReviews > 0
    ? check("review-queue", "Review queue", "WARN", `${pendingReviews} pending; ${staleReviews} older than 24 hours.`)
    : check("review-queue", "Review queue", "PASS", `${pendingReviews} pending; none older than 24 hours.`)
  const retention = overdueRetention > 0
    ? check("retention", "Retention", "FAIL", `${overdueRetention} document records require deletion processing.`)
    : check("retention", "Retention", "PASS", "No overdue deletion candidates were found.")
  const audit = recentAudit > 0
    ? check("audit", "Audit trail", "PASS", "Audit evidence was persisted within 24 hours.")
    : check("audit", "Audit trail", "WARN", "No audit evidence was persisted within 24 hours.")
  const emailStatus = getEmailConfigStatus()
  const emails = emailStatus.enabled
    ? check("emails", "Email", "PASS", `${emailStatus.provider} is configured; no message was sent.`)
    : check("emails", "Email", "FAIL", "No email provider is configured.")

  const checks = [database, configuration, pricing, legal, blob, oidc, monitoring, recovery, workers, roles, reviewQueue, retention, audit, emails]
  return {
    generatedAt: now.toISOString(),
    status: checks.some((item) => item.status === "FAIL") ? "NOT_READY" as const : checks.some((item) => item.status === "WARN") ? "DEGRADED" as const : "READY" as const,
    checks,
  }
}
