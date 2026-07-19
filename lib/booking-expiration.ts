import type { Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/db"
import { BOOKING_PAYMENT_WINDOW_MS } from "@/lib/constants"
import { config } from "@/lib/config"
import { sendBookingCompletionReviewEmail } from "@/lib/email"

type DbClient = PrismaClient | Prisma.TransactionClient
const normalizeBookingLocale = (locale: string | null | undefined) => (locale === "de" ? "de" : "en")
const formatDateForLocale = (date: Date, locale: string) =>
  new Date(date).toLocaleDateString(locale === "de" ? "de-DE" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

export async function cancelExpiredBookings(db: DbClient = prisma, now = new Date()) {
  const cutoff = new Date(now.getTime() - BOOKING_PAYMENT_WINDOW_MS)

  const { count } = await db.booking.updateMany({
    where: {
      status: "PENDING",
      paymentStatus: "PENDING",
      paymentMethod: "TRANSFER",
      createdAt: { lt: cutoff },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
    },
  })

  return count
}

export async function completeFinishedBookings(now = new Date()) {
  const bookingsToComplete = await prisma.booking.findMany({
    where: {
      status: { in: ["CONFIRMED", "IN_PROGRESS"] },
      dropoffDate: { lte: now },
    },
    include: {
      user: {
        select: {
          email: true,
          name: true,
        },
      },
      car: {
        select: {
          name: true,
          nameDe: true,
        },
      },
    },
    orderBy: { dropoffDate: "asc" },
    take: 200,
  })

  let completedCount = 0
  let completionEmailsSent = 0
  let completionEmailsFailed = 0

  for (const booking of bookingsToComplete) {
    const updated = await prisma.booking.updateMany({
      where: {
        id: booking.id,
        status: { in: ["CONFIRMED", "IN_PROGRESS"] },
      },
      data: {
        status: "COMPLETED",
        completedAt: now,
        paymentStatus: booking.paymentStatus === "PENDING" ? "PAID" : booking.paymentStatus,
      },
    })

    if (updated.count === 0) {
      continue
    }

    completedCount += 1

    if (!config.features.emailEnabled || !booking.user?.email) {
      continue
    }

    const bookingLocale = normalizeBookingLocale(booking.locale)
    const reviewUrl = `${config.appUrl.replace(/\/$/, "")}/${bookingLocale}/bookings`
    const localizedCarName = bookingLocale === "de" ? booking.car.nameDe || booking.car.name : booking.car.name
    const completionEmailResult = await sendBookingCompletionReviewEmail({
      to: booking.user.email,
      userName: booking.user.name || booking.user.email,
      carName: localizedCarName,
      bookingNumber: booking.bookingNumber,
      pickupDate: formatDateForLocale(booking.pickupDate, bookingLocale),
      dropoffDate: formatDateForLocale(booking.dropoffDate, bookingLocale),
      reviewUrl,
      locale: bookingLocale,
    })

    if (!completionEmailResult?.error) {
      completionEmailsSent += 1
    } else {
      completionEmailsFailed += 1
    }
  }

  // Backfill old completed bookings so verified reviews become available immediately.
  const normalizedCompletedPayments = await prisma.booking.updateMany({
    where: {
      status: "COMPLETED",
      paymentStatus: "PENDING",
    },
    data: {
      paymentStatus: "PAID",
    },
  })

  return {
    completed: completedCount,
    completionEmailsSent,
    completionEmailsFailed,
    normalizedCompletedPayments: normalizedCompletedPayments.count,
  }
}

export async function runBookingLifecycleMaintenance(now = new Date()) {
  const cancelled = await cancelExpiredBookings(prisma, now)
  const completionResult = await completeFinishedBookings(now)

  return {
    cancelled,
    ...completionResult,
  }
}
