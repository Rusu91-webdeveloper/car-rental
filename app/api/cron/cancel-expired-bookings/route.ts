import { NextResponse } from "next/server"
import { runBookingLifecycleMaintenance } from "@/lib/booking-expiration"
import { BOOKING_MAINTENANCE_JOB, cronExecutionKey } from "@/lib/production/cron-schedule"
import { hasValidBearerSecret, manualExecutionKey, validIdempotencyKey } from "@/lib/production/request-auth"
import { executeProtectedWorker } from "@/lib/production/worker-execution"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const PATH = "/api/cron/cancel-expired-bookings"

function isAuthorized(request: Request) {
  return (
    process.env.BOOKING_MAINTENANCE_WORKER_ENABLED === "true" &&
    hasValidBearerSecret(request, process.env.CRON_SECRET)
  )
}

function summarize(result: Awaited<ReturnType<typeof runBookingLifecycleMaintenance>>) {
  return {
    examined: result.cancelled + result.completed + result.notifications.examined,
    succeeded: result.cancelled + result.completed + result.notifications.sent,
    failed: result.completionEmailsFailed + result.notifications.failed,
  }
}

async function run(request: Request, triggerSource: "vercel-cron" | "manual") {
  if (process.env.VERCEL_ENV !== "production")
    return NextResponse.json(
      { code: "CRON_PRODUCTION_ONLY" },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    )
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401, headers: { "Cache-Control": "private, no-store" } })
  }
  const idempotencyKey = triggerSource === "manual" ? validIdempotencyKey(request) : undefined
  if (triggerSource === "manual" && !idempotencyKey)
    return NextResponse.json(
      { code: "IDEMPOTENCY_KEY_REQUIRED" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    )
  const execution = await executeProtectedWorker({
    job: BOOKING_MAINTENANCE_JOB,
    deduplicationKey:
      triggerSource === "manual"
        ? manualExecutionKey(BOOKING_MAINTENANCE_JOB, idempotencyKey as string)
        : cronExecutionKey(PATH, BOOKING_MAINTENANCE_JOB),
    triggerSource,
    run: () => runBookingLifecycleMaintenance(),
    summarize,
  })
  const status = execution.status === "FAILED" || execution.status === "PARTIAL"
    ? 503
    : execution.status === "DUPLICATE" || execution.status === "CONCURRENT"
      ? 409
      : 200
  return NextResponse.json(
    { status: execution.status, invocationId: execution.invocationId },
    { status, headers: { "Cache-Control": "private, no-store" } },
  )
}

export function GET(request: Request) {
  return run(request, "vercel-cron")
}

export async function POST(request: Request) {
  return run(request, "manual")
}
