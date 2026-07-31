import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  FALLBACK_BUSINESS_TIME_ZONE,
  formatBookingDateTime,
  normalizeBusinessTimeZone,
} from "@/lib/booking-time-zone"

describe("booking business timezone", () => {
  it("formats the same instant using the captured booking timezone", () => {
    const instant = new Date("2026-07-31T10:00:00.000Z")

    expect(formatBookingDateTime(instant, "en", "UTC")).toContain("10:00")
    expect(formatBookingDateTime(instant, "en", "Europe/Berlin")).toContain("12:00")
  })

  it("fails closed to UTC for missing or invalid historical values", () => {
    expect(normalizeBusinessTimeZone(undefined)).toBe(FALLBACK_BUSINESS_TIME_ZONE)
    expect(normalizeBusinessTimeZone("Mars/Olympus")).toBe(FALLBACK_BUSINESS_TIME_ZONE)
  })

  it("persists and backfills the timezone snapshot on bookings", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8")
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20260731070000_snapshot_booking_business_timezone/migration.sql",
      ),
      "utf8",
    )

    expect(schema).toContain('businessTimeZone String   @default("UTC")')
    expect(migration).toContain('application."businessTimeZone"')
    expect(migration).toContain('general_rental."businessTimeZone"')
  })
})
