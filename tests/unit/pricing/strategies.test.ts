import { describe, expect, it } from "vitest"
import { dailyOnly, lowestValidPrice, orderedPeriods } from "@/lib/pricing/strategies"

const rates = {
  dailyRate: 8_000,
  weeklyRate: 50_000,
  monthlyRate: 180_000,
  weeklyEnabled: true,
  monthlyEnabled: true,
  monthDays: 30,
}

describe("pricing strategies", () => {
  it("prices daily only", () => {
    expect(dailyOnly(10, rates)).toMatchObject({ units: { daily: 10, weekly: 0, monthly: 0 }, subtotal: 80_000 })
  })

  it("uses ordered fixed periods without searching for a cheaper result", () => {
    expect(orderedPeriods(7, rates)).toMatchObject({ units: { daily: 0, weekly: 1, monthly: 0 }, subtotal: 50_000 })
    expect(orderedPeriods(10, rates)).toMatchObject({ units: { daily: 3, weekly: 1, monthly: 0 }, subtotal: 74_000 })
    expect(orderedPeriods(30, rates)).toMatchObject({ units: { daily: 0, weekly: 0, monthly: 1 }, subtotal: 180_000 })
    expect(orderedPeriods(40, rates)).toMatchObject({ units: { daily: 3, weekly: 1, monthly: 1 }, subtotal: 254_000 })
  })

  it("finds the lowest valid covered price, including a period that covers a shorter remainder", () => {
    const discountedWeekly = { ...rates, weeklyRate: 35_000, monthlyRate: 130_000 }
    expect(lowestValidPrice(6, discountedWeekly)).toMatchObject({ units: { daily: 0, weekly: 1, monthly: 0 }, subtotal: 35_000 })
    expect(lowestValidPrice(35, discountedWeekly)).toMatchObject({ units: { daily: 0, weekly: 1, monthly: 1 }, subtotal: 165_000 })
  })

  it("excludes missing or disabled rates", () => {
    expect(orderedPeriods(10, { ...rates, weeklyEnabled: false, weeklyRate: undefined })).toMatchObject({ units: { daily: 10, weekly: 0, monthly: 0 } })
    expect(() => orderedPeriods(10, { ...rates, weeklyEnabled: true, weeklyRate: undefined })).toThrow(/Weekly rate/)
  })

  it("uses stable equal-price tie-breaking", () => {
    const tied = { dailyRate: 100, weeklyRate: 700, monthlyRate: 3_000, weeklyEnabled: true, monthlyEnabled: true, monthDays: 30 }
    expect(lowestValidPrice(30, tied).units).toEqual({ daily: 0, weekly: 0, monthly: 1 })
    expect(lowestValidPrice(14, tied).units).toEqual({ daily: 0, weekly: 2, monthly: 0 })
  })

  it("rejects zero/negative rates and bounds optimization", () => {
    expect(() => dailyOnly(1, { ...rates, dailyRate: 0 })).toThrow(/Daily rate/)
    expect(() => lowestValidPrice(10_001, rates)).toThrow(/bounded/)
    expect(lowestValidPrice(10_000, rates).subtotal).toBeGreaterThan(0)
  })
})
