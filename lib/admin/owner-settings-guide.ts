import type { ConfigurationOverview } from "@/lib/business-configuration/workflow-service"
import type { ConfigurationDomainId } from "@/lib/business-configuration/types"

export type OwnerSettingsStepState =
  | "complete"
  | "attention"
  | "review"
  | "in-progress"
  | "not-started"

export interface OwnerSettingsStepLink {
  label: string
  href: string
}

export interface OwnerSettingsStep {
  id: string
  title: string
  description: string
  href: string
  state: OwnerSettingsStepState
  issueCount: number
  links?: OwnerSettingsStepLink[]
}

export interface OwnerSettingsGuide {
  steps: OwnerSettingsStep[]
  completed: number
  total: number
  percent: number
  nextStep: OwnerSettingsStep | null
  attentionCount: number
}

interface CompanySetupDetails {
  companyName: string
  companyEmail: string
  bankName: string
  accountName: string
  accountNumber: string
  swiftCode: string
  supportEmail: string
  adminEmail: string
}

interface OwnerSettingsGuideInput {
  company: CompanySetupDetails | null
  activeCarCount: number
  overview: Pick<
    ConfigurationOverview,
    "activeRelease" | "blockers" | "domainStatuses" | "fleetCoverage" | "legalHealth"
  >
}

const placeholderValues = new Set([
  "rentcar gmbh",
  "info@rentcar.de",
  "your bank name",
  "car rental company",
  "1234567890",
  "yourswift",
  "support@rentcar.com",
  "admin@rentcar.com",
])

function isRealValue(value: string | null | undefined) {
  return Boolean(value?.trim() && !placeholderValues.has(value.trim().toLowerCase()))
}

function domainState(
  overview: OwnerSettingsGuideInput["overview"],
  domains: ConfigurationDomainId[],
): { state: OwnerSettingsStepState; issueCount: number } {
  const statuses = domains.map((domain) => overview.domainStatuses.find((item) => item.domain === domain))
  const issueCount = statuses.reduce(
    (total, item) => total + (item?.blockerCount ?? 0) + (item?.warningCount ?? 0),
    0,
  )

  if (statuses.some((item) => item?.blockerCount || item?.status === "Action required")) {
    return { state: "attention", issueCount }
  }
  if (statuses.some((item) => item?.warningCount || item?.status === "Warning")) {
    return { state: "review", issueCount }
  }
  if (statuses.some((item) => item?.status === "Draft changes" || item?.validationStatus === "NOT_VALIDATED")) {
    return { state: "in-progress", issueCount }
  }
  if (statuses.length > 0 && statuses.every((item) => item?.configured)) {
    return { state: "complete", issueCount }
  }
  return { state: "not-started", issueCount }
}

function combineStates(...states: OwnerSettingsStepState[]): OwnerSettingsStepState {
  if (states.includes("attention")) return "attention"
  if (states.includes("review")) return "review"
  if (states.includes("not-started")) return "not-started"
  if (states.includes("in-progress")) return "in-progress"
  return "complete"
}

export function buildOwnerSettingsGuide(input: OwnerSettingsGuideInput): OwnerSettingsGuide {
  const pricing = domainState(input.overview, ["pricing-billing"])
  const insurance = domainState(input.overview, ["insurance"])
  const booking = domainState(input.overview, [
    "booking-workflow",
    "customer-driver-requirements",
    "document-policy",
  ])
  const payments = domainState(input.overview, ["payments"])
  const communication = domainState(input.overview, ["confirmations", "legal-acceptance"])

  const hasProfile = Boolean(
    input.company && isRealValue(input.company.companyName) && isRealValue(input.company.companyEmail),
  )
  const hasPaymentDetails = Boolean(
    input.company &&
      isRealValue(input.company.bankName) &&
      isRealValue(input.company.accountName) &&
      isRealValue(input.company.accountNumber) &&
      isRealValue(input.company.swiftCode),
  )
  const hasNotificationContacts = Boolean(
    input.company && isRealValue(input.company.supportEmail) && isRealValue(input.company.adminEmail),
  )
  const legalState: OwnerSettingsStepState = input.overview.legalHealth.configured
    ? "complete"
    : input.overview.legalHealth.unpublishedDrafts > 0
      ? "in-progress"
      : "attention"
  const hasCars = input.activeCarCount > 0
  const hasCompletePricing =
    hasCars &&
    input.overview.fleetCoverage.totalVehicles > 0 &&
    input.overview.fleetCoverage.dailyRates >= input.overview.fleetCoverage.totalVehicles

  const steps: OwnerSettingsStep[] = [
    {
      id: "business-profile",
      title: "Business details",
      description: "Your business name, customer contact details, address, and currency.",
      href: "/admin/settings/profile",
      state: hasProfile ? "complete" : "not-started",
      issueCount: 0,
    },
    {
      id: "rental-rules",
      title: "Rental rules and tax",
      description: "Set the minimum booking length and tax rules used for every car.",
      href: "/admin/bookings/settings/duration",
      state: pricing.state,
      issueCount: pricing.issueCount,
    },
    {
      id: "insurance",
      title: "Insurance",
      description: "Decide whether insurance is offered and what customers pay per day.",
      href: "/admin/bookings/settings/insurance",
      state: insurance.state,
      issueCount: insurance.issueCount,
    },
    {
      id: "booking-experience",
      title: "Booking experience",
      description: "Choose the customer steps, driver rules, required information, and documents.",
      href: "/admin/bookings/settings",
      state: booking.state,
      issueCount: booking.issueCount,
      links: [
        { label: "Booking steps", href: "/admin/bookings/settings/flow" },
        { label: "Driver rules", href: "/admin/bookings/driver-rules" },
        { label: "Customer details", href: "/admin/customers/settings" },
        { label: "Documents", href: "/admin/documents/settings" },
      ],
    },
    {
      id: "payments",
      title: "Payments and deposits",
      description: "Set payment methods, bank details, booking deposits, and customer instructions.",
      href: "/admin/payments",
      state: combineStates(hasPaymentDetails ? "complete" : "not-started", payments.state),
      issueCount: payments.issueCount,
    },
    {
      id: "communication-legal",
      title: "Customer messages and legal",
      description: "Set confirmation messages and keep your terms and privacy notice ready.",
      href: "/admin/settings/notifications",
      state: combineStates(hasNotificationContacts ? "complete" : "not-started", communication.state, legalState),
      issueCount:
        communication.issueCount + input.overview.legalHealth.missingTranslations.length,
      links: [
        { label: "Customer messages", href: "/admin/settings/notifications" },
        { label: "Legal terms", href: "/admin/settings/legal" },
      ],
    },
    {
      id: "fleet",
      title: "Add your cars",
      description: "Add at least one active car so customers have something to book.",
      href: "/admin?section=cars",
      state: hasCars ? "complete" : "not-started",
      issueCount: 0,
    },
    {
      id: "car-pricing",
      title: "Car pricing",
      description: "Give every active car a daily price and any longer-rental prices you offer.",
      href: "/admin/cars/pricing",
      state: hasCompletePricing ? pricing.state : hasCars ? "attention" : "not-started",
      issueCount:
        pricing.issueCount +
        input.overview.fleetCoverage.missingDailyRates +
        input.overview.fleetCoverage.missingWeeklyRates +
        input.overview.fleetCoverage.missingMonthlyRates,
    },
    {
      id: "publish",
      title: "Review and publish",
      description: "See exactly what needs fixing, then make the complete setup live.",
      href: "/admin/advanced/configuration",
      state:
        input.overview.blockers.length > 0
          ? "attention"
          : input.overview.activeRelease
            ? "complete"
            : "in-progress",
      issueCount: input.overview.blockers.length,
    },
  ]

  const completed = steps.filter((step) => step.state === "complete").length
  const nextStep = steps.find((step) => step.state !== "complete") ?? null

  return {
    steps,
    completed,
    total: steps.length,
    percent: Math.round((completed / steps.length) * 100),
    nextStep,
    attentionCount: steps.filter((step) => step.state === "attention").length,
  }
}
