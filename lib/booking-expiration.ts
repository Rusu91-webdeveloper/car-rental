import type { PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/db"
import { config } from "@/lib/config"
import { sendBookingCompletionReviewEmail } from "@/lib/email"
import { enqueueBookingNotification } from "@/lib/booking-notifications"
import { formatBookingDateTime } from "@/lib/booking-time-zone"

type DbClient = PrismaClient
const normalizeBookingLocale = (locale: string | null | undefined) => (locale === "de" ? "de" : "en")
export const shouldSendCompletionEmail = (previousStatus: string) => previousStatus === "IN_PROGRESS"
export async function cancelExpiredBookings(db: DbClient = prisma, now = new Date()) {
  const candidates = await db.booking.findMany({
    where: {
      status: "PENDING",
      paymentStatus: "PENDING",
      paymentDueAt: { lte: now },
    },
    select: { id: true, bookingNumber: true },
    orderBy: { paymentDueAt: "asc" },
    take: 200,
  })
  let cancelled = 0
  for (const candidate of candidates) {
    const changed = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${candidate.id} FOR UPDATE`
      const result = await tx.booking.updateMany({
        where: {
          id: candidate.id,
          status: "PENDING",
          paymentStatus: "PENDING",
          paymentDueAt: { lte: now },
        },
        data: { status: "CANCELLED", cancelledAt: now },
      })
      if (!result.count) return false
      await enqueueBookingNotification(tx, {
        bookingId: candidate.id,
        bookingNumber: candidate.bookingNumber,
        event: "CUSTOMER_PAYMENT_EXPIRED",
      })
      return true
    })
    if (changed) cancelled += 1
  }
  return cancelled
}

export async function startConfirmedBookings(db: DbClient = prisma, now = new Date()) {
  const result = await db.booking.updateMany({
    where: {
      status: "CONFIRMED",
      pickupDate: { lte: now },
      dropoffDate: { gt: now },
    },
    data: { status: "IN_PROGRESS" },
  })
  return result.count
}

export async function completeFinishedBookings(now = new Date(), db: DbClient = prisma) {
  const bookingsToComplete = await db.booking.findMany({
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
    const updated = await db.booking.updateMany({
      where: {
        id: booking.id,
        status: { in: ["CONFIRMED", "IN_PROGRESS"] },
        dropoffDate: { lte: now },
      },
      data: {
        status: "COMPLETED",
        completedAt: now,
      },
    })

    if (updated.count === 0) {
      continue
    }

    completedCount += 1

    // A CONFIRMED booking can arrive here when an earlier lifecycle run was
    // missed. Repair its status without surprising the customer with a late
    // completion email; normal IN_PROGRESS rentals still receive the email.
    if (!shouldSendCompletionEmail(booking.status)) {
      continue
    }

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
      pickupDate: formatBookingDateTime(booking.pickupDate, bookingLocale, booking.businessTimeZone, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      dropoffDate: formatBookingDateTime(booking.dropoffDate, bookingLocale, booking.businessTimeZone, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      reviewUrl,
      locale: bookingLocale,
    })

    if (!completionEmailResult?.error) {
      completionEmailsSent += 1
    } else {
      completionEmailsFailed += 1
    }
  }

  return {
    completed: completedCount,
    completionEmailsSent,
    completionEmailsFailed,
    normalizedCompletedPayments: 0,
  }
}

export async function runBookingLifecycleMaintenance(now = new Date()) {
  const cancelled = await cancelExpiredBookings(prisma, now)
  const started = await startConfirmedBookings(prisma, now)
  const completionResult = await completeFinishedBookings(now)
  return {
    cancelled,
    started,
    ...completionResult,
    notifications: { examined: 0, sent: 0, failed: 0 },
  }
}
