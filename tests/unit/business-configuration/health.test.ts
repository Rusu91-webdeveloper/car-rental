import { describe, expect, it } from "vitest";
import {
  CONFIGURATION_HEALTH_STATUS,
  evaluateConfigurationHealth,
  type ConfigurationHealthDomainInput,
} from "@/lib/business-configuration/health";
import {
  CONFIGURATION_DOMAIN_IDS,
  configurationValidationResult,
} from "@/lib/business-configuration/types";

function readyInputs(): ConfigurationHealthDomainInput[] {
  return CONFIGURATION_DOMAIN_IDS.map((domain) => ({
    domain,
    configured: true,
    hasDraftChanges: false,
    validation: configurationValidationResult([]),
  }));
}

describe("configuration health", () => {
  it("marks a fully valid configuration ready", () => {
    expect(evaluateConfigurationHealth(readyInputs()).status).toBe(
      CONFIGURATION_HEALTH_STATUS.READY,
    );
  });

  it("reports a missing required domain", () => {
    const inputs = readyInputs().filter(({ domain }) => domain !== "payments");
    const report = evaluateConfigurationHealth(inputs);
    expect(report.status).toBe(CONFIGURATION_HEALTH_STATUS.ACTION_REQUIRED);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "health.domain_not_configured",
          domain: "payments",
        }),
      ]),
    );
  });

  it("reports a warning without a blocker", () => {
    const inputs = readyInputs();
    inputs[0].validation = configurationValidationResult([
      {
        code: "general.single_locale",
        domain: "general-rental",
        adminMessage: "Only one language is configured.",
        severity: "WARNING",
      },
    ]);
    const report = evaluateConfigurationHealth(inputs);
    expect(report.status).toBe(CONFIGURATION_HEALTH_STATUS.WARNING);
    expect(report.blockers).toHaveLength(0);
    expect(report.warnings).toHaveLength(1);
  });

  it("reports a blocked release", () => {
    const inputs = readyInputs();
    inputs[1].validation = configurationValidationResult([
      {
        code: "rates.daily_missing",
        domain: "pricing-billing",
        adminMessage: "A vehicle has no daily price.",
        severity: "BLOCKER",
      },
    ]);
    expect(evaluateConfigurationHealth(inputs).status).toBe(
      CONFIGURATION_HEALTH_STATUS.ACTION_REQUIRED,
    );
  });

  it("reports draft changes when the live configuration is otherwise healthy", () => {
    const inputs = readyInputs();
    inputs[2].hasDraftChanges = true;
    const report = evaluateConfigurationHealth(inputs);
    expect(report.status).toBe(CONFIGURATION_HEALTH_STATUS.DRAFT_CHANGES);
    expect(report.notices[0]).toMatchObject({ code: "health.draft_changes" });
  });

  it("collects multiple domain issues", () => {
    const inputs = readyInputs();
    inputs[1].validation = configurationValidationResult([
      {
        code: "rates.daily_missing",
        domain: "pricing-billing",
        adminMessage: "Missing rate.",
        severity: "BLOCKER",
      },
    ]);
    inputs[2].validation = configurationValidationResult([
      {
        code: "insurance.description_missing",
        domain: "insurance",
        adminMessage: "Missing description.",
        severity: "WARNING",
      },
    ]);
    const report = evaluateConfigurationHealth(inputs);
    expect(report.blockers).toHaveLength(1);
    expect(report.warnings).toHaveLength(1);
    expect(
      report.domains.filter(
        ({ blockers, warnings }) => blockers.length + warnings.length > 0,
      ),
    ).toHaveLength(2);
  });
});
