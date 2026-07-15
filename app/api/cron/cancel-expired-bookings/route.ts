import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { runBookingLifecycleMaintenance } from "@/lib/booking-expiration"

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || process.env.BOOKING_MAINTENANCE_WORKER_ENABLED !== "true") return false

  const authHeader = request.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  if (!token) return false
  const expected = Buffer.from(secret)
  const supplied = Buffer.from(token)
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401, headers: { "Cache-Control": "private, no-store" } })
  }

  const result = await runBookingLifecycleMaintenance()
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: Request) {
  return GET(request)
}
