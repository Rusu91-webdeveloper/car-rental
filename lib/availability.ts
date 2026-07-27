import type { Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "./db"
import {
  addOperationalBuffer,
  DEFAULT_VEHICLE_PREPARATION_BUFFER_MINUTES,
  subtractOperationalBuffer,
} from "./rental-timing"

type DbClient = PrismaClient | Prisma.TransactionClient

function availabilityBlockingBookingFilter(now: Date): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: { in: ["CONFIRMED", "IN_PROGRESS"] } },
      {
        status: "PENDING",
        OR: [{ paymentDueAt: null }, { paymentDueAt: { gt: now } }],
      },
    ],
  }
}

async function resolvePreparationBufferMinutes(db: DbClient): Promise<number> {
  const activeRelease = await db.businessConfigurationRelease.findFirst({
    where: { status: "ACTIVE" },
    select: {
      pricingBillingConfig: {
        select: { preparationBufferMinutes: true },
      },
    },
  })
  return activeRelease?.pricingBillingConfig.preparationBufferMinutes ?? DEFAULT_VEHICLE_PREPARATION_BUFFER_MINUTES
}

export async function isCarAvailable(
  carId: string,
  pickupDate: Date,
  dropoffDate: Date,
  excludeBookingId?: string,
  db: DbClient = prisma,
): Promise<boolean> {
  // Every booking reserves an additional preparation period after return.
  // Expanding both comparison boundaries ensures a full buffer also remains
  // between a new return and the following booking's pickup.
  const preparationBufferMinutes = await resolvePreparationBufferMinutes(db)
  const pickupBeforeBuffer = subtractOperationalBuffer(pickupDate, preparationBufferMinutes)
  const dropoffWithBuffer = addOperationalBuffer(dropoffDate, preparationBufferMinutes)
  const now = new Date()
  const overlappingBookings = await db.booking.findMany({
    where: {
      carId,
      id: excludeBookingId ? { not: excludeBookingId } : undefined,
      ...availabilityBlockingBookingFilter(now),
      AND: [
        {
          pickupDate: {
            lt: dropoffWithBuffer,
          },
        },
        {
          dropoffDate: {
            gt: pickupBeforeBuffer,
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

export async function getUnavailableDates(
  carId: string,
  db: DbClient = prisma,
): Promise<{ start: Date; end: Date }[]> {
  const now = new Date()
  const [preparationBufferMinutes, bookings, blockedDates] = await Promise.all([
    resolvePreparationBufferMinutes(db),
    db.booking.findMany({
      where: {
        carId,
        ...availabilityBlockingBookingFilter(now),
      },
      select: {
        pickupDate: true,
        dropoffDate: true,
      },
    }),
    db.blockedDate.findMany({
      where: { carId },
      select: {
        startDate: true,
        endDate: true,
      },
    }),
  ])

  return [
    ...bookings.map((b) => ({
      start: subtractOperationalBuffer(b.pickupDate, preparationBufferMinutes),
      end: addOperationalBuffer(b.dropoffDate, preparationBufferMinutes),
    })),
    ...blockedDates.map((b) => ({ start: b.startDate, end: b.endDate })),
  ]
}
