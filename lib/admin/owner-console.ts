import type { ConfigurationOverview } from "@/lib/business-configuration/workflow-service"

export interface OwnerSetupStep {
  id: string
  title: string
  description: string
  href: string
  complete: boolean
}

export interface OwnerSetupProgress {
  completed: number
  total: number
  percent: number
  readyForBookings: boolean
  steps: OwnerSetupStep[]
}

interface OwnerSetupInput {
  company: { companyName: string; companyEmail: string } | null
  activeCarCount: number
  overview: Pick<
    ConfigurationOverview,
    "activeRelease" | "blockers" | "domainStatuses" | "fleetCoverage"
  >
}

function domainConfigured(
  overview: OwnerSetupInput["overview"],
  domain: ConfigurationOverview["domainStatuses"][number]["domain"],
) {
  return overview.domainStatuses.some((item) => item.domain === domain && item.configured)
}

export function buildOwnerSetupProgress(input: OwnerSetupInput): OwnerSetupProgress {
  const hasBusinessProfile = Boolean(
    input.company?.companyName.trim() &&
      input.company.companyName !== "RentCar GmbH" &&
      input.company.companyEmail.trim() &&
      input.company.companyEmail !== "info@rentcar.de",
  )
  const hasCompletePricing =
    input.activeCarCount > 0 &&
    input.overview.fleetCoverage.totalVehicles > 0 &&
    input.overview.fleetCoverage.dailyRates >= input.overview.fleetCoverage.totalVehicles

  const steps: OwnerSetupStep[] = [
    {
      id: "business-profile",
      title: "Add business details",
      description: "Use your real company name and contact email.",
      href: "/admin/settings/profile",
      complete: hasBusinessProfile,
    },
    {
      id: "rental-rules",
      title: "Set booking length and tax",
      description: "Choose the minimum days and tax applied to every car.",
      href: "/admin/bookings/settings/duration",
      complete: domainConfigured(input.overview, "pricing-billing"),
    },
    {
      id: "insurance",
      title: "Review insurance",
      description: "Turn insurance on or off and set its daily price.",
      href: "/admin/bookings/settings/insurance",
      complete: domainConfigured(input.overview, "insurance"),
    },
    {
      id: "payments",
      title: "Configure payments and deposit",
      description: "Choose the deposit, payment methods, and instructions.",
      href: "/admin/payments",
      complete: domainConfigured(input.overview, "payments"),
    },
    {
      id: "booking-rules",
      title: "Review booking details",
      description: "Choose the customer steps and driver requirements.",
      href: "/admin/bookings/settings",
      complete:
        domainConfigured(input.overview, "booking-workflow") &&
        domainConfigured(input.overview, "customer-driver-requirements"),
    },
    {
      id: "first-car",
      title: "Add the first car",
      description: "Add at least one car that customers can rent.",
      href: "/admin?section=cars",
      complete: input.activeCarCount > 0,
    },
    {
      id: "pricing",
      title: "Set car pricing",
      description: "Every active car needs a daily price.",
      href: "/admin/cars/pricing",
      complete: hasCompletePricing,
    },
    {
      id: "settings",
      title: "Finish business settings",
      description: "Complete the guided setup so the business is ready for bookings.",
      href: "/admin/settings",
      complete: Boolean(input.overview.activeRelease) && input.overview.blockers.length === 0,
    },
  ]
  const completed = steps.filter((step) => step.complete).length

  return {
    completed,
    total: steps.length,
    percent: Math.round((completed / steps.length) * 100),
    readyForBookings: completed === steps.length,
    steps,
  }
}
