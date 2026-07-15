import { describe, expect, it } from "vitest"
import { createBookingSchema } from "@/lib/validations"

describe("booking pricing input boundary", () => {
  it("does not accept browser price, subtotal, tax, or duration as authoritative input", () => {
    const parsed = createBookingSchema.parse({
      carId: "car-1",
      pickupDate: "2099-01-01T10:00:00.000Z",
      dropoffDate: "2099-01-02T10:00:00.000Z",
      location: "Test",
      paymentMethod: "TRANSFER",
      locale: "en",
      totalPrice: 1,
      subtotal: 1,
      tax: 0,
      totalDays: 99,
      pricePerDay: 1,
    })
    expect(parsed).not.toHaveProperty("totalPrice")
    expect(parsed).not.toHaveProperty("subtotal")
    expect(parsed).not.toHaveProperty("tax")
    expect(parsed).not.toHaveProperty("totalDays")
    expect(parsed).not.toHaveProperty("pricePerDay")
  })
})
