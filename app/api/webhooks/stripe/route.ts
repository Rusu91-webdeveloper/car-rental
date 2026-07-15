import { NextResponse } from "next/server"

export async function POST() {
  return new NextResponse("Online payment is not available", {
    status: 410,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  })
}
