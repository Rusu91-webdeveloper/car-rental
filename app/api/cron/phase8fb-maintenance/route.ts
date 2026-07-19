import { cronExecutionKey } from "@/lib/production/cron-schedule"
import {
  AUTOMATED_PRODUCTION_WORKER_JOBS,
  enabledProductionWorkerJobs,
} from "@/lib/production/operations-environment"
import { hasValidBearerSecret } from "@/lib/production/request-auth"
import { executeProtectedWorker } from "@/lib/production/worker-execution"
import {
  executeProductionWorkerJob,
  summarizeProductionWorkerResult,
} from "@/lib/production/worker-jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const PATH = "/api/cron/phase8fb-maintenance"
const BATCH_JOB_TIMEOUT_MS = 20_000
const ROUTE_DEADLINE_MS = 45_000

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "production")
    return Response.json(
      { code: "CRON_PRODUCTION_ONLY" },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    )
  if (!hasValidBearerSecret(request, process.env.CRON_SECRET))
    return Response.json(
      { code: "CRON_UNAUTHORIZED" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    )

  const enabled = enabledProductionWorkerJobs()
  if (
    process.env.PHASE8FB_WORKERS_ENABLED !== "true" ||
    AUTOMATED_PRODUCTION_WORKER_JOBS.some((job) => !enabled.has(job))
  )
    return Response.json(
      { code: "CRON_NOT_CONFIGURED" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    )

  const now = new Date()
  const deadlineAt = Date.now() + ROUTE_DEADLINE_MS
  const executions = []
  for (const job of AUTOMATED_PRODUCTION_WORKER_JOBS) {
    const remainingMs = deadlineAt - Date.now()
    if (remainingMs <= 1_000) {
      executions.push({ job, status: "ROUTE_DEADLINE_EXCEEDED", invocationId: null })
      break
    }
    const execution = await executeProtectedWorker({
      job,
      deduplicationKey: cronExecutionKey(PATH, job, now),
      triggerSource: "vercel-cron",
      timeoutMs: Math.min(BATCH_JOB_TIMEOUT_MS, remainingMs - 1_000),
      run: () => executeProductionWorkerJob(job),
      summarize: (result) => summarizeProductionWorkerResult(job, result),
    })
    executions.push({
      job,
      status: execution.status,
      invocationId: execution.invocationId,
    })
  }
  const failed = executions.some((execution) =>
    ["FAILED", "PARTIAL", "CONCURRENT", "ROUTE_DEADLINE_EXCEEDED"].includes(execution.status),
  )
  return Response.json(
    { status: failed ? "FAILED" : "SUCCEEDED", executions },
    { status: failed ? 503 : 200, headers: { "Cache-Control": "private, no-store" } },
  )
}
