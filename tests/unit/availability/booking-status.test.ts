import type { PrismaClient } from "@prisma/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { getUnavailableDates, hasActiveVehicleCommitments, isCarAvailable } from "@/lib/availability"

function createDb({
  bookings = [],
  applications = [],
  blockedDates = [],
  commitmentCounts = { bookings: 0, applications: 0, manualReservations: 0 },
}: {
  bookings?: { id?: string; pickupDate?: Date; dropoffDate?: Date }[]
  applications?: { id?: string; pickupAt?: Date; returnAt?: Date }[]
  blockedDates?: { id?: string; startDate?: Date; endDate?: Date; reason?: string | null }[]
  commitmentCounts?: { bookings: number; applications: number; manualReservations: number }
} = {}) {
  const bookingFindMany = vi.fn().mockResolvedValue(bookings)
  const bookingApplicationFindMany = vi.fn().mockResolvedValue(applications)
  const blockedDateFindMany = vi.fn().mockResolvedValue(blockedDates)
  const db = {
    businessConfigurationRelease: {
      findFirst: vi.fn().mockResolvedValue({
        pricingBillingConfig: { preparationBufferMinutes: 120 },
      }),
    },
    booking: { findMany: bookingFindMany, count: vi.fn().mockResolvedValue(commitmentCounts.bookings) },
    bookingApplication: {
      findMany: bookingApplicationFindMany,
      count: vi.fn().mockResolvedValue(commitmentCounts.applications),
    },
    blockedDate: {
      findMany: blockedDateFindMany,
      count: vi.fn().mockResolvedValue(commitmentCounts.manualReservations),
    },
  } as unknown as PrismaClient

  return { db, bookingFindMany, bookingApplicationFindMany, blockedDateFindMany }
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
            {
              status: "COMPLETED",
              dropoffDate: { gt: new Date("2026-08-01T06:00:00.000Z") },
            },
          ],
        }),
      }),
    )
  })

  it("keeps a completed rental unavailable until its operational buffer ends", async () => {
    const now = new Date("2026-08-01T12:00:00.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const { db, bookingFindMany } = createDb({ bookings: [{ id: "just-completed" }] })

    await expect(
      isCarAvailable(
        "car-1",
        new Date("2026-08-01T12:30:00.000Z"),
        new Date("2026-08-03T12:30:00.000Z"),
        { db },
      ),
    ).resolves.toBe(false)

    expect(bookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              status: "COMPLETED",
              dropoffDate: { gt: new Date("2026-08-01T09:00:00.000Z") },
            },
          ]),
        }),
      }),
    )
  })

  it("applies the operational buffer to manual reservations but not maintenance blocks", async () => {
    const startDate = new Date("2026-08-10T10:00:00.000Z")
    const endDate = new Date("2026-08-12T10:00:00.000Z")
    const { db, blockedDateFindMany } = createDb({
      blockedDates: [
        {
          startDate,
          endDate,
          reason: 'manual_reservation::{"customerName":"Test"}',
        },
        {
          startDate: new Date("2026-08-20T10:00:00.000Z"),
          endDate: new Date("2026-08-21T10:00:00.000Z"),
          reason: "maintenance",
        },
      ],
    })

    await isCarAvailable(
      "car-1",
      new Date("2026-08-12T12:59:00.000Z"),
      new Date("2026-08-14T12:59:00.000Z"),
      { db },
    )
    expect(blockedDateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              reason: { startsWith: "manual_reservation::" },
              startDate: { lt: new Date("2026-08-14T15:59:00.000Z") },
              endDate: { gt: new Date("2026-08-12T09:59:00.000Z") },
            }),
          ]),
        }),
      }),
    )

    await expect(getUnavailableDates("car-1", db)).resolves.toEqual([
      {
        start: new Date("2026-08-10T07:00:00.000Z"),
        end: new Date("2026-08-12T13:00:00.000Z"),
      },
      {
        start: new Date("2026-08-20T10:00:00.000Z"),
        end: new Date("2026-08-21T10:00:00.000Z"),
      },
    ])
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
          OR: expect.arrayContaining([
            { status: { in: ["CONFIRMED", "IN_PROGRESS"] } },
            {
              status: "PENDING",
              OR: [{ paymentDueAt: null }, { paymentDueAt: { gt: expect.any(Date) } }],
            },
            {
              status: "COMPLETED",
              dropoffDate: { gt: expect.any(Date) },
            },
          ]),
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

  it("prevents vehicle deletion while any booking commitment remains", async () => {
    const committed = createDb({
      commitmentCounts: { bookings: 0, applications: 1, manualReservations: 0 },
    })
    const clear = createDb()

    await expect(hasActiveVehicleCommitments("car-1", committed.db)).resolves.toBe(true)
    await expect(hasActiveVehicleCommitments("car-1", clear.db)).resolves.toBe(false)
  })
})
