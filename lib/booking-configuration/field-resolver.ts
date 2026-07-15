import {
  CUSTOMER_FIELDS,
  type CustomerDriverRequirementsConfiguration,
  type CustomerField,
} from "@/lib/business-configuration/domains"
import type { BookingCustomerDriverInput, EffectiveBookingField } from "./types"

const metadata: Record<
  CustomerField,
  Omit<EffectiveBookingField, "visible" | "required" | "displayOrder" | "source" | "reason">
> = {
  FIRST_NAME: {
    key: "FIRST_NAME",
    label: "First name",
    helpText: "Primary renter and driver.",
    validation: { kind: "text", maximumLength: 100 },
    section: "CUSTOMER",
  },
  LAST_NAME: {
    key: "LAST_NAME",
    label: "Last name",
    helpText: "Primary renter and driver.",
    validation: { kind: "text", maximumLength: 100 },
    section: "CUSTOMER",
  },
  EMAIL: {
    key: "EMAIL",
    label: "Email",
    helpText: "Used for booking communication.",
    validation: { kind: "email", maximumLength: 254 },
    section: "CUSTOMER",
  },
  PHONE: {
    key: "PHONE",
    label: "Phone",
    helpText: "Contact number for this rental.",
    validation: { kind: "text", maximumLength: 40 },
    section: "CUSTOMER",
  },
  DATE_OF_BIRTH: {
    key: "DATE_OF_BIRTH",
    label: "Date of birth",
    helpText: "Used to evaluate driver age at pickup.",
    validation: { kind: "date" },
    section: "DRIVER",
  },
  COUNTRY: {
    key: "COUNTRY",
    label: "Country",
    helpText: "Two-letter country code.",
    validation: { kind: "country" },
    section: "CUSTOMER",
  },
  ADDRESS: {
    key: "ADDRESS",
    label: "Address",
    helpText: "Street address.",
    validation: { kind: "text", maximumLength: 200 },
    section: "CUSTOMER",
  },
  CITY: {
    key: "CITY",
    label: "City",
    helpText: "City of residence.",
    validation: { kind: "text", maximumLength: 100 },
    section: "CUSTOMER",
  },
  POSTAL_CODE: {
    key: "POSTAL_CODE",
    label: "Postal code",
    helpText: "Postal or ZIP code.",
    validation: { kind: "text", maximumLength: 20 },
    section: "CUSTOMER",
  },
  NATIONALITY: {
    key: "NATIONALITY",
    label: "Nationality",
    helpText: "Two-letter country code.",
    validation: { kind: "country" },
    section: "CUSTOMER",
  },
  LICENCE_NUMBER: {
    key: "LICENCE_NUMBER",
    label: "Driving licence number",
    helpText: "Stored securely and masked in summaries.",
    validation: { kind: "text", maximumLength: 100 },
    section: "DRIVER",
  },
  LICENCE_ISSUE_DATE: {
    key: "LICENCE_ISSUE_DATE",
    label: "Licence issue date",
    helpText: "Used to evaluate how long the licence has been held.",
    validation: { kind: "date" },
    section: "DRIVER",
  },
  LICENCE_EXPIRY_DATE: {
    key: "LICENCE_EXPIRY_DATE",
    label: "Licence expiry date",
    helpText: "Must cover the configured rental period.",
    validation: { kind: "date" },
    section: "DRIVER",
  },
  LICENCE_ISSUING_COUNTRY: {
    key: "LICENCE_ISSUING_COUNTRY",
    label: "Licence issuing country",
    helpText: "Two-letter issuing-country code.",
    validation: { kind: "country" },
    section: "DRIVER",
  },
}

const systemRequired = new Set<CustomerField>(["FIRST_NAME", "LAST_NAME", "EMAIL"])
export function resolveEffectiveBookingFields(
  configuration?: CustomerDriverRequirementsConfiguration,
): EffectiveBookingField[] {
  if (!configuration) return []
  return CUSTOMER_FIELDS.map((key, displayOrder) => {
    const mode = configuration.fields[key]
    const system = systemRequired.has(key)
    const driver =
      key === "DATE_OF_BIRTH" ||
      (key === "LICENCE_ISSUE_DATE" && configuration.minimumLicenceHeldMonths > 0) ||
      (key === "LICENCE_EXPIRY_DATE" && configuration.licenceMustCoverRentalEnd) ||
      (key === "LICENCE_ISSUING_COUNTRY" && configuration.allowedLicenceCountries.length > 0)
    const required = system || driver || mode === "REQUIRED"
    return {
      ...metadata[key],
      visible: required || mode !== "DISABLED",
      required,
      reason: system
        ? "Required for booking identity and communication."
        : driver
          ? "Required by active driver eligibility rules."
          : mode === "REQUIRED"
            ? "Required by customer-field configuration."
            : undefined,
      displayOrder,
      source: system ? "SYSTEM" : driver ? "DRIVER_RULE" : "CONFIGURATION",
    }
  })
}

const inputKey: Record<CustomerField, keyof BookingCustomerDriverInput> = {
  FIRST_NAME: "firstName",
  LAST_NAME: "lastName",
  EMAIL: "email",
  PHONE: "phone",
  DATE_OF_BIRTH: "dateOfBirth",
  COUNTRY: "country",
  ADDRESS: "address",
  CITY: "city",
  POSTAL_CODE: "postalCode",
  NATIONALITY: "nationality",
  LICENCE_NUMBER: "licenceNumber",
  LICENCE_ISSUE_DATE: "licenceIssueDate",
  LICENCE_EXPIRY_DATE: "licenceExpiryDate",
  LICENCE_ISSUING_COUNTRY: "licenceIssuingCountry",
}

export function normalizeAndValidateBookingFields(
  fields: EffectiveBookingField[],
  submitted: BookingCustomerDriverInput,
) {
  const normalized: BookingCustomerDriverInput = {}
  const issues: Array<{ code: string; field: CustomerField; message: string }> = []
  for (const field of fields) {
    const key = inputKey[field.key]
    const raw = submitted[key]
    if (!field.visible) continue
    const value = typeof raw === "string" ? raw.trim() : undefined
    if (field.required && !value) {
      issues.push({
        code: "BOOKING_FIELD_REQUIRED",
        field: field.key,
        message: `${field.label} is required.`,
      })
      continue
    }
    if (!value) continue
    if (field.validation.maximumLength && value.length > field.validation.maximumLength)
      issues.push({
        code: "BOOKING_FIELD_INVALID",
        field: field.key,
        message: `${field.label} is too long.`,
      })
    if (field.validation.kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      issues.push({
        code: "BOOKING_FIELD_INVALID",
        field: field.key,
        message: "Enter a valid email.",
      })
    if (field.validation.kind === "country" && !/^[A-Za-z]{2}$/.test(value))
      issues.push({
        code: "BOOKING_FIELD_INVALID",
        field: field.key,
        message: `${field.label} must use a two-letter country code.`,
      })
    ;(normalized as Record<string, string>)[key] = field.validation.kind === "country" ? value.toUpperCase() : value
  }
  return { normalized, issues }
}

export function maskLicenceNumber(value: string | null | undefined) {
  if (!value) return "Not provided"
  const last = value.slice(-4)
  return `${"•".repeat(Math.max(4, Math.min(8, value.length - 4)))}${last}`
}
