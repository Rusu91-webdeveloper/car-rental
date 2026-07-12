import { describe, expect, it } from "vitest"
import {
  maskLicenceNumber,
  normalizeAndValidateBookingFields,
  resolveEffectiveBookingFields,
} from "@/lib/booking-configuration/field-resolver"
import { resolveEffectiveBookingFlow, validateBookingWorkflow } from "@/lib/booking-configuration/workflow"
import { validBusinessConfigurationDomains } from "../../helpers/configuration-fixtures"

describe("effective customer fields and booking workflow", () => {
  it("enforces system and driver dependencies while preserving optional and hidden modes", () => {
    const config = validBusinessConfigurationDomains()["customer-driver-requirements"]
    config.fields.PHONE = "OPTIONAL"
    config.fields.ADDRESS = "DISABLED"
    const fields = resolveEffectiveBookingFields(config)
    expect(fields.find(({ key }) => key === "EMAIL")).toMatchObject({
      visible: true,
      required: true,
      source: "SYSTEM",
    })
    expect(fields.find(({ key }) => key === "DATE_OF_BIRTH")).toMatchObject({
      visible: true,
      required: true,
      source: "DRIVER_RULE",
    })
    expect(fields.find(({ key }) => key === "PHONE")).toMatchObject({
      visible: true,
      required: false,
    })
    expect(fields.find(({ key }) => key === "ADDRESS")).toMatchObject({
      visible: false,
      required: false,
    })
  })

  it("ignores manually submitted hidden fields and normalizes supported values", () => {
    const config = validBusinessConfigurationDomains()["customer-driver-requirements"]
    config.fields.ADDRESS = "DISABLED"
    const result = normalizeAndValidateBookingFields(resolveEffectiveBookingFields(config), {
      firstName: "  Ada ",
      lastName: " Lovelace ",
      email: " ADA@example.com ",
      address: "must-not-persist",
      dateOfBirth: "2000-01-01",
      licenceNumber: "ABC12345",
      licenceIssueDate: "2020-01-01",
      licenceExpiryDate: "2035-01-01",
      licenceIssuingCountry: "de",
    })
    expect(result.issues).toEqual([])
    expect(result.normalized).toMatchObject({
      firstName: "Ada",
      licenceIssuingCountry: "DE",
    })
    expect(result.normalized.address).toBeUndefined()
  })

  it("reports missing effective fields and masks licence values", () => {
    const result = normalizeAndValidateBookingFields(
      resolveEffectiveBookingFields(validBusinessConfigurationDomains()["customer-driver-requirements"]),
      {},
    )
    expect(result.issues[0]).toMatchObject({ code: "BOOKING_FIELD_REQUIRED" })
    expect(maskLicenceNumber("ABCD12345678")).toMatch(/5678$/)
    expect(maskLicenceNumber("ABCD12345678")).not.toContain("ABCD")
  })

  it("accepts the safe minimal flow and blocks future or conflicting steps", () => {
    const domains = validBusinessConfigurationDomains()
    const fields = resolveEffectiveBookingFields(domains["customer-driver-requirements"])
    expect(
      validateBookingWorkflow({
        workflow: domains["booking-workflow"],
        insurance: domains.insurance,
        fields,
      }),
    ).toEqual([])
    domains["booking-workflow"].steps.find(({ step }) => step === "DOCUMENTS")!.requirement = "OPTIONAL"
    domains["booking-workflow"].steps.find(({ step }) => step === "CONFIRMATION")!.requirement = "HIDDEN"
    expect(
      validateBookingWorkflow({
        workflow: domains["booking-workflow"],
        insurance: domains.insurance,
        fields,
      }).map(({ code }) => code),
    ).toEqual(expect.arrayContaining(["DOCUMENT_STEP_NOT_AVAILABLE", "CONFIRMATION_STEP_REQUIRED"]))
  })

  it("requires an insurance step exactly when insurance is enabled", () => {
    const domains = validBusinessConfigurationDomains()
    domains.insurance = {
      ...domains.insurance,
      enabled: true,
      pricePerDay: 1_000,
      showCustomerSelection: true,
    }
    expect(
      validateBookingWorkflow({
        workflow: domains["booking-workflow"],
        insurance: domains.insurance,
        fields: resolveEffectiveBookingFields(domains["customer-driver-requirements"]),
      }).map(({ code }) => code),
    ).toContain("INSURANCE_STEP_REQUIRED")
    const flow = resolveEffectiveBookingFlow(domains["booking-workflow"])
    expect(flow.find(({ step }) => step === "DOCUMENTS")).toMatchObject({
      visible: false,
      available: false,
    })
  })
})
