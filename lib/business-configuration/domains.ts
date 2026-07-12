import type { ConfigurationDomainId } from "./types";

export const REQUIREMENT_LEVELS = ["REQUIRED", "OPTIONAL", "HIDDEN"] as const;
export type RequirementLevel = (typeof REQUIREMENT_LEVELS)[number];

export const CUSTOMER_FIELD_MODES = [
  "REQUIRED",
  "OPTIONAL",
  "DISABLED",
] as const;
export type CustomerFieldMode = (typeof CUSTOMER_FIELD_MODES)[number];

export const DOCUMENT_REQUIREMENT_MODES = [
  "REQUIRED",
  "OPTIONAL",
  "DISABLED",
] as const;
export type DocumentRequirementMode =
  (typeof DOCUMENT_REQUIREMENT_MODES)[number];

export const CUSTOMER_FIELDS = [
  "FIRST_NAME",
  "LAST_NAME",
  "EMAIL",
  "PHONE",
  "DATE_OF_BIRTH",
  "COUNTRY",
  "ADDRESS",
  "CITY",
  "POSTAL_CODE",
  "NATIONALITY",
  "LICENCE_NUMBER",
  "LICENCE_ISSUE_DATE",
  "LICENCE_EXPIRY_DATE",
  "LICENCE_ISSUING_COUNTRY",
] as const;
export type CustomerField = (typeof CUSTOMER_FIELDS)[number];

export const BOOKING_STEPS = [
  "VEHICLE_AND_DATES",
  "CUSTOMER_INFORMATION",
  "DRIVER_INFORMATION",
  "INSURANCE",
  "DOCUMENTS",
  "LEGAL_ACCEPTANCE",
  "PAYMENT",
  "REVIEW",
  "CONFIRMATION",
] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

export const DOCUMENT_TYPES = [
  "IDENTITY_CARD",
  "PASSPORT",
  "DRIVING_LICENCE",
] as const;
export type CustomerDocumentType = (typeof DOCUMENT_TYPES)[number];

export const PAYMENT_METHODS = [
  "BOOKING_REQUEST",
  "CASH_ON_PICKUP",
  "CARD_ON_PICKUP",
  "BANK_TRANSFER",
  "ONLINE_DEPOSIT",
  "ONLINE_FULL",
] as const;
export type ConfiguredPaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CONFIRMATION_SECTIONS = [
  "PRICING",
  "INSURANCE",
  "PAYMENT",
  "PICKUP_RETURN",
  "CUSTOMER_DETAILS",
  "DOCUMENT_REMINDERS",
  "LEGAL_REFERENCES",
  "COMPANY_CONTACT",
] as const;
export type ConfirmationSection = (typeof CONFIRMATION_SECTIONS)[number];

export interface GeneralRentalConfiguration {
  businessTimeZone: string;
  currency: string;
  supportedLocales: string[];
}

export interface PricingBillingConfiguration {
  weeklyPricingEnabled: boolean;
  monthlyPricingEnabled: boolean;
  mixedDurationStrategy:
    | "DAILY_ONLY"
    | "LONGEST_BLOCKS_THEN_DAYS"
    | "LOWEST_VALID_TOTAL";
  rentalMonthDefinition: "FIXED_28_DAYS" | "FIXED_30_DAYS" | "CALENDAR_MONTH";
  billableDayRule:
    | "STARTED_24_HOUR_PERIODS"
    | "CALENDAR_DAYS"
    | "PICKUP_TIME_BOUNDARY";
  gracePeriodMinutes: number;
  minimumRentalMinutes: number;
  minimumChargeDays: number;
  pricesIncludeTax: boolean;
  taxRateBps: number;
}

export interface InsuranceConfiguration {
  enabled: boolean;
  customerFacingName: string;
  shortDescription?: string;
  selectionMode: "OPTIONAL" | "MANDATORY";
  pricePerDay: number;
  taxTreatment: "INHERIT_RENTAL" | "TAX_INCLUDED" | "TAX_EXCLUDED";
  availabilityScope: "ALL_VEHICLES" | "SELECTED_VEHICLES";
  vehicleIds: string[];
  showInConfirmation: boolean;
  showCustomerSelection: boolean;
  preselectedByDefault: boolean;
}

export interface CustomerDriverRequirementsConfiguration {
  minimumDriverAge: number;
  maximumDriverAge?: number;
  minimumLicenceHeldMonths: number;
  licenceMustCoverRentalEnd: boolean;
  allowedLicenceCountries: string[];
  fields: Record<CustomerField, CustomerFieldMode>;
}

export interface BookingStepConfiguration {
  step: BookingStep;
  requirement: RequirementLevel;
  displayOrder: number;
}

export interface BookingWorkflowConfiguration {
  steps: BookingStepConfiguration[];
}

export interface DocumentRequirement {
  documentType: CustomerDocumentType;
  requirement: DocumentRequirementMode;
  fileCount: number;
  sides: "SINGLE_FILE" | "FRONT_AND_BACK";
  uploadStage: "DURING_BOOKING" | "AFTER_REQUEST" | "BEFORE_PICKUP";
}

export interface DocumentPolicyConfiguration {
  retentionPreferenceDays: number;
  requirements: DocumentRequirement[];
  permittedRoleIds: string[];
}

export interface PaymentMethodConfiguration {
  method: ConfiguredPaymentMethod;
  enabled: boolean;
}

export interface PaymentInstructionTranslation {
  locale: string;
  instructions: string;
}

export interface PaymentConfiguration {
  defaultMethod: ConfiguredPaymentMethod;
  confirmationMode: "IMMEDIATE" | "REQUIRES_REVIEW";
  depositMode: "NONE" | "FIXED_AMOUNT" | "PERCENTAGE_BPS";
  depositValue: number;
  remainingBalanceRule: "NOT_APPLICABLE" | "ON_PICKUP" | "BEFORE_PICKUP";
  methods: PaymentMethodConfiguration[];
  instructions: PaymentInstructionTranslation[];
}

export interface ConfirmationContentTranslation {
  locale: string;
  heading?: string;
  safeContent?: string;
}

export interface ConfirmationConfiguration {
  sections: Array<{ section: ConfirmationSection; enabled: boolean }>;
  content: ConfirmationContentTranslation[];
}

export interface PublishedLegalDocumentReference {
  id: string;
  type: "RENTAL_TERMS" | "PRIVACY_NOTICE";
  publicationStatus: "PUBLISHED" | "ARCHIVED";
  availableLocales: string[];
  contentHash: string;
}

export interface LegalAcceptanceLabels {
  locale: string;
  termsCheckboxLabel?: string;
  termsLinkLabel: string;
  privacyCheckboxLabel?: string;
  privacyLinkLabel: string;
}

export interface LegalAcceptanceConfiguration {
  termsDocument: PublishedLegalDocumentReference;
  privacyDocument: PublishedLegalDocumentReference;
  termsAcceptance: "REQUIRED" | "DISPLAY_ONLY" | "DISABLED";
  privacyAcknowledgment: "REQUIRED" | "DISPLAY_ONLY" | "DISABLED";
  retainRenderedSnapshot: boolean;
  bookingEnforcementEnabled: boolean;
  requiredLocales: string[];
  termsPresentation: "INLINE" | "DIALOG";
  privacyPresentation: "INLINE" | "DIALOG";
  showInConfirmation: boolean;
  translations: LegalAcceptanceLabels[];
}

export interface BusinessConfigurationDomains {
  "general-rental": GeneralRentalConfiguration;
  "pricing-billing": PricingBillingConfiguration;
  insurance: InsuranceConfiguration;
  "customer-driver-requirements": CustomerDriverRequirementsConfiguration;
  "booking-workflow": BookingWorkflowConfiguration;
  "document-policy": DocumentPolicyConfiguration;
  payments: PaymentConfiguration;
  confirmations: ConfirmationConfiguration;
  "legal-acceptance": LegalAcceptanceConfiguration;
}

export type ConfigurationForDomain<Domain extends ConfigurationDomainId> =
  BusinessConfigurationDomains[Domain];
