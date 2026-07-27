import type { PrismaClient } from "@prisma/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { getUnavailableDates, isCarAvailable } from "@/lib/availability"

function createDb({
  bookings = [],
}: {
  bookings?: { id?: string; pickupDate?: Date; dropoffDate?: Date }[]
} = {}) {
  const bookingFindMany = vi.fn().mockResolvedValue(bookings)
  const blockedDateFindMany = vi.fn().mockResolvedValue([])
  const db = {
    businessConfigurationRelease: {
      findFirst: vi.fn().mockResolvedValue({
        pricingBillingConfig: { preparationBufferMinutes: 120 },
      }),
    },
    booking: { findMany: bookingFindMany },
    blockedDate: { findMany: blockedDateFindMany },
  } as unknown as PrismaClient

  return { db, bookingFindMany }
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
      undefined,
      db,
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
})
