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

export interface CompanySetupDetails {
  companyName: string
  companyEmail: string
  companyPhone?: string | null
  companyAddress?: string | null
  companyCity?: string | null
  companyZipCode?: string | null
  companyCountry?: string | null
  managingDirector?: string | null
  commercialRegister?: string | null
  registerCourt?: string | null
  bankName: string
  accountName: string
  accountNumber: string
  swiftCode: string
  iban?: string | null
  supportEmail: string
  adminEmail: string
}

const businessProfileFields = [
  ["companyName", "registered business name"],
  ["companyEmail", "business email"],
  ["companyPhone", "phone number"],
  ["companyAddress", "street address"],
  ["companyCity", "city"],
  ["companyZipCode", "postal code"],
  ["companyCountry", "country"],
  ["managingDirector", "managing director"],
  ["commercialRegister", "commercial register number"],
  ["registerCourt", "register court"],
] as const satisfies ReadonlyArray<readonly [keyof CompanySetupDetails, string]>

interface OwnerSettingsGuideInput {
  company: CompanySetupDetails | null
  overview: Pick<ConfigurationOverview, "domainStatuses" | "legalHealth">
  completedStepIds?: string[]
  locale?: string
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
  "+49 (0) 30 12345678",
  "musterstraße 123",
  "10115 berlin",
  "max mustermann",
  "hrb 123456 b",
  "amtsgericht berlin-charlottenburg",
])

function isRealValue(value: string | null | undefined) {
  return Boolean(value?.trim() && !placeholderValues.has(value.trim().toLowerCase()))
}

export function businessProfileReadiness(company: CompanySetupDetails | null) {
  const missingFields = businessProfileFields.flatMap(([field, label]) => {
    const value = company?.[field]
    const complete = field === "companyName"
      ? value === "Qujo Autovermietung GmbH"
      : isRealValue(value)
    return complete ? [] : [label]
  })
  return { complete: missingFields.length === 0, missingFields }
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
  const tr = (english: string, german: string) => (input.locale === "de" ? german : english)
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

  const hasProfile = businessProfileReadiness(input.company).complete
  const hasPaymentDetails = Boolean(
    input.company &&
      isRealValue(input.company.bankName) &&
      isRealValue(input.company.accountName) &&
      isRealValue(input.company.accountNumber) &&
      isRealValue(input.company.swiftCode) &&
      isRealValue(input.company.iban),
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
      title: tr("Business details", "Unternehmensdaten"),
      description: tr("Your business name, customer contact details, address, and currency.", "Unternehmensname, Kundenkontaktdaten, Anschrift und Währung."),
      href: ownerSettingsStepHref("business-profile"),
      phase: "business-basics",
      state: hasProfile ? "complete" : "not-started",
      issueCount: 0,
    },
    {
      id: "rental-rules",
      title: tr("Rental rules and tax", "Mietregeln und Steuern"),
      description: tr("Set the minimum booking length and tax rules used for every car.", "Legen Sie Mindestmietdauer und Steuerregeln für alle Fahrzeuge fest."),
      href: ownerSettingsStepHref("rental-rules"),
      phase: "business-basics",
      state: savedState("rental-rules", pricing.state),
      issueCount: pricing.issueCount,
    },
    {
      id: "insurance",
      title: tr("Insurance", "Versicherung"),
      description: tr("Decide whether insurance is offered and what customers pay per day.", "Legen Sie fest, ob eine Versicherung angeboten wird und welchen Tagespreis Kunden zahlen."),
      href: ownerSettingsStepHref("insurance"),
      phase: "business-basics",
      state: savedState("insurance", insurance.state),
      issueCount: insurance.issueCount,
    },
    {
      id: "booking-flow",
      title: tr("Customer booking steps", "Buchungsschritte für Kunden"),
      description: tr("Choose which steps customers complete during the booking journey.", "Wählen Sie, welche Schritte Kunden während der Buchung durchlaufen."),
      href: ownerSettingsStepHref("booking-flow"),
      phase: "booking-experience",
      state: savedState("booking-flow", bookingFlow.state),
      issueCount: bookingFlow.issueCount,
    },
    {
      id: "driver-rules",
      title: tr("Driver rules", "Fahrerregeln"),
      description: tr("Set the minimum age and driving-licence requirements.", "Legen Sie Mindestalter und Führerscheinanforderungen fest."),
      href: ownerSettingsStepHref("driver-rules"),
      phase: "booking-experience",
      state: savedState("driver-rules", customerDriver.state),
      issueCount: customerDriver.issueCount,
    },
    {
      id: "customer-information",
      title: tr("Customer information", "Kundeninformationen"),
      description: tr("Choose which customer and driver details are required.", "Wählen Sie, welche Kunden- und Fahrerangaben erforderlich sind."),
      href: ownerSettingsStepHref("customer-information"),
      phase: "booking-experience",
      state: savedState("customer-information", customerDriver.state),
      issueCount: 0,
    },
    {
      id: "documents",
      title: tr("Required documents", "Erforderliche Dokumente"),
      description: tr("Choose which documents customers provide and when they provide them.", "Wählen Sie, welche Dokumente Kunden zu welchem Zeitpunkt bereitstellen müssen."),
      href: ownerSettingsStepHref("documents"),
      phase: "booking-experience",
      state: savedState("documents", documents.state),
      issueCount: documents.issueCount,
    },
    {
      id: "payments",
      title: tr("Payments and deposits", "Zahlungen und Kautionen"),
      description: tr("Set payment methods, bank details, booking deposits, and customer instructions.", "Legen Sie Zahlungsarten, Bankdaten, Buchungsanzahlungen und Kundenhinweise fest."),
      href: ownerSettingsStepHref("payments"),
      phase: "payments-communication",
      state: savedState("payments", combineStates(hasPaymentDetails ? "complete" : "not-started", payments.state)),
      issueCount: payments.issueCount,
    },
    {
      id: "customer-messages",
      title: tr("Customer messages", "Kundennachrichten"),
      description: tr("Set notification addresses and the messages customers receive.", "Legen Sie Benachrichtigungsadressen und Kundennachrichten fest."),
      href: ownerSettingsStepHref("customer-messages"),
      phase: "payments-communication",
      state: savedState("customer-messages", combineStates(hasNotificationContacts ? "complete" : "not-started", confirmations.state)),
      issueCount: confirmations.issueCount,
    },
    {
      id: "legal",
      title: tr("Legal terms and privacy", "Mietbedingungen und Datenschutz"),
      description: tr("Publish the terms and privacy notice customers must accept.", "Veröffentlichen Sie Mietbedingungen und Datenschutzhinweise, denen Kunden zustimmen müssen."),
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
