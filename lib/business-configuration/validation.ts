import type { ZodIssue } from "zod";
import type {
  BusinessConfigurationDomains,
  ConfiguredPaymentMethod,
  ConfigurationForDomain,
} from "./domains";
import { configurationDomainSchemas } from "./schema";
import {
  CONFIGURATION_DOMAIN_IDS,
  configurationValidationResult,
  type ConfigurationDomainId,
  type ConfigurationValidationIssue,
  type ConfigurationValidationResult,
} from "./types";

function fieldPath(issue: ZodIssue) {
  return issue.path.length > 0 ? issue.path.join(".") : undefined;
}

function issueIdentity(issue: ZodIssue) {
  if (issue.code === "custom" && issue.message.includes("|")) {
    const [code, ...messageParts] = issue.message.split("|");
    return { code, message: messageParts.join("|") };
  }
  if (issue.code === "invalid_type" && issue.received === "undefined") {
    return {
      code: "validation.required_value",
      message: "Enter a value for this required field",
    };
  }
  if (issue.code === "too_small" || issue.code === "too_big") {
    return { code: "validation.invalid_range", message: issue.message };
  }
  return { code: "validation.invalid_value", message: issue.message };
}

function blockerFromZod(
  domain: ConfigurationDomainId,
  issue: ZodIssue,
): ConfigurationValidationIssue {
  const identity = issueIdentity(issue);
  return {
    code: identity.code,
    domain,
    field: fieldPath(issue),
    adminMessage: identity.message,
    severity: "BLOCKER",
    remediation: "Correct this value and validate the draft again.",
  };
}

function domainWarnings<Domain extends ConfigurationDomainId>(
  domain: Domain,
  configuration: ConfigurationForDomain<Domain>,
): ConfigurationValidationIssue[] {
  const warnings: ConfigurationValidationIssue[] = [];

  if (domain === "general-rental") {
    const value =
      configuration as BusinessConfigurationDomains["general-rental"];
    if (value.supportedLocales.length === 1) {
      warnings.push({
        code: "general.single_locale",
        domain,
        field: "supportedLocales",
        adminMessage: "Only one customer language is configured.",
        severity: "WARNING",
        remediation:
          "Add another fully translated language if customers need it.",
      });
    }
  }

  if (domain === "pricing-billing") {
    const value =
      configuration as BusinessConfigurationDomains["pricing-billing"];
    if (!value.pricesIncludeTax && value.taxRateBps === 0) {
      warnings.push({
        code: "pricing.zero_tax_excluded",
        domain,
        field: "taxRateBps",
        adminMessage: "Prices exclude tax, but the tax rate is zero.",
        severity: "WARNING",
        remediation:
          "Confirm that no tax should be added or enter the applicable rate.",
      });
    }
  }

  if (domain === "insurance") {
    const value = configuration as BusinessConfigurationDomains["insurance"];
    if (value.enabled && !value.shortDescription) {
      warnings.push({
        code: "insurance.description_missing",
        domain,
        field: "shortDescription",
        adminMessage:
          "Insurance is enabled without a short customer explanation.",
        severity: "WARNING",
        remediation:
          "Add a short explanation before presenting insurance to customers.",
      });
    }
  }

  if (domain === "document-policy") {
    const value =
      configuration as BusinessConfigurationDomains["document-policy"];
    if (value.requirements.length === 0) {
      warnings.push({
        code: "documents.no_requirements",
        domain,
        field: "requirements",
        adminMessage: "No customer document rules are configured.",
        severity: "WARNING",
        remediation:
          "Confirm that customers do not need to provide identity or licence documents.",
      });
    }
  }

  if (domain === "legal-acceptance") {
    const value =
      configuration as BusinessConfigurationDomains["legal-acceptance"];
    for (const [field, document] of [
      ["termsDocument", value.termsDocument],
      ["privacyDocument", value.privacyDocument],
    ] as const) {
      if (document.publicationStatus !== "PUBLISHED") {
        warnings.push({
          code: "legal.document_not_published",
          domain,
          field,
          adminMessage:
            "Archived legal content cannot be selected for a new release.",
          severity: "BLOCKER",
          remediation: "Select a published legal document.",
        });
      }
    }
  }

  return warnings;
}

export function validateConfigurationDomain<
  Domain extends ConfigurationDomainId,
>(domain: Domain, input: unknown): ConfigurationValidationResult {
  const parsed = configurationDomainSchemas[domain].safeParse(input);
  if (!parsed.success) {
    return configurationValidationResult(
      parsed.error.issues.map((issue) => blockerFromZod(domain, issue)),
    );
  }

  return configurationValidationResult(
    domainWarnings(domain, parsed.data as ConfigurationForDomain<Domain>),
  );
}

export interface FleetRateValidationContract {
  vehicleId: string;
  dailyRate?: number;
  weeklyRate?: number;
  monthlyRate?: number;
  weeklyRateEnabled: boolean;
  monthlyRateEnabled: boolean;
}

export interface BusinessConfigurationReleaseValidationContract {
  domains: Partial<BusinessConfigurationDomains>;
  bookableVehicleIds: string[];
  fleetRates: FleetRateValidationContract[];
  implementedPaymentMethods: ConfiguredPaymentMethod[];
}

function workflowRequirement(
  workflow: BusinessConfigurationDomains["booking-workflow"] | undefined,
  step: BusinessConfigurationDomains["booking-workflow"]["steps"][number]["step"],
) {
  return workflow?.steps.find((item) => item.step === step)?.requirement;
}

export function validateBusinessConfigurationRelease(
  contract: BusinessConfigurationReleaseValidationContract,
): ConfigurationValidationResult {
  const issues: ConfigurationValidationIssue[] = [];

  for (const domain of CONFIGURATION_DOMAIN_IDS) {
    const value = contract.domains[domain];
    if (value === undefined) {
      issues.push({
        code: "release.domain_missing",
        domain,
        adminMessage: "This configuration section is missing from the release.",
        severity: "BLOCKER",
        remediation: "Add and validate a version for this section.",
      });
      continue;
    }
    issues.push(...validateConfigurationDomain(domain, value).issues);
  }

  const pricing = contract.domains["pricing-billing"];
  if (pricing) {
    for (const vehicleId of contract.bookableVehicleIds) {
      const rate = contract.fleetRates.find(
        (item) => item.vehicleId === vehicleId,
      );
      if (!rate?.dailyRate || rate.dailyRate <= 0) {
        issues.push({
          code: "rates.daily_missing",
          domain: "pricing-billing",
          field: "dailyRate",
          affectedResource: vehicleId,
          adminMessage: "A bookable vehicle has no positive daily price.",
          severity: "BLOCKER",
          remediation: "Enter a daily price for the vehicle.",
        });
      }
      if (
        pricing.weeklyPricingEnabled &&
        rate?.weeklyRateEnabled &&
        (!rate.weeklyRate || rate.weeklyRate <= 0)
      ) {
        issues.push({
          code: "rates.weekly_missing",
          domain: "pricing-billing",
          field: "weeklyRate",
          affectedResource: vehicleId,
          adminMessage:
            "Weekly pricing is enabled for a vehicle without a weekly price.",
          severity: "BLOCKER",
          remediation:
            "Enter a weekly price or turn off weekly pricing for the vehicle.",
        });
      }
      if (
        pricing.monthlyPricingEnabled &&
        rate?.monthlyRateEnabled &&
        (!rate.monthlyRate || rate.monthlyRate <= 0)
      ) {
        issues.push({
          code: "rates.monthly_missing",
          domain: "pricing-billing",
          field: "monthlyRate",
          affectedResource: vehicleId,
          adminMessage:
            "Monthly pricing is enabled for a vehicle without a monthly price.",
          severity: "BLOCKER",
          remediation:
            "Enter a monthly price or turn off monthly pricing for the vehicle.",
        });
      }
    }
  }

  const workflow = contract.domains["booking-workflow"];
  const documents = contract.domains["document-policy"];
  if (
    documents?.requirements.some(
      ({ requirement }) => requirement === "REQUIRED",
    ) &&
    workflowRequirement(workflow, "DOCUMENTS") === "HIDDEN"
  ) {
    issues.push({
      code: "release.documents_step_hidden",
      domain: "booking-workflow",
      field: "steps.DOCUMENTS",
      adminMessage: "Document upload is hidden while documents are required.",
      severity: "BLOCKER",
      remediation:
        "Show the Documents step or make all document rules optional.",
    });
  }

  const legal = contract.domains["legal-acceptance"];
  if (
    legal &&
    (legal.termsAcceptance === "REQUIRED" ||
      legal.privacyAcknowledgment === "REQUIRED") &&
    workflowRequirement(workflow, "LEGAL_ACCEPTANCE") === "HIDDEN"
  ) {
    issues.push({
      code: "release.legal_step_hidden",
      domain: "booking-workflow",
      field: "steps.LEGAL_ACCEPTANCE",
      adminMessage:
        "Terms and privacy are hidden while customer acknowledgement is required.",
      severity: "BLOCKER",
      remediation: "Show the Terms and privacy step.",
    });
  }

  const insurance = contract.domains.insurance;
  if (
    insurance?.enabled &&
    insurance.selectionMode === "MANDATORY" &&
    workflowRequirement(workflow, "INSURANCE") === "HIDDEN"
  ) {
    issues.push({
      code: "release.insurance_step_hidden",
      domain: "booking-workflow",
      field: "steps.INSURANCE",
      adminMessage: "Insurance is mandatory but its booking step is hidden.",
      severity: "BLOCKER",
      remediation: "Show the Insurance step.",
    });
  }

  const payments = contract.domains.payments;
  if (payments) {
    const unsupported = payments.methods.filter(
      ({ enabled, method }) =>
        enabled && !contract.implementedPaymentMethods.includes(method),
    );
    for (const { method } of unsupported) {
      issues.push({
        code: "release.payment_not_implemented",
        domain: "payments",
        field: "methods",
        affectedResource: method,
        adminMessage:
          "An enabled payment option is not implemented by the application.",
        severity: "BLOCKER",
        remediation:
          "Disable this payment option or complete its technical integration first.",
      });
    }
  }

  const general = contract.domains["general-rental"];
  if (general && legal) {
    for (const locale of general.supportedLocales) {
      if (!legal.termsDocument.availableLocales.includes(locale)) {
        issues.push({
          code: "release.terms_translation_missing",
          domain: "legal-acceptance",
          field: "termsDocument.availableLocales",
          affectedResource: locale,
          adminMessage:
            "Rental terms are missing a supported customer language.",
          severity: "BLOCKER",
          remediation:
            "Publish the missing translation or remove the language from this release.",
        });
      }
      if (!legal.privacyDocument.availableLocales.includes(locale)) {
        issues.push({
          code: "release.privacy_translation_missing",
          domain: "legal-acceptance",
          field: "privacyDocument.availableLocales",
          affectedResource: locale,
          adminMessage:
            "The privacy notice is missing a supported customer language.",
          severity: "BLOCKER",
          remediation:
            "Publish the missing translation or remove the language from this release.",
        });
      }
    }
  }

  return configurationValidationResult(issues);
}
