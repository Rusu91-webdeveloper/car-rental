import { describe, expect, it } from "vitest"
import { currentLocalizedPath } from "@/lib/current-localized-path"

describe("locale switching", () => {
  it("keeps the current query string and hash", () => {
    expect(
      currentLocalizedPath("/cars", {
        search: "?pickupDate=2026-08-10&dropoffDate=2026-08-12",
        hash: "#available",
      }),
    ).toBe("/cars?pickupDate=2026-08-10&dropoffDate=2026-08-12#available")
  })

  it("works without a browser location during server rendering", () => {
    expect(currentLocalizedPath("/admin")).toBe("/admin")
  })
})
