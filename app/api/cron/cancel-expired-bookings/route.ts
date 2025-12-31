import { NextResponse } from "next/server"
import { cancelExpiredBookings } from "@/lib/booking-expiration"

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

  const cancelled = await cancelExpiredBookings()
  return NextResponse.json({ cancelled })
}

export async function POST(request: Request) {
  return GET(request)
}
