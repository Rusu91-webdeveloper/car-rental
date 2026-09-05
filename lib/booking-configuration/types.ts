import type {
  BookingStep,
  BusinessHoursException,
  CustomerField,
  HandoverPolicy,
  WeeklyOpeningHours,
} from "@/lib/business-configuration/domains"
import type { InsuranceTaxTreatment } from "@/lib/pricing/types"
import type { BookingLegalRequirements } from "@/lib/legal/types"

export const DRIVER_ELIGIBILITY_CODES = [
  "DRIVER_DATE_OF_BIRTH_REQUIRED",
  "DRIVER_UNDER_MINIMUM_AGE",
  "DRIVER_OVER_MAXIMUM_AGE",
  "LICENCE_NUMBER_REQUIRED",
  "LICENCE_ISSUE_DATE_REQUIRED",
  "LICENCE_EXPIRY_DATE_REQUIRED",
  "LICENCE_EXPIRED_AT_PICKUP",
  "LICENCE_EXPIRES_DURING_RENTAL",
  "LICENCE_HELD_TOO_SHORT",
  "LICENCE_ISSUING_COUNTRY_REQUIRED",
  "INVALID_DRIVER_DATE",
  "DRIVER_RULES_NOT_CONFIGURED",
] as const

export type DriverEligibilityCode = (typeof DRIVER_ELIGIBILITY_CODES)[number]

export interface DriverEligibilityIssue {
  code: DriverEligibilityCode
  severity: "BLOCKER" | "WARNING"
  field?: CustomerField
  message: string
}

export interface DriverEligibilityResult {
  eligible: boolean
  issues: DriverEligibilityIssue[]
  ageAtPickup?: number
  licenceHeldMonthsAtPickup?: number
  evaluatedAt: string
}

export interface BookingCustomerDriverInput {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  dateOfBirth?: string
  country?: string
  address?: string
  city?: string
  postalCode?: string
  nationality?: string
  licenceNumber?: string
  licenceIssueDate?: string
  licenceExpiryDate?: string
  licenceIssuingCountry?: string
}

export interface EffectiveBookingField {
  key: CustomerField
  visible: boolean
  required: boolean
  label: string
  helpText: string
  reason?: string
  validation: {
    kind: "text" | "email" | "date" | "country"
    maximumLength?: number
  }
  displayOrder: number
  section: "CUSTOMER" | "DRIVER"
  source: "SYSTEM" | "DRIVER_RULE" | "CONFIGURATION"
}

export interface EffectiveBookingStep {
  step: BookingStep
  label: string
  visible: boolean
  required: boolean
  available: boolean
  reason?: string
  displayOrder: number
}

export interface ActiveInsuranceOffer {
  configurationVersionId: string
  enabled: boolean
  requirementMode: "DISABLED" | "OPTIONAL" | "MANDATORY"
  customerFacingName: string
  description?: string
  pricePerDay: number
  currency: string
  taxTreatment: InsuranceTaxTreatment
  availabilityScope: "ALL_VEHICLES" | "SELECTED_VEHICLES"
  availabilityVehicleId?: string
  availableForVehicle: boolean
  showInConfirmation: boolean
  showCustomerSelection: boolean
  preselectedByDefault: boolean
}

export interface PublicBookingConfiguration {
  mode: "LEGACY" | "ACTIVE_RELEASE"
  releaseId?: string
  releaseNumber?: number
  customerDriverConfigVersionId?: string
  bookingWorkflowConfigVersionId?: string
  businessTimeZone: string
  weeklyOpeningHours: WeeklyOpeningHours
  openingHoursExceptions: BusinessHoursException[]
  handoverPolicy: HandoverPolicy
  minimumRentalMinutes: number
  minimumChargeDays: number
  gracePeriodMinutes: number
  preparationBufferMinutes: number
  fields: EffectiveBookingField[]
  steps: EffectiveBookingStep[]
  insurance?: ActiveInsuranceOffer
  payment?: {
    configurationVersionId: string
    methods: Array<{
      method: "TRANSFER" | "PAY_AT_PICKUP"
      configuredMode: "BANK_TRANSFER" | "CASH_ON_PICKUP"
      label: string
      description: string
      instructions?: string
    }>
    defaultMethod: "TRANSFER" | "PAY_AT_PICKUP"
    depositEnabled: boolean
    depositPercentage: number
  }
  legal?: BookingLegalRequirements
}
