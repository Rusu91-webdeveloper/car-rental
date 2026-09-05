import { describe, expect, it, vi } from "vitest"
import { DEFAULT_HANDOVER_POLICY } from "@/lib/business-hours"
import { evaluateRentalHandoverCapacity, getHandoverEvents } from "@/lib/handover-capacity"

function database() {
  return {
    booking: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        "pickupDate" in where
          ? [{ pickupDate: new Date("2026-08-03T07:00:00.000Z") }]
          : [{ dropoffDate: new Date("2026-08-05T15:00:00.000Z") }]),
    },
    bookingApplication: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        "pickupAt" in where
          ? [{ pickupAt: new Date("2026-08-03T07:05:00.000Z") }]
          : [{ returnAt: new Date("2026-08-05T15:05:00.000Z") }]),
    },
    blockedDate: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        "startDate" in where
          ? [{ startDate: new Date("2026-08-03T07:10:00.000Z") }]
          : [{ endDate: new Date("2026-08-05T15:10:00.000Z") }]),
    },
  }
}

describe("fleet handover capacity", () => {
  it("includes bookings, pending applications, and manual reservations", async () => {
    const events = await getHandoverEvents(
      database() as never,
      new Date("2026-08-01T00:00:00.000Z"),
      new Date("2026-08-10T00:00:00.000Z"),
    )
    expect(events.filter((event) => event.kind === "PICKUP")).toHaveLength(3)
    expect(events.filter((event) => event.kind === "RETURN")).toHaveLength(3)
  })

  it("reports a full pickup and return slot using the configured limits", async () => {
    const capacity = await evaluateRentalHandoverCapacity({
      db: database() as never,
      pickupAt: new Date("2026-08-03T07:00:00.000Z"),
      returnAt: new Date("2026-08-05T15:00:00.000Z"),
      policy: {
        ...DEFAULT_HANDOVER_POLICY,
        maximumPickupsPerSlot: 3,
        maximumReturnsPerSlot: 3,
        maximumTotalHandoversPerSlot: 3,
      },
    })
    expect(capacity).toEqual({ pickupAvailable: false, returnAvailable: false })
  })
})
