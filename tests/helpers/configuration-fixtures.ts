import {
  BOOKING_STEPS,
  CONFIRMATION_SECTIONS,
  CUSTOMER_FIELDS,
  type BusinessConfigurationDomains,
} from "@/lib/business-configuration/domains"
import {
  DEFAULT_HANDOVER_POLICY,
  DEFAULT_OPENING_HOURS_EXCEPTIONS,
  DEFAULT_WEEKLY_OPENING_HOURS,
} from "@/lib/business-hours"

const requiredCustomerFields = new Set(["FIRST_NAME", "LAST_NAME", "EMAIL", "DATE_OF_BIRTH"])

export function validBusinessConfigurationDomains(): BusinessConfigurationDomains {
  return {
    "general-rental": {
      businessTimeZone: "Europe/Berlin",
      currency: "EUR",
      supportedLocales: ["de", "en"],
      weeklyOpeningHours: DEFAULT_WEEKLY_OPENING_HOURS,
      openingHoursExceptions: DEFAULT_OPENING_HOURS_EXCEPTIONS,
      handoverPolicy: DEFAULT_HANDOVER_POLICY,
    },
    "pricing-billing": {
      weeklyPricingEnabled: false,
      monthlyPricingEnabled: false,
      mixedDurationStrategy: "DAILY_ONLY",
      rentalMonthDefinition: "FIXED_30_DAYS",
      billableDayRule: "STARTED_24_HOUR_PERIODS",
      gracePeriodMinutes: 0,
      preparationBufferMinutes: 120,
      minimumRentalMinutes: 1,
      minimumChargeDays: 1,
      pricesIncludeTax: true,
      taxRateBps: 0,
    },
    insurance: {
      enabled: false,
      customerFacingName: "Vollkasko",
      selectionMode: "OPTIONAL",
      pricePerDay: 0,
      taxTreatment: "INHERIT_RENTAL",
      availabilityScope: "ALL_VEHICLES",
      vehicleIds: [],
      showInConfirmation: true,
      showCustomerSelection: false,
      preselectedByDefault: false,
    },
    "customer-driver-requirements": {
      minimumDriverAge: 18,
      minimumLicenceHeldMonths: 0,
      licenceMustCoverRentalEnd: true,
      allowedLicenceCountries: [],
      fields: Object.fromEntries(
        CUSTOMER_FIELDS.map((field) => [field, requiredCustomerFields.has(field) ? "REQUIRED" : "OPTIONAL"]),
      ) as BusinessConfigurationDomains["customer-driver-requirements"]["fields"],
    },
    "booking-workflow": {
      steps: BOOKING_STEPS.map((step, displayOrder) => ({
        step,
        requirement: ["INSURANCE", "DOCUMENTS", "LEGAL_ACCEPTANCE"].includes(step) ? "HIDDEN" : "REQUIRED",
        displayOrder,
      })),
    },
    "document-policy": {
      retentionPreferenceDays: 90,
      requirements: [
        {
          documentType: "DRIVING_LICENCE",
          requirement: "OPTIONAL",
          fileCount: 1,
          sides: "SINGLE_FILE",
          uploadStage: "DURING_BOOKING",
        },
      ],
      permittedRoleIds: [],
    },
    payments: {
      defaultMethod: "BANK_TRANSFER",
      confirmationMode: "REQUIRES_REVIEW",
      depositMode: "NONE",
      depositValue: 0,
      remainingBalanceRule: "NOT_APPLICABLE",
      methods: [{ method: "BANK_TRANSFER", enabled: true }],
      instructions: [{ method: "BANK_TRANSFER", locale: "de", instructions: "Bank instructions" }],
    },
    confirmations: {
      sections: CONFIRMATION_SECTIONS.map((section) => ({
        section,
        enabled: true,
      })),
      content: [
        { locale: "de", heading: "Buchungsbestätigung" },
        { locale: "en", heading: "Booking confirmation" },
      ],
    },
    "legal-acceptance": {
      termsDocument: {
        id: "terms-1",
        type: "RENTAL_TERMS",
        publicationStatus: "PUBLISHED",
        availableLocales: ["de", "en"],
        contentHash: "a".repeat(64),
      },
      privacyDocument: {
        id: "privacy-1",
        type: "PRIVACY_NOTICE",
        publicationStatus: "PUBLISHED",
        availableLocales: ["de", "en"],
        contentHash: "b".repeat(64),
      },
      termsAcceptance: "REQUIRED",
      privacyAcknowledgment: "REQUIRED",
      retainRenderedSnapshot: true,
      bookingEnforcementEnabled: false,
      requiredLocales: [],
      termsPresentation: "DIALOG",
      privacyPresentation: "DIALOG",
      showInConfirmation: true,
      translations: [],
    },
  }
}
