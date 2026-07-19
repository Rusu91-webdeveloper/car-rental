import { describe, expect, it } from "vitest"
import { buildOwnerSettingsGuide } from "@/lib/admin/owner-settings-guide"
import type { ConfigurationOverview } from "@/lib/business-configuration/workflow-service"

type GuideOverview = Pick<
  ConfigurationOverview,
  "activeRelease" | "blockers" | "domainStatuses" | "legalHealth"
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
      overview: overview(),
    })

    expect(guide.steps.find((step) => step.id === "business-profile")?.state).toBe("not-started")
    expect(guide.steps.find((step) => step.id === "payments")?.state).toBe("not-started")
    expect(guide.nextStep?.id).toBe("business-profile")
  })

  it("surfaces blocking validation as a needs-attention step", () => {
    const guide = buildOwnerSettingsGuide({
      company,
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

  it("keeps cars and per-car pricing outside business settings", () => {
    const guide = buildOwnerSettingsGuide({ company, overview: overview() })
    const ids = guide.steps.map((step) => step.id)
    const hrefs = guide.steps.map((step) => step.href)

    expect(ids).not.toContain("fleet")
    expect(ids).not.toContain("car-pricing")
    expect(hrefs).not.toContain("/admin?section=cars")
    expect(hrefs).not.toContain("/admin/cars/pricing")
  })

  it("shows every setup destination once without routing through another menu", () => {
    const guide = buildOwnerSettingsGuide({ company, overview: overview() })
    const hrefs = guide.steps.map((step) => step.href)

    expect(hrefs).toEqual([
      "/admin/settings?step=business-profile",
      "/admin/settings?step=rental-rules",
      "/admin/settings?step=insurance",
      "/admin/settings?step=booking-flow",
      "/admin/settings?step=driver-rules",
      "/admin/settings?step=customer-information",
      "/admin/settings?step=documents",
      "/admin/settings?step=payments",
      "/admin/settings?step=customer-messages",
      "/admin/settings?step=legal",
    ])
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(hrefs).not.toContain("/admin/bookings/settings")
    expect(hrefs.every((href) => href.startsWith("/admin/settings?step="))).toBe(true)
  })

  it("selects the first unfinished step while keeping completed steps editable", () => {
    const guide = buildOwnerSettingsGuide({ company, overview: overview() })

    expect(guide.steps[0]).toMatchObject({ id: "business-profile", state: "complete" })
    expect(guide.nextStep?.id).toBe("rental-rules")
  })

  it("resumes after the last successfully saved owner step", () => {
    const guide = buildOwnerSettingsGuide({
      company,
      overview: overview({
        domainStatuses: [
          {
            domain: "pricing-billing",
            label: "Pricing and billing",
            route: "/admin/bookings/settings/duration",
            configured: true,
            validationStatus: "NOT_VALIDATED",
            warningCount: 0,
            blockerCount: 0,
            status: "Draft changes",
          },
          {
            domain: "insurance",
            label: "Insurance",
            route: "/admin/bookings/settings/insurance",
            configured: true,
            validationStatus: "NOT_VALIDATED",
            warningCount: 0,
            blockerCount: 0,
            status: "Draft changes",
          },
        ],
      }),
      completedStepIds: ["rental-rules"],
    })

    expect(guide.steps.find((step) => step.id === "rental-rules")?.state).toBe("complete")
    expect(guide.nextStep?.id).toBe("insurance")
  })

  it("organizes the checkout into three simple business phases", () => {
    const guide = buildOwnerSettingsGuide({ company, overview: overview() })

    expect([...new Set(guide.steps.map((step) => step.phase))]).toEqual([
      "business-basics",
      "booking-experience",
      "payments-communication",
    ])
  })
})
