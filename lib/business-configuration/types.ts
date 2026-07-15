export const CONFIGURATION_DOMAIN_IDS = [
  "general-rental",
  "pricing-billing",
  "insurance",
  "customer-driver-requirements",
  "booking-workflow",
  "document-policy",
  "payments",
  "confirmations",
  "legal-acceptance",
] as const;

export type ConfigurationDomainId = (typeof CONFIGURATION_DOMAIN_IDS)[number];

export type ConfigurationVersionStatus =
  | "DRAFT"
  | "VALIDATED"
  | "RELEASED"
  | "ARCHIVED";
export type ConfigurationValidationStatus =
  | "NOT_VALIDATED"
  | "VALID"
  | "WARNING"
  | "BLOCKED";
export type ConfigurationPublicationStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ConfigurationReleaseStatus =
  | "DRAFT"
  | "VALIDATED"
  | "ACTIVE"
  | "SUPERSEDED"
  | "ARCHIVED";

export interface ConfigurationAuthorMetadata {
  userId: string;
  displayName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigurationActivationMetadata {
  activatedByUserId: string;
  activatedAt: string;
}

export interface ConfigurationChangeMetadata {
  changeSummary: string;
  sourceVersionId?: string;
}

export interface ConfigurationVersionReference {
  id: string;
  domain: ConfigurationDomainId;
  versionNumber: number;
  status: ConfigurationVersionStatus;
  validationStatus: ConfigurationValidationStatus;
  author: ConfigurationAuthorMetadata;
  change: ConfigurationChangeMetadata;
}

export type ConfigurationDomainVersionReferences = {
  [Domain in ConfigurationDomainId]: ConfigurationVersionReference & {
    domain: Domain;
  };
};

export interface BusinessConfigurationReleaseReference {
  id: string;
  releaseNumber?: number;
  name: string;
  status: ConfigurationReleaseStatus;
  versions: ConfigurationDomainVersionReferences;
  fleetRateSetVersionId: string;
  author: ConfigurationAuthorMetadata;
  change: ConfigurationChangeMetadata;
  activation?: ConfigurationActivationMetadata;
}

export type ValidationSeverity = "INFO" | "WARNING" | "BLOCKER";
export type ValidationOutcome = "VALID" | "WARNING" | "BLOCKED";

export interface ConfigurationValidationIssue {
  code: string;
  domain: ConfigurationDomainId;
  field?: string;
  adminMessage: string;
  severity: ValidationSeverity;
  remediation?: string;
  affectedResource?: string;
}

export interface ConfigurationValidationResult {
  outcome: ValidationOutcome;
  issues: ConfigurationValidationIssue[];
}

export function validationOutcomeFor(
  issues: readonly ConfigurationValidationIssue[],
): ValidationOutcome {
  if (issues.some((issue) => issue.severity === "BLOCKER")) return "BLOCKED";
  if (issues.some((issue) => issue.severity === "WARNING")) return "WARNING";
  return "VALID";
}

export function configurationValidationResult(
  issues: ConfigurationValidationIssue[],
): ConfigurationValidationResult {
  return { outcome: validationOutcomeFor(issues), issues };
}
