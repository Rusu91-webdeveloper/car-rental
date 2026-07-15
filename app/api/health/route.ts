import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json(
      { status: "healthy" },
      { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    )
  } catch (error) {
    logger.error("health.database_unavailable", { error })
    return NextResponse.json(
      { status: "unhealthy" },
      { status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    )
  }
}
