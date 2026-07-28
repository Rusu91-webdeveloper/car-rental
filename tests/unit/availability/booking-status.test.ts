import type { PrismaClient } from "@prisma/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { getUnavailableDates, isCarAvailable } from "@/lib/availability"

function createDb({
  bookings = [],
  applications = [],
}: {
  bookings?: { id?: string; pickupDate?: Date; dropoffDate?: Date }[]
  applications?: { id?: string; pickupAt?: Date; returnAt?: Date }[]
} = {}) {
  const bookingFindMany = vi.fn().mockResolvedValue(bookings)
  const bookingApplicationFindMany = vi.fn().mockResolvedValue(applications)
  const blockedDateFindMany = vi.fn().mockResolvedValue([])
  const db = {
    businessConfigurationRelease: {
      findFirst: vi.fn().mockResolvedValue({
        pricingBillingConfig: { preparationBufferMinutes: 120 },
      }),
    },
    booking: { findMany: bookingFindMany },
    bookingApplication: { findMany: bookingApplicationFindMany },
    blockedDate: { findMany: blockedDateFindMany },
  } as unknown as PrismaClient

  return { db, bookingFindMany, bookingApplicationFindMany }
}

describe("booking status availability", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("blocks pending bookings only while their payment deadline is active", async () => {
    const now = new Date("2026-08-01T09:00:00.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const { db, bookingFindMany } = createDb({ bookings: [{ id: "pending-booking" }] })

    const available = await isCarAvailable(
      "car-1",
      new Date("2026-08-10T10:00:00.000Z"),
      new Date("2026-08-12T10:00:00.000Z"),
      { db },
    )

    expect(available).toBe(false)
    expect(bookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { status: { in: ["CONFIRMED", "IN_PROGRESS"] } },
            {
              status: "PENDING",
              OR: [{ paymentDueAt: null }, { paymentDueAt: { gt: now } }],
            },
          ],
        }),
      }),
    )
  })

  it("uses the same pending-payment rule for calendar ranges", async () => {
    const pickupDate = new Date("2026-08-10T10:00:00.000Z")
    const dropoffDate = new Date("2026-08-12T10:00:00.000Z")
    const { db, bookingFindMany } = createDb({ bookings: [{ pickupDate, dropoffDate }] })

    const ranges = await getUnavailableDates("car-1", db)

    expect(bookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          carId: "car-1",
          OR: [
            { status: { in: ["CONFIRMED", "IN_PROGRESS"] } },
            {
              status: "PENDING",
              OR: [{ paymentDueAt: null }, { paymentDueAt: { gt: expect.any(Date) } }],
            },
          ],
        }),
      }),
    )
    expect(ranges).toEqual([
      {
        start: new Date("2026-08-10T07:00:00.000Z"),
        end: new Date("2026-08-12T13:00:00.000Z"),
      },
    ])
  })

  it("blocks active unexpired applications during document review", async () => {
    const now = new Date("2026-07-28T18:00:00.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const pickupAt = new Date("2026-07-29T06:00:00.000Z")
    const returnAt = new Date("2026-07-31T12:00:00.000Z")
    const { db, bookingApplicationFindMany } = createDb({
      applications: [{ id: "pending-review", pickupAt, returnAt }],
    })

    await expect(isCarAvailable("car-1", pickupAt, returnAt, { db })).resolves.toBe(false)
    expect(bookingApplicationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          carId: "car-1",
          status: {
            in: [
              "DRAFT",
              "AWAITING_DOCUMENT_UPLOAD",
              "AWAITING_DOCUMENT_REVIEW",
              "CUSTOMER_ACTION_REQUIRED",
              "READY_TO_FINALIZE",
            ],
          },
          expiresAt: { gt: now },
          AND: [
            { pickupAt: { lt: new Date("2026-07-31T15:00:00.000Z") } },
            { returnAt: { gt: new Date("2026-07-29T03:00:00.000Z") } },
          ],
        }),
      }),
    )
  })

  it("shows application holds in calendar ranges and can exclude the current application", async () => {
    const pickupAt = new Date("2026-07-29T06:00:00.000Z")
    const returnAt = new Date("2026-07-31T12:00:00.000Z")
    const applicationDb = createDb({ applications: [{ pickupAt, returnAt }] })

    await expect(getUnavailableDates("car-1", applicationDb.db)).resolves.toEqual([
      {
        start: new Date("2026-07-29T03:00:00.000Z"),
        end: new Date("2026-07-31T15:00:00.000Z"),
      },
    ])

    const finalizeDb = createDb()
    await isCarAvailable("car-1", pickupAt, returnAt, {
      excludeBookingApplicationId: "current-application",
      db: finalizeDb.db,
    })
    expect(finalizeDb.bookingApplicationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: "current-application" } }),
      }),
    )
  })
})
