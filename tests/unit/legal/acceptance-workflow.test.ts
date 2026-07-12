import { describe, expect, it } from "vitest"
import { validateBookingWorkflow } from "@/lib/booking-configuration/workflow"
import { validateLegalAcceptanceConfiguration } from "@/lib/legal/service"
import { validBusinessConfigurationDomains } from "@/tests/helpers/configuration-fixtures"

describe("legal acceptance release and workflow validation", () => {
  it("preserves the prior checkout when enforcement is disabled", () => {
    const domains = validBusinessConfigurationDomains()
    const issues = validateBookingWorkflow({
      workflow: domains["booking-workflow"],
      insurance: domains.insurance,
      legal: domains["legal-acceptance"],
      fields: [],
    })
    expect(issues.find(({ code }) => code === "LEGAL_WORKFLOW_CONFLICT")).toBeUndefined()
  })

  it("requires a visible required legal step for required acknowledgements", () => {
    const domains = validBusinessConfigurationDomains()
    const legal = {
      ...domains["legal-acceptance"],
      bookingEnforcementEnabled: true,
      requiredLocales: ["de", "en"],
      translations: [
        { locale: "de", termsCheckboxLabel: "Mietbedingungen anerkennen", termsLinkLabel: "Mietbedingungen", privacyCheckboxLabel: "Datenschutzhinweis gelesen", privacyLinkLabel: "Datenschutzhinweis" },
        { locale: "en", termsCheckboxLabel: "Acknowledge terms", termsLinkLabel: "Rental Terms", privacyCheckboxLabel: "Privacy notice read", privacyLinkLabel: "Privacy Notice" },
      ],
    }
    const issues = validateBookingWorkflow({
      workflow: domains["booking-workflow"],
      insurance: domains.insurance,
      legal,
      fields: [],
    })
    expect(issues.map(({ code }) => code)).toEqual(expect.arrayContaining(["LEGAL_WORKFLOW_CONFLICT", "LEGAL_STEP_REQUIRED"]))
  })

  it("validates exact publications, labels, and required locales", () => {
    const domains = validBusinessConfigurationDomains()
    const result = validateLegalAcceptanceConfiguration(
      {
        ...domains["legal-acceptance"],
        bookingEnforcementEnabled: true,
        requiredLocales: ["de", "en"],
        translations: [
          { locale: "de", termsLinkLabel: "Mietbedingungen", privacyLinkLabel: "Datenschutzhinweis" },
        ],
      },
      ["de", "en"],
    )
    expect(result.outcome).toBe("BLOCKED")
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining(["LEGAL_TRANSLATION_MISSING"]))
  })

  it("allows display-only policies without checkbox labels", () => {
    const domains = validBusinessConfigurationDomains()
    const result = validateLegalAcceptanceConfiguration(
      {
        ...domains["legal-acceptance"],
        bookingEnforcementEnabled: true,
        requiredLocales: ["en"],
        termsAcceptance: "DISPLAY_ONLY",
        privacyAcknowledgment: "DISABLED",
        translations: [{ locale: "en", termsLinkLabel: "Rental Terms", privacyLinkLabel: "Privacy Notice" }],
      },
      ["en"],
    )
    expect(result.outcome).toBe("VALID")
  })
})
