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

const MANUAL_RESERVATION_PREFIX = "manual_reservation::"

interface AvailabilityOptions {
  excludeBookingId?: string
  excludeBookingApplicationId?: string
  db?: DbClient
}

function availabilityBlockingBookingFilter(
  now: Date,
  preparationBufferMinutes: number,
): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: { in: ["CONFIRMED", "IN_PROGRESS"] } },
      {
        status: "PENDING",
        OR: [{ paymentDueAt: null }, { paymentDueAt: { gt: now } }],
      },
      {
        status: "COMPLETED",
        dropoffDate: {
          gt: subtractOperationalBuffer(now, preparationBufferMinutes),
        },
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
        ...availabilityBlockingBookingFilter(now, preparationBufferMinutes),
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
        OR: [
          {
            reason: { startsWith: MANUAL_RESERVATION_PREFIX },
            startDate: { lt: dropoffWithBuffer },
            endDate: { gt: pickupBeforeBuffer },
          },
          {
            AND: [
              {
                OR: [
                  { reason: null },
                  { reason: { not: { startsWith: MANUAL_RESERVATION_PREFIX } } },
                ],
              },
              { startDate: { lt: dropoffDate } },
              { endDate: { gt: pickupDate } },
            ],
          },
        ],
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
  const preparationBufferMinutes = await resolvePreparationBufferMinutes(db)
  const [bookings, applications, blockedDates] = await Promise.all([
    db.booking.findMany({
      where: {
        carId,
        ...availabilityBlockingBookingFilter(now, preparationBufferMinutes),
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
        reason: true,
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
    ...blockedDates.map((b) =>
      b.reason?.startsWith(MANUAL_RESERVATION_PREFIX)
        ? {
            start: subtractOperationalBuffer(b.startDate, preparationBufferMinutes),
            end: addOperationalBuffer(b.endDate, preparationBufferMinutes),
          }
        : { start: b.startDate, end: b.endDate },
    ),
  ]
}

export async function hasActiveVehicleCommitments(
  carId: string,
  db: DbClient = prisma,
  now = new Date(),
): Promise<boolean> {
  const preparationBufferMinutes = await resolvePreparationBufferMinutes(db)
  const bufferStart = subtractOperationalBuffer(now, preparationBufferMinutes)
  const [bookingCount, applicationCount, manualReservationCount] = await Promise.all([
    db.booking.count({
      where: {
        carId,
        ...availabilityBlockingBookingFilter(now, preparationBufferMinutes),
        dropoffDate: { gt: subtractOperationalBuffer(now, preparationBufferMinutes) },
      },
    }),
    db.bookingApplication.count({
      where: {
        carId,
        ...availabilityBlockingApplicationFilter(now),
      },
    }),
    db.blockedDate.count({
      where: {
        carId,
        reason: { startsWith: MANUAL_RESERVATION_PREFIX },
        endDate: { gt: bufferStart },
      },
    }),
  ])

  return bookingCount > 0 || applicationCount > 0 || manualReservationCount > 0
}
