import { NextResponse } from "next/server"
import { processBookingNotificationOutbox } from "@/lib/booking-notifications"
import { BOOKING_NOTIFICATION_JOB, cronTenMinuteExecutionKey } from "@/lib/production/cron-schedule"
import { hasValidBearerSecret } from "@/lib/production/request-auth"
import { executeProtectedWorker } from "@/lib/production/worker-execution"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const PATH = "/api/cron/booking-notifications"

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "production")
    return NextResponse.json({ code: "CRON_PRODUCTION_ONLY" }, { status: 403 })
  if (
    process.env.BOOKING_MAINTENANCE_WORKER_ENABLED !== "true" ||
    !hasValidBearerSecret(request, process.env.CRON_SECRET)
  ) return new NextResponse("Unauthorized", { status: 401 })

  const execution = await executeProtectedWorker({
    job: BOOKING_NOTIFICATION_JOB,
    deduplicationKey: cronTenMinuteExecutionKey(PATH, BOOKING_NOTIFICATION_JOB),
    triggerSource: "vercel-cron",
    timeoutMs: 50_000,
    run: () => processBookingNotificationOutbox(5),
    summarize: (result) => ({ examined: result.examined, succeeded: result.sent, failed: result.failed }),
  })
  const failed = execution.status === "FAILED" || execution.status === "PARTIAL"
  return NextResponse.json(
    { status: execution.status, invocationId: execution.invocationId },
    { status: failed ? 503 : 200, headers: { "Cache-Control": "private, no-store" } },
  )
}
