import { enforceRateLimit, PHASE8FB_RATE_LIMITS } from "@/lib/rate-limit"
import { enabledProductionWorkerJobs, isProductionWorkerJob, PRODUCTION_WORKER_JOBS } from "@/lib/production/operations-environment"
import { hasValidBearerSecret, manualExecutionKey, validIdempotencyKey } from "@/lib/production/request-auth"
import { executeProtectedWorker } from "@/lib/production/worker-execution"
import { executeProductionWorkerJob, summarizeProductionWorkerResult } from "@/lib/production/worker-jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(request: Request, job: string) {
  if (process.env.PHASE8FB_WORKERS_ENABLED !== "true") return false
  if (!enabledProductionWorkerJobs().has(job as typeof PRODUCTION_WORKER_JOBS[number])) return false
  return hasValidBearerSecret(request, process.env.PHASE8FB_WORKER_SECRET)
}

export async function POST(request: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params
  if (!isProductionWorkerJob(job)) return Response.json({ code: "WORKER_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "private, no-store" } })
  if (!authorized(request, job)) return Response.json({ code: "WORKER_DISABLED_OR_DENIED" }, { status: 403, headers: { "Cache-Control": "private, no-store" } })
  const idempotencyKey = validIdempotencyKey(request)
  if (!idempotencyKey)
    return Response.json({ code: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400, headers: { "Cache-Control": "private, no-store" } })
  try {
    await enforceRateLimit("worker", job, PHASE8FB_RATE_LIMITS.worker)
    const typedJob = job
    const execution = await executeProtectedWorker({
      job,
      deduplicationKey: manualExecutionKey(job, idempotencyKey),
      triggerSource: "manual",
      run: () => executeProductionWorkerJob(typedJob),
      summarize: (result) => summarizeProductionWorkerResult(typedJob, result),
    })
    const status = execution.status === "FAILED" || execution.status === "PARTIAL"
      ? 503
      : execution.status === "DUPLICATE" || execution.status === "CONCURRENT"
        ? 409
        : 200
    return Response.json(
      { job, status: execution.status, invocationId: execution.invocationId },
      { status, headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    console.error("[PHASE8FB_WORKER_ERROR]", {
      job,
      name: error instanceof Error ? error.name : "UnknownError",
    })
    return Response.json({ code: "WORKER_FAILED", job }, { status: 503, headers: { "Cache-Control": "private, no-store" } })
  }
}
