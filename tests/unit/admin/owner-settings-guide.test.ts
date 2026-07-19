import { describe, expect, it } from "vitest"
import { buildOwnerSettingsGuide } from "@/lib/admin/owner-settings-guide"
import type { ConfigurationOverview } from "@/lib/business-configuration/workflow-service"

type GuideOverview = Pick<
  ConfigurationOverview,
  "activeRelease" | "blockers" | "domainStatuses" | "fleetCoverage" | "legalHealth"
>

const company = {
  companyName: "City Drive Rentals",
  companyEmail: "hello@city-drive.example",
  bankName: "City Bank",
  accountName: "City Drive Rentals",
  accountNumber: "100200300",
  swiftCode: "CITYROBU",
  supportEmail: "support@city-drive.example",
  adminEmail: "owner@city-drive.example",
}

function overview(overrides: Partial<GuideOverview> = {}): GuideOverview {
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
    legalHealth: {
      requiredTypes: ["RENTAL_TERMS", "PRIVACY_NOTICE"],
      publishedLanguages: [],
      missingTranslations: [],
      unpublishedDrafts: 0,
      configured: false,
    },
    ...overrides,
  }
}

describe("owner settings guide", () => {
  it("treats demo placeholders as unfinished setup", () => {
    const guide = buildOwnerSettingsGuide({
      company: {
        companyName: "RentCar GmbH",
        companyEmail: "info@rentcar.de",
        bankName: "Your Bank Name",
        accountName: "Car Rental Company",
        accountNumber: "1234567890",
        swiftCode: "YOURSWIFT",
        supportEmail: "support@rentcar.com",
        adminEmail: "admin@rentcar.com",
      },
      activeCarCount: 0,
      overview: overview(),
    })

    expect(guide.steps.find((step) => step.id === "business-profile")?.state).toBe("not-started")
    expect(guide.steps.find((step) => step.id === "payments")?.state).toBe("not-started")
    expect(guide.nextStep?.id).toBe("business-profile")
  })

  it("surfaces blocking validation as a needs-attention step", () => {
    const guide = buildOwnerSettingsGuide({
      company,
      activeCarCount: 1,
      overview: overview({
        domainStatuses: [
          {
            domain: "insurance",
            label: "Insurance",
            route: "/admin/bookings/settings/insurance",
            configured: true,
            validationStatus: "BLOCKED",
            warningCount: 0,
            blockerCount: 2,
            status: "Action required",
          },
        ],
      }),
    })

    const insurance = guide.steps.find((step) => step.id === "insurance")
    expect(insurance?.state).toBe("attention")
    expect(insurance?.issueCount).toBe(2)
    expect(guide.attentionCount).toBeGreaterThan(0)
  })

  it("keeps car pricing unfinished until every car has a daily rate", () => {
    const guide = buildOwnerSettingsGuide({
      company,
      activeCarCount: 2,
      overview: overview({
        fleetCoverage: {
          totalVehicles: 2,
          dailyRates: 1,
          missingDailyRates: 1,
          missingWeeklyRates: 0,
          missingMonthlyRates: 0,
          missingAllReleaseRates: 1,
        },
      }),
    })

    expect(guide.steps.find((step) => step.id === "fleet")?.state).toBe("complete")
    expect(guide.steps.find((step) => step.id === "car-pricing")?.state).toBe("attention")
  })
})
