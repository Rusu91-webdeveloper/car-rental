import { describe, expect, it } from "vitest"
import {
  checkedAdd,
  checkedMultiply,
  majorToMinorUnits,
  minorToMajorUnits,
  money,
  multiplyByBasisPoints,
  requireSameCurrency,
  roundHalfUp,
} from "@/lib/pricing/money"

describe("pricing money", () => {
  it("converts explicit major-unit strings without floating point", () => {
    expect(majorToMinorUnits("10.00")).toBe(1_000)
    expect(majorToMinorUnits("123.45")).toBe(12_345)
    expect(majorToMinorUnits("0.5")).toBe(50)
    expect(minorToMajorUnits(12_345)).toBe("123.45")
  })

  it("rejects ambiguous precision", () => {
    expect(() => majorToMinorUnits("1.001")).toThrow(/two decimal/)
    expect(() => majorToMinorUnits("NaN")).toThrow()
  })

  it("rounds halves away from zero deterministically", () => {
    expect(roundHalfUp(105, 10)).toBe(11)
    expect(roundHalfUp(-105, 10)).toBe(-11)
    expect(multiplyByBasisPoints(105, 1_000)).toBe(11)
  })

  it("supports exact zero and checked arithmetic", () => {
    expect(checkedAdd([0, 1, -1])).toBe(0)
    expect(checkedMultiply(12_345, 30)).toBe(370_350)
  })

  it("rejects negative rates through strategy boundaries and unsafe arithmetic here", () => {
    expect(() => checkedMultiply(-1, 2)).toThrow()
    expect(() => checkedAdd([Number.MAX_SAFE_INTEGER, 1])).toThrow(/safe-integer/)
    expect(() => checkedMultiply(Number.MAX_SAFE_INTEGER, 2)).toThrow(/safe-integer/)
    expect(() => checkedMultiply(Number.POSITIVE_INFINITY, 1)).toThrow()
  })

  it("normalizes currency and rejects mixed currency", () => {
    expect(requireSameCurrency([money(100, "eur"), money(200, "EUR")])).toBe("EUR")
    expect(() => requireSameCurrency([money(100, "EUR"), money(100, "USD")])).toThrow(/same currency/)
  })
})
