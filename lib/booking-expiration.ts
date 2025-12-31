import type { Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/db"
import { BOOKING_PAYMENT_WINDOW_MS } from "@/lib/constants"

type DbClient = PrismaClient | Prisma.TransactionClient

export async function cancelExpiredBookings(db: DbClient = prisma, now = new Date()) {
  const cutoff = new Date(now.getTime() - BOOKING_PAYMENT_WINDOW_MS)

  const { count } = await db.booking.updateMany({
    where: {
      status: "PENDING",
      paymentStatus: "PENDING",
      createdAt: { lt: cutoff },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
    },
  })

  return count
}
