import type { ConfigurationOverview } from "@/lib/business-configuration/workflow-service"
import type { ConfigurationDomainId } from "@/lib/business-configuration/types"

export type OwnerSettingsStepState =
  | "complete"
  | "attention"
  | "review"
  | "in-progress"
  | "not-started"

export const OWNER_SETTINGS_PHASES = [
  {
    id: "business-basics",
    label: "Business basics",
    description: "Your identity and the rental rules used across the business.",
  },
  {
    id: "booking-experience",
    label: "Booking experience",
    description: "What customers complete and what information you collect.",
  },
  {
    id: "payments-communication",
    label: "Payments and communication",
    description: "How customers pay, what they receive, and what they accept.",
  },
] as const

export type OwnerSettingsPhaseId = (typeof OWNER_SETTINGS_PHASES)[number]["id"]

export interface OwnerSettingsStep {
  id: string
  title: string
  description: string
  href: string
  phase: OwnerSettingsPhaseId
  state: OwnerSettingsStepState
  issueCount: number
}

export interface OwnerSettingsGuide {
  steps: OwnerSettingsStep[]
  completed: number
  total: number
  percent: number
  nextStep: OwnerSettingsStep | null
  attentionCount: number
}

export function ownerSettingsStepHref(stepId: string) {
  return `/admin/settings?step=${stepId}`
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
  overview: Pick<ConfigurationOverview, "domainStatuses" | "legalHealth">
  completedStepIds?: string[]
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
  const completedStepIds = new Set(input.completedStepIds ?? [])
  const savedState = (id: string, current: OwnerSettingsStepState): OwnerSettingsStepState => {
    if (!completedStepIds.has(id) || current === "attention" || current === "review") return current
    return "complete"
  }
  const pricing = domainState(input.overview, ["pricing-billing"])
  const insurance = domainState(input.overview, ["insurance"])
  const bookingFlow = domainState(input.overview, ["booking-workflow"])
  const customerDriver = domainState(input.overview, ["customer-driver-requirements"])
  const documents = domainState(input.overview, ["document-policy"])
  const payments = domainState(input.overview, ["payments"])
  const confirmations = domainState(input.overview, ["confirmations"])
  const legalAcceptance = domainState(input.overview, ["legal-acceptance"])

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
  const steps: OwnerSettingsStep[] = [
    {
      id: "business-profile",
      title: "Business details",
      description: "Your business name, customer contact details, address, and currency.",
      href: ownerSettingsStepHref("business-profile"),
      phase: "business-basics",
      state: hasProfile ? "complete" : "not-started",
      issueCount: 0,
    },
    {
      id: "rental-rules",
      title: "Rental rules and tax",
      description: "Set the minimum booking length and tax rules used for every car.",
      href: ownerSettingsStepHref("rental-rules"),
      phase: "business-basics",
      state: savedState("rental-rules", pricing.state),
      issueCount: pricing.issueCount,
    },
    {
      id: "insurance",
      title: "Insurance",
      description: "Decide whether insurance is offered and what customers pay per day.",
      href: ownerSettingsStepHref("insurance"),
      phase: "business-basics",
      state: savedState("insurance", insurance.state),
      issueCount: insurance.issueCount,
    },
    {
      id: "booking-flow",
      title: "Customer booking steps",
      description: "Choose which steps customers complete during the booking journey.",
      href: ownerSettingsStepHref("booking-flow"),
      phase: "booking-experience",
      state: savedState("booking-flow", bookingFlow.state),
      issueCount: bookingFlow.issueCount,
    },
    {
      id: "driver-rules",
      title: "Driver rules",
      description: "Set the minimum age and driving-licence requirements.",
      href: ownerSettingsStepHref("driver-rules"),
      phase: "booking-experience",
      state: savedState("driver-rules", customerDriver.state),
      issueCount: customerDriver.issueCount,
    },
    {
      id: "customer-information",
      title: "Customer information",
      description: "Choose which customer and driver details are required.",
      href: ownerSettingsStepHref("customer-information"),
      phase: "booking-experience",
      state: savedState("customer-information", customerDriver.state),
      issueCount: 0,
    },
    {
      id: "documents",
      title: "Required documents",
      description: "Choose which documents customers provide and when they provide them.",
      href: ownerSettingsStepHref("documents"),
      phase: "booking-experience",
      state: savedState("documents", documents.state),
      issueCount: documents.issueCount,
    },
    {
      id: "payments",
      title: "Payments and deposits",
      description: "Set payment methods, bank details, booking deposits, and customer instructions.",
      href: ownerSettingsStepHref("payments"),
      phase: "payments-communication",
      state: savedState("payments", combineStates(hasPaymentDetails ? "complete" : "not-started", payments.state)),
      issueCount: payments.issueCount,
    },
    {
      id: "customer-messages",
      title: "Customer messages",
      description: "Set notification addresses and the messages customers receive.",
      href: ownerSettingsStepHref("customer-messages"),
      phase: "payments-communication",
      state: savedState("customer-messages", combineStates(hasNotificationContacts ? "complete" : "not-started", confirmations.state)),
      issueCount: confirmations.issueCount,
    },
    {
      id: "legal",
      title: "Legal terms and privacy",
      description: "Publish the terms and privacy notice customers must accept.",
      href: ownerSettingsStepHref("legal"),
      phase: "payments-communication",
      state: savedState("legal", combineStates(legalAcceptance.state, legalState)),
      issueCount: legalAcceptance.issueCount + input.overview.legalHealth.missingTranslations.length,
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
