import { NextResponse } from "next/server"
import { runBookingLifecycleMaintenance } from "@/lib/booking-expiration"

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return true
  }

  const authHeader = request.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  return token === secret
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const result = await runBookingLifecycleMaintenance()
  return NextResponse.json(result)
}

export async function POST(request: Request) {
  return GET(request)
}
