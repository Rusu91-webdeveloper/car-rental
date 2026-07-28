import type { Prisma, PrismaClient } from "@prisma/client"
import type { HandoverPolicy } from "@/lib/business-configuration/domains"
import {
  handoverSlotHasCapacity,
  type HandoverEvent,
} from "@/lib/business-hours"

type DbClient = PrismaClient | Prisma.TransactionClient

const ACTIVE_APPLICATION_STATUSES = [
  "DRAFT",
  "AWAITING_DOCUMENT_UPLOAD",
  "AWAITING_DOCUMENT_REVIEW",
  "CUSTOMER_ACTION_REQUIRED",
  "READY_TO_FINALIZE",
] as const
const MANUAL_RESERVATION_PREFIX = "manual_reservation::"

function bookingFilter(now: Date): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: { in: ["CONFIRMED", "IN_PROGRESS"] } },
      { status: "PENDING", OR: [{ paymentDueAt: null }, { paymentDueAt: { gt: now } }] },
    ],
  }
}

export async function getHandoverEvents(
  db: DbClient,
  from: Date,
  to: Date,
): Promise<HandoverEvent[]> {
  const now = new Date()
  const [bookingPickups, bookingReturns, applicationPickups, applicationReturns, manualPickups, manualReturns] = await Promise.all([
    db.booking.findMany({
      where: { ...bookingFilter(now), pickupDate: { gte: from, lt: to } },
      select: { pickupDate: true },
    }),
    db.booking.findMany({
      where: { ...bookingFilter(now), dropoffDate: { gte: from, lt: to } },
      select: { dropoffDate: true },
    }),
    db.bookingApplication.findMany({
      where: {
        status: { in: [...ACTIVE_APPLICATION_STATUSES] },
        expiresAt: { gt: now },
        pickupAt: { gte: from, lt: to },
      },
      select: { pickupAt: true },
    }),
    db.bookingApplication.findMany({
      where: {
        status: { in: [...ACTIVE_APPLICATION_STATUSES] },
        expiresAt: { gt: now },
        returnAt: { gte: from, lt: to },
      },
      select: { returnAt: true },
    }),
    db.blockedDate.findMany({
      where: { reason: { startsWith: MANUAL_RESERVATION_PREFIX }, startDate: { gte: from, lt: to } },
      select: { startDate: true },
    }),
    db.blockedDate.findMany({
      where: { reason: { startsWith: MANUAL_RESERVATION_PREFIX }, endDate: { gte: from, lt: to } },
      select: { endDate: true },
    }),
  ])
  return [
    ...bookingPickups.map(({ pickupDate }) => ({ at: pickupDate, kind: "PICKUP" as const })),
    ...bookingReturns.map(({ dropoffDate }) => ({ at: dropoffDate, kind: "RETURN" as const })),
    ...applicationPickups.map(({ pickupAt }) => ({ at: pickupAt, kind: "PICKUP" as const })),
    ...applicationReturns.map(({ returnAt }) => ({ at: returnAt, kind: "RETURN" as const })),
    ...manualPickups.map(({ startDate }) => ({ at: startDate, kind: "PICKUP" as const })),
    ...manualReturns.map(({ endDate }) => ({ at: endDate, kind: "RETURN" as const })),
  ]
}

export async function evaluateRentalHandoverCapacity(input: {
  db: DbClient
  pickupAt: Date
  returnAt: Date
  policy: HandoverPolicy
}) {
  const slotMs = input.policy.slotIntervalMinutes * 60_000
  const from = new Date(Math.min(input.pickupAt.getTime(), input.returnAt.getTime()))
  const to = new Date(Math.max(input.pickupAt.getTime(), input.returnAt.getTime()) + slotMs)
  const events = await getHandoverEvents(input.db, from, to)
  const pickupEvents = input.returnAt.getTime() >= input.pickupAt.getTime() && input.returnAt.getTime() < input.pickupAt.getTime() + slotMs
    ? [...events, { at: input.returnAt, kind: "RETURN" as const }]
    : events
  const returnEvents = input.pickupAt.getTime() >= input.returnAt.getTime() && input.pickupAt.getTime() < input.returnAt.getTime() + slotMs
    ? [...events, { at: input.pickupAt, kind: "PICKUP" as const }]
    : events
  return {
    pickupAvailable: handoverSlotHasCapacity(input.pickupAt, "PICKUP", pickupEvents, input.policy),
    returnAvailable: handoverSlotHasCapacity(input.returnAt, "RETURN", returnEvents, input.policy),
  }
}
