import { describe, expect, it } from "vitest"
import { formatCompanyPickupLocation } from "@/lib/company-pickup-location"

describe("company pickup location", () => {
  it("formats the address selected in company settings", () => {
    expect(
      formatCompanyPickupLocation({
        companyAddress: "Owner Street 12",
        companyZipCode: "400001",
        companyCity: "Cluj-Napoca",
        companyState: "Cluj",
        companyCountry: "Romania",
      }),
    ).toBe("Owner Street 12, 400001 Cluj-Napoca, Cluj, Romania")
  })

  it("does not allow booking without a complete owner address", () => {
    expect(
      formatCompanyPickupLocation({
        companyAddress: "Owner Street 12",
        companyZipCode: null,
        companyCity: "Cluj-Napoca",
        companyCountry: "Romania",
      }),
    ).toBeNull()
  })
})
