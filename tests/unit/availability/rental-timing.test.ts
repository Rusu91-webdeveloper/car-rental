import { describe, expect, it } from "vitest"
import {
  addOperationalBuffer,
  DEFAULT_VEHICLE_PREPARATION_BUFFER_MINUTES,
  LATE_RETURN_SAFETY_BUFFER_MINUTES,
  subtractOperationalBuffer,
  totalOperationalBufferMinutes,
} from "@/lib/rental-timing"

describe("vehicle operational buffer", () => {
  it("reserves one late-safety hour followed by two preparation hours", () => {
    const returnAt = new Date("2026-07-26T13:00:00.000Z")

    expect(LATE_RETURN_SAFETY_BUFFER_MINUTES).toBe(60)
    expect(DEFAULT_VEHICLE_PREPARATION_BUFFER_MINUTES).toBe(120)
    expect(totalOperationalBufferMinutes(DEFAULT_VEHICLE_PREPARATION_BUFFER_MINUTES)).toBe(180)
    expect(addOperationalBuffer(returnAt).toISOString()).toBe("2026-07-26T16:00:00.000Z")
  })

  it("uses the admin-selected preparation duration in addition to the mandatory hour", () => {
    const returnAt = new Date("2026-07-26T13:00:00.000Z")

    expect(addOperationalBuffer(returnAt, 90).toISOString()).toBe("2026-07-26T15:30:00.000Z")
  })

  it("expands the comparison boundary before the next pickup", () => {
    const pickupAt = new Date("2026-07-26T16:00:00.000Z")

    expect(subtractOperationalBuffer(pickupAt).toISOString()).toBe("2026-07-26T13:00:00.000Z")
  })
})
