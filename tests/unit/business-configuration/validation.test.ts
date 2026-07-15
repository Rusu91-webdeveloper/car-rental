import { describe, expect, it } from "vitest";
import {
  validateBusinessConfigurationRelease,
  validateConfigurationDomain,
} from "@/lib/business-configuration/validation";
import { validBusinessConfigurationDomains } from "../../helpers/configuration-fixtures";

describe("configuration validation contracts", () => {
  it("accepts a valid domain", () => {
    const domains = validBusinessConfigurationDomains();
    expect(
      validateConfigurationDomain("general-rental", domains["general-rental"]),
    ).toEqual({
      outcome: "VALID",
      issues: [],
    });
  });

  it("reports a missing required value with a stable code", () => {
    const result = validateConfigurationDomain("general-rental", {
      businessTimeZone: "Europe/Berlin",
      supportedLocales: ["de"],
    });
    expect(result.outcome).toBe("BLOCKED");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "validation.required_value",
          field: "currency",
        }),
      ]),
    );
  });

  it("reports an invalid numeric range", () => {
    const pricing = validBusinessConfigurationDomains()["pricing-billing"];
    const result = validateConfigurationDomain("pricing-billing", {
      ...pricing,
      gracePeriodMinutes: 721,
    });
    expect(result.issues[0]).toMatchObject({
      code: "validation.invalid_range",
      field: "gracePeriodMinutes",
      severity: "BLOCKER",
    });
  });

  it("reports incompatible fields", () => {
    const insurance = validBusinessConfigurationDomains().insurance;
    const result = validateConfigurationDomain("insurance", {
      ...insurance,
      enabled: true,
      pricePerDay: 0,
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "insurance.price_required" }),
      ]),
    );
  });

  it("returns a warning-only result", () => {
    const pricing = validBusinessConfigurationDomains()["pricing-billing"];
    const result = validateConfigurationDomain("pricing-billing", {
      ...pricing,
      pricesIncludeTax: false,
      taxRateBps: 0,
    });
    expect(result.outcome).toBe("WARNING");
    expect(result.issues[0]).toMatchObject({
      code: "pricing.zero_tax_excluded",
      severity: "WARNING",
    });
  });

  it("returns a blocked result", () => {
    const payments = validBusinessConfigurationDomains().payments;
    const result = validateConfigurationDomain("payments", {
      ...payments,
      methods: [{ method: "BANK_TRANSFER", enabled: false }],
    });
    expect(result.outcome).toBe("BLOCKED");
    expect(result.issues.map(({ code }) => code)).toContain(
      "payments.method_required",
    );
  });

  it("preserves multiple validation errors", () => {
    const insurance = validBusinessConfigurationDomains().insurance;
    const result = validateConfigurationDomain("insurance", {
      ...insurance,
      enabled: true,
      customerFacingName: "",
      pricePerDay: 0,
      availabilityScope: "SELECTED_VEHICLES",
      vehicleIds: [],
    });
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "validation.invalid_range",
        "insurance.price_required",
        "insurance.vehicle_required",
      ]),
    );
  });

  it("keeps machine-readable codes stable across runs", () => {
    const input = {
      businessTimeZone: "invalid",
      currency: "eur",
      supportedLocales: [],
    };
    const first = validateConfigurationDomain(
      "general-rental",
      input,
    ).issues.map(({ code }) => code);
    const second = validateConfigurationDomain(
      "general-rental",
      input,
    ).issues.map(({ code }) => code);
    expect(second).toEqual(first);
  });

  it("blocks incompatible release domains", () => {
    const domains = validBusinessConfigurationDomains();
    domains["document-policy"].requirements[0].requirement = "REQUIRED";
    const documentsStep = domains["booking-workflow"].steps.find(
      ({ step }) => step === "DOCUMENTS",
    )!;
    documentsStep.requirement = "HIDDEN";

    const result = validateBusinessConfigurationRelease({
      domains,
      bookableVehicleIds: ["vehicle-1"],
      fleetRates: [
        {
          vehicleId: "vehicle-1",
          dailyRate: 10_000,
          weeklyRateEnabled: false,
          monthlyRateEnabled: false,
        },
      ],
      implementedPaymentMethods: ["BANK_TRANSFER", "CASH_ON_PICKUP"],
    });

    expect(result.outcome).toBe("BLOCKED");
    expect(result.issues.map(({ code }) => code)).toContain(
      "release.documents_step_hidden",
    );
  });
});
