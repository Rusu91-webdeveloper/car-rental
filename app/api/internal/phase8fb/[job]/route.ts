import { timingSafeEqual } from "node:crypto"
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
import { enforceRateLimit, PHASE8FB_RATE_LIMITS } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const JOBS = new Set([
  "application-expiry",
  "abandoned-upload-cleanup",
  "review-backlog",
  "stale-review",
  "retention-processing",
  "deletion-processing",
  "failed-deletion-retry",
  "orphan-reconciliation",
])

function authorized(request: Request) {
  if (process.env.NODE_ENV === "production") return false
  if (process.env.PHASE8FB_WORKERS_ENABLED !== "true") return false
  const secret = process.env.PHASE8FB_WORKER_SECRET
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!secret || !supplied) return false
  const expectedBytes = Buffer.from(secret)
  const suppliedBytes = Buffer.from(supplied)
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)
}

export async function POST(request: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params
  if (!JOBS.has(job)) return Response.json({ code: "WORKER_NOT_FOUND" }, { status: 404 })
  if (!authorized(request)) return Response.json({ code: "WORKER_DISABLED_OR_DENIED" }, { status: 403 })
  try {
    enforceRateLimit("worker", job, PHASE8FB_RATE_LIMITS.worker)
    if (job === "application-expiry") {
      const expired = await expireBookingApplications(new PrismaBookingApplicationRepository(prisma), new Date(), 100)
      return Response.json({ job, expired })
    }
    const environment = readPrivateDocumentEnvironment()
    const repository = new PrismaDocumentLifecycleRepository(prisma)
    const storage = createPrivateDocumentStorage({
      environment,
      localRoot: process.env.PRIVATE_DOCUMENT_LOCAL_ROOT ?? "/tmp/car-rental-private-documents",
    })
    const deletion = new DocumentDeletionService(repository, storage, new UnsupportedRecentAuthenticationVerifier())
    const cleanup = new DocumentCleanupService(repository, storage, deletion, async () => {
      throw new Error("Automated scanner retry is disabled in manual-review mode.")
    })
    const monitoring = new PrivateDocumentOperationsMonitoringService(repository, storage)
    let result: unknown
    if (job === "abandoned-upload-cleanup") {
      result = {
        objects: await cleanup.cleanupAbandonedUploadObjects(50),
        sessions: await cleanup.expireUploadSessions(50),
      }
    } else if (job === "review-backlog") {
      result = await monitoring.inspectReviewBacklog({ alertCount: 25 })
    } else if (job === "stale-review") {
      result = await monitoring.inspectReviewBacklog({ staleAfterMs: 24 * 60 * 60_000, alertCount: Number.MAX_SAFE_INTEGER })
    } else if (job === "retention-processing" || job === "deletion-processing") {
      result = await cleanup.processDueDocumentDeletions(25)
    } else if (job === "failed-deletion-retry") {
      const failed = await prisma.documentDeletionRequest.findMany({
        where: { status: "FAILED" },
        select: { idempotencyKey: true },
        orderBy: { requestedAt: "asc" },
        take: 50,
      })
      result = await cleanup.retryFailedDeletions(failed.map((value) => value.idempotencyKey))
    } else {
      result = await monitoring.reconcileOrphanObjects({
        prefix: `private-documents/${environment.environmentId}/`,
        limit: environment.reconciliationBatchSize,
      })
    }
    return Response.json({ job, result }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("[PHASE8FB_WORKER_ERROR]", {
      job,
      name: error instanceof Error ? error.name : "UnknownError",
    })
    return Response.json({ code: "WORKER_FAILED", job }, { status: 503 })
  }
}
