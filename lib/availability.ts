import type { Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "./db"
import {
  addOperationalBuffer,
  DEFAULT_VEHICLE_PREPARATION_BUFFER_MINUTES,
  subtractOperationalBuffer,
} from "./rental-timing"

type DbClient = PrismaClient | Prisma.TransactionClient

const AVAILABILITY_BLOCKING_APPLICATION_STATUSES = [
  "DRAFT",
  "AWAITING_DOCUMENT_UPLOAD",
  "AWAITING_DOCUMENT_REVIEW",
  "CUSTOMER_ACTION_REQUIRED",
  "READY_TO_FINALIZE",
] as const

interface AvailabilityOptions {
  excludeBookingId?: string
  excludeBookingApplicationId?: string
  db?: DbClient
}

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

function availabilityBlockingApplicationFilter(now: Date): Prisma.BookingApplicationWhereInput {
  return {
    status: { in: [...AVAILABILITY_BLOCKING_APPLICATION_STATUSES] },
    expiresAt: { gt: now },
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
  options: AvailabilityOptions = {},
): Promise<boolean> {
  const db = options.db ?? prisma
  // Every booking reserves an additional preparation period after return.
  // Expanding both comparison boundaries ensures a full buffer also remains
  // between a new return and the following booking's pickup.
  const preparationBufferMinutes = await resolvePreparationBufferMinutes(db)
  const pickupBeforeBuffer = subtractOperationalBuffer(pickupDate, preparationBufferMinutes)
  const dropoffWithBuffer = addOperationalBuffer(dropoffDate, preparationBufferMinutes)
  const now = new Date()
  const [overlappingBookings, overlappingApplications, blockedDates] = await Promise.all([
    db.booking.findMany({
      where: {
        carId,
        id: options.excludeBookingId ? { not: options.excludeBookingId } : undefined,
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
    }),
    db.bookingApplication.findMany({
      where: {
        carId,
        id: options.excludeBookingApplicationId
          ? { not: options.excludeBookingApplicationId }
          : undefined,
        ...availabilityBlockingApplicationFilter(now),
        AND: [
          { pickupAt: { lt: dropoffWithBuffer } },
          { returnAt: { gt: pickupBeforeBuffer } },
        ],
      },
      select: { id: true },
    }),
    db.blockedDate.findMany({
      where: {
        carId,
        startDate: { lt: dropoffDate },
        endDate: { gt: pickupDate },
      },
      select: { id: true },
    }),
  ])

  return overlappingBookings.length === 0 && overlappingApplications.length === 0 && blockedDates.length === 0
}

export async function getUnavailableDates(
  carId: string,
  db: DbClient = prisma,
): Promise<{ start: Date; end: Date }[]> {
  const now = new Date()
  const [preparationBufferMinutes, bookings, applications, blockedDates] = await Promise.all([
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
    db.bookingApplication.findMany({
      where: {
        carId,
        ...availabilityBlockingApplicationFilter(now),
      },
      select: {
        pickupAt: true,
        returnAt: true,
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
    ...applications.map((application) => ({
      start: subtractOperationalBuffer(application.pickupAt, preparationBufferMinutes),
      end: addOperationalBuffer(application.returnAt, preparationBufferMinutes),
    })),
    ...blockedDates.map((b) => ({ start: b.startDate, end: b.endDate })),
  ]
}
