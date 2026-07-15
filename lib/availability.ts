import type { Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "./db"

type DbClient = PrismaClient | Prisma.TransactionClient

export async function isCarAvailable(
  carId: string,
  pickupDate: Date,
  dropoffDate: Date,
  excludeBookingId?: string,
  db: DbClient = prisma,
): Promise<boolean> {
  // Check for overlapping bookings
  // Overlap occurs when:
  // (pickupDate < existingDropoff) AND (dropoffDate > existingPickup)
  const overlappingBookings = await db.booking.findMany({
    where: {
      carId,
      id: excludeBookingId ? { not: excludeBookingId } : undefined,
      status: {
        in: ["PENDING", "CONFIRMED", "IN_PROGRESS"],
      },
      AND: [
        {
          pickupDate: {
            lt: dropoffDate,
          },
        },
        {
          dropoffDate: {
            gt: pickupDate,
          },
        },
      ],
    },
    select: { id: true },
  })

  if (overlappingBookings.length > 0) {
    return false
  }

  // Check for blocked dates
  const blockedDates = await db.blockedDate.findMany({
    where: {
      carId,
      startDate: {
        lt: dropoffDate,
      },
      endDate: {
        gt: pickupDate,
      },
    },
    select: { id: true },
  })

  return blockedDates.length === 0
}

export async function getUnavailableDates(carId: string): Promise<{ start: Date; end: Date }[]> {
  const [bookings, blockedDates] = await Promise.all([
    prisma.booking.findMany({
      where: {
        carId,
        status: {
          in: ["PENDING", "CONFIRMED", "IN_PROGRESS"],
        },
      },
      select: {
        pickupDate: true,
        dropoffDate: true,
      },
    }),
    prisma.blockedDate.findMany({
      where: { carId },
      select: {
        startDate: true,
        endDate: true,
      },
    }),
  ])

  return [
    ...bookings.map((b) => ({ start: b.pickupDate, end: b.dropoffDate })),
    ...blockedDates.map((b) => ({ start: b.startDate, end: b.endDate })),
  ]
}
