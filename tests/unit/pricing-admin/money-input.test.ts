import { describe, expect, it } from "vitest"
import { formatAdminMoneyInput, parseAdminMoneyInput } from "@/lib/pricing-admin/money-input"

describe("admin money input", () => {
  it.each([
    ["10", 1_000],
    ["10.5", 1_050],
    ["10.50", 1_050],
    ["0", 0],
  ])("parses %s exactly", (value, expected) => expect(parseAdminMoneyInput(value)).toBe(expected))

  it("round-trips exact minor units", () => {
    expect(parseAdminMoneyInput(formatAdminMoneyInput(12_345))).toBe(12_345)
  })

  it("rejects excess precision, commas, negatives, and overflow", () => {
    expect(() => parseAdminMoneyInput("10.555")).toThrow(/decimal/)
    expect(() => parseAdminMoneyInput("10,50")).toThrow(/dot/)
    expect(() => parseAdminMoneyInput("-1.00")).toThrow(/negative/)
    expect(() => parseAdminMoneyInput("999999999999999999999.00")).toThrow(/safe-integer/)
  })

  it("distinguishes required and disabled empty values", () => {
    expect(() => parseAdminMoneyInput("")).toThrow(/amount/)
    expect(parseAdminMoneyInput("", { optional: true })).toBeUndefined()
  })
})
