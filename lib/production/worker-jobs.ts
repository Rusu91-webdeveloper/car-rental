import "server-only"

import { prisma } from "@/lib/db"
import { PrismaBookingApplicationRepository } from "@/lib/booking-applications/infrastructure/prisma-repository"
import { expireBookingApplications } from "@/lib/booking-applications/service"
import { DocumentCleanupService } from "@/lib/private-documents/application/cleanup-service"
import { DocumentDeletionService } from "@/lib/private-documents/application/deletion-service"
import { PrivateDocumentOperationsMonitoringService } from "@/lib/private-documents/application/operations-monitoring"
import { UnsupportedRecentAuthenticationVerifier } from "@/lib/private-documents/authorization/recent-auth"
import { readPrivateDocumentEnvironment } from "@/lib/private-documents/infrastructure/environment"
import { PrismaDocumentLifecycleRepository } from "@/lib/private-documents/infrastructure/prisma-repository"
import { createPrivateDocumentStorage } from "@/lib/private-documents/storage/factory"
import type { ProductionWorkerJob } from "./operations-environment"
import type { WorkerSummary } from "./worker-execution"

type BatchLike = { examined?: number; succeeded?: number; failed?: number }

function documentServices() {
  const environment = readPrivateDocumentEnvironment()
  const repository = new PrismaDocumentLifecycleRepository(prisma)
  const storage = createPrivateDocumentStorage({
    environment,
    localRoot: process.env.PRIVATE_DOCUMENT_LOCAL_ROOT ?? "/tmp/car-rental-private-documents",
  })
  const deletion = new DocumentDeletionService(
    repository,
    storage,
    new UnsupportedRecentAuthenticationVerifier(),
  )
  return {
    environment,
    repository,
    storage,
    cleanup: new DocumentCleanupService(repository, storage, deletion, async () => {
      throw new Error("Automated scanner retry is disabled in manual-review mode.")
    }),
    monitoring: new PrivateDocumentOperationsMonitoringService(repository, storage),
  }
}

export async function executeProductionWorkerJob(job: ProductionWorkerJob) {
  if (job === "application-expiry") {
    const expired = await expireBookingApplications(
      new PrismaBookingApplicationRepository(prisma),
      new Date(),
      100,
    )
    return { expired }
  }

  const services = documentServices()
  if (job === "abandoned-upload-cleanup") {
    return {
      objects: await services.cleanup.cleanupAbandonedUploadObjects(50),
      sessions: await services.cleanup.expireUploadSessions(50),
    }
  }
  if (job === "review-backlog")
    return services.monitoring.inspectReviewBacklog({ alertCount: 25 })
  if (job === "stale-review")
    return services.monitoring.inspectReviewBacklog({
      staleAfterMs: 24 * 60 * 60_000,
      alertCount: Number.MAX_SAFE_INTEGER,
    })
  if (job === "retention-processing" || job === "deletion-processing")
    return services.cleanup.processDueDocumentDeletions(25)
  if (job === "failed-deletion-retry") {
    const failed = await prisma.documentDeletionRequest.findMany({
      where: { status: "FAILED" },
      select: { idempotencyKey: true },
      orderBy: { requestedAt: "asc" },
      take: 50,
    })
    return services.cleanup.retryFailedDeletions(failed.map((value) => value.idempotencyKey))
  }
  return services.monitoring.reconcileOrphanObjects({
    prefix: `private-documents/${services.environment.environmentId}/`,
    limit: services.environment.reconciliationBatchSize,
  })
}

export function summarizeProductionWorkerResult(
  job: ProductionWorkerJob,
  result: Awaited<ReturnType<typeof executeProductionWorkerJob>>,
): WorkerSummary {
  if (job === "application-expiry" && "expired" in result) {
    return { examined: result.expired, succeeded: result.expired, failed: 0 }
  }
  if (job === "abandoned-upload-cleanup" && "objects" in result && "sessions" in result) {
    const objects = result.objects as BatchLike
    const sessions = result.sessions as BatchLike
    return {
      examined: (objects.examined ?? 0) + (sessions.examined ?? 0),
      succeeded: (objects.succeeded ?? 0) + (sessions.succeeded ?? 0),
      failed: (objects.failed ?? 0) + (sessions.failed ?? 0),
    }
  }
  if ("pending" in result) {
    return { examined: result.pending, succeeded: result.pending, failed: 0 }
  }
  const summary = result as BatchLike
  return {
    examined: summary.examined,
    succeeded: summary.succeeded,
    failed: summary.failed,
  }
}
