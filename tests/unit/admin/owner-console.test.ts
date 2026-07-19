import { describe, expect, it } from "vitest"
import { buildOwnerSetupProgress } from "@/lib/admin/owner-console"
import type { ConfigurationOverview } from "@/lib/business-configuration/workflow-service"

type SetupOverview = Pick<ConfigurationOverview, "activeRelease" | "blockers" | "domainStatuses" | "fleetCoverage">

function overview(overrides: Partial<SetupOverview> = {}): SetupOverview {
  return {
    activeRelease: null,
    blockers: [],
    domainStatuses: [],
    fleetCoverage: {
      totalVehicles: 0,
      dailyRates: 0,
      missingDailyRates: 0,
      missingWeeklyRates: 0,
      missingMonthlyRates: 0,
      missingAllReleaseRates: 0,
    },
    ...overrides,
  }
}

const configured = (domain: ConfigurationOverview["domainStatuses"][number]["domain"]) => ({
  domain,
  label: domain,
  route: "/admin/settings",
  configured: true,
  validationStatus: "VALID",
  warningCount: 0,
  blockerCount: 0,
  status: "Ready",
})

describe("owner setup progress", () => {
  it("guides a new owner to real owner-facing routes", () => {
    const result = buildOwnerSetupProgress({
      company: { companyName: "RentCar GmbH", companyEmail: "info@rentcar.de" },
      activeCarCount: 0,
      overview: overview(),
    })

    expect(result.completed).toBe(0)
    expect(result.readyForBookings).toBe(false)
    expect(result.steps.map((step) => step.href)).toEqual([
      "/admin/settings/profile",
      "/admin/bookings/settings/duration",
      "/admin/bookings/settings/insurance",
      "/admin/payments",
      "/admin/bookings/settings",
      "/admin?section=cars",
      "/admin/cars/pricing",
      "/admin/advanced/configuration",
    ])
    expect(result.steps.some((step) => step.href.includes("business-configuration"))).toBe(false)
  })

  it("marks setup ready only when essential configuration is published", () => {
    const result = buildOwnerSetupProgress({
      company: { companyName: "City Drive Rentals", companyEmail: "hello@citydrive.example" },
      activeCarCount: 2,
      overview: overview({
        activeRelease: {} as NonNullable<ConfigurationOverview["activeRelease"]>,
        domainStatuses: [
          configured("pricing-billing"),
          configured("insurance"),
          configured("booking-workflow"),
          configured("customer-driver-requirements"),
          configured("payments"),
        ],
        fleetCoverage: {
          totalVehicles: 2,
          dailyRates: 2,
          missingDailyRates: 0,
          missingWeeklyRates: 0,
          missingMonthlyRates: 0,
          missingAllReleaseRates: 0,
        },
      }),
    })

    expect(result.completed).toBe(result.total)
    expect(result.percent).toBe(100)
    expect(result.readyForBookings).toBe(true)
  })

  it("does not treat an empty fleet as complete pricing", () => {
    const result = buildOwnerSetupProgress({ company: null, activeCarCount: 0, overview: overview() })
    expect(result.steps.find((step) => step.id === "pricing")?.complete).toBe(false)
  })
})
