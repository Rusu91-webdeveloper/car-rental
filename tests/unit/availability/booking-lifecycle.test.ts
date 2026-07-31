import type { PrismaClient } from "@prisma/client"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  completeFinishedBookings,
  shouldSendCompletionEmail,
  startConfirmedBookings,
} from "@/lib/booking-expiration"

describe("automatic booking lifecycle", () => {
  it("starts confirmed rentals after pickup but does not start already-finished rentals", async () => {
    const now = new Date("2026-08-10T12:00:00.000Z")
    const updateMany = vi.fn().mockResolvedValue({ count: 2 })
    const db = { booking: { updateMany } } as unknown as PrismaClient

    await expect(startConfirmedBookings(db, now)).resolves.toBe(2)
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        status: "CONFIRMED",
        pickupDate: { lte: now },
        dropoffDate: { gt: now },
      },
      data: { status: "IN_PROGRESS" },
    })
  })

  it("completes a finished rental even if its confirmed-to-in-progress transition was missed", async () => {
    const now = new Date("2026-08-10T12:00:00.000Z")
    const findMany = vi.fn().mockResolvedValue([])
    const db = { booking: { findMany } } as unknown as PrismaClient

    await expect(completeFinishedBookings(now, db)).resolves.toMatchObject({ completed: 0 })
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: { in: ["CONFIRMED", "IN_PROGRESS"] },
        dropoffDate: { lte: now },
      },
    }))
  })

  it("does not send a surprise late completion email for a repaired confirmed rental", () => {
    expect(shouldSendCompletionEmail("CONFIRMED")).toBe(false)
    expect(shouldSendCompletionEmail("IN_PROGRESS")).toBe(true)
  })
})
