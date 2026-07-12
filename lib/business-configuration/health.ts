import {
  CONFIGURATION_DOMAIN_IDS,
  type ConfigurationDomainId,
  type ConfigurationValidationIssue,
  type ConfigurationValidationResult,
} from "./types";

export const CONFIGURATION_HEALTH_STATUS = {
  READY: "Ready",
  ACTION_REQUIRED: "Action required",
  WARNING: "Warning",
  DRAFT_CHANGES: "Draft changes",
  NOT_CONFIGURED: "Not configured",
} as const;

export type ConfigurationHealthStatus =
  (typeof CONFIGURATION_HEALTH_STATUS)[keyof typeof CONFIGURATION_HEALTH_STATUS];

export interface ConfigurationHealthDomainInput {
  domain: ConfigurationDomainId;
  configured: boolean;
  hasDraftChanges: boolean;
  validation?: ConfigurationValidationResult;
  affectedResource?: string;
  suggestedAction?: string;
  adminRoute?: string;
}

export interface ConfigurationHealthFinding {
  code: string;
  kind: "BLOCKER" | "WARNING" | "INFO";
  domain: ConfigurationDomainId;
  message: string;
  affectedResource?: string;
  suggestedAction?: string;
  adminRoute?: string;
}

export interface ConfigurationDomainHealth {
  domain: ConfigurationDomainId;
  status: ConfigurationHealthStatus;
  blockers: ConfigurationHealthFinding[];
  warnings: ConfigurationHealthFinding[];
  notices: ConfigurationHealthFinding[];
}

export interface ConfigurationHealthReport {
  status: ConfigurationHealthStatus;
  domains: ConfigurationDomainHealth[];
  blockers: ConfigurationHealthFinding[];
  warnings: ConfigurationHealthFinding[];
  notices: ConfigurationHealthFinding[];
}

function findingFromIssue(
  input: ConfigurationHealthDomainInput,
  issue: ConfigurationValidationIssue,
): ConfigurationHealthFinding {
  return {
    code: issue.code,
    kind:
      issue.severity === "BLOCKER"
        ? "BLOCKER"
        : issue.severity === "WARNING"
          ? "WARNING"
          : "INFO",
    domain: issue.domain,
    message: issue.adminMessage,
    affectedResource: issue.affectedResource ?? input.affectedResource,
    suggestedAction: issue.remediation ?? input.suggestedAction,
    adminRoute: input.adminRoute,
  };
}

function statusForDomain(
  input: ConfigurationHealthDomainInput,
  blockers: readonly ConfigurationHealthFinding[],
  warnings: readonly ConfigurationHealthFinding[],
) {
  if (!input.configured) return CONFIGURATION_HEALTH_STATUS.NOT_CONFIGURED;
  if (blockers.length > 0) return CONFIGURATION_HEALTH_STATUS.ACTION_REQUIRED;
  if (input.hasDraftChanges) return CONFIGURATION_HEALTH_STATUS.DRAFT_CHANGES;
  if (warnings.length > 0) return CONFIGURATION_HEALTH_STATUS.WARNING;
  return CONFIGURATION_HEALTH_STATUS.READY;
}

export function evaluateConfigurationHealth(
  inputs: readonly ConfigurationHealthDomainInput[],
): ConfigurationHealthReport {
  const byDomain = new Map(inputs.map((input) => [input.domain, input]));

  const domains = CONFIGURATION_DOMAIN_IDS.map(
    (domain): ConfigurationDomainHealth => {
      const input = byDomain.get(domain) ?? {
        domain,
        configured: false,
        hasDraftChanges: false,
      };
      const findings = (input.validation?.issues ?? []).map((issue) =>
        findingFromIssue(input, issue),
      );

      if (!input.configured) {
        findings.push({
          code: "health.domain_not_configured",
          kind: "BLOCKER",
          domain,
          message:
            "This required configuration section has not been configured.",
          affectedResource: input.affectedResource,
          suggestedAction:
            input.suggestedAction ??
            "Create and validate a draft for this section.",
          adminRoute: input.adminRoute,
        });
      } else if (input.hasDraftChanges) {
        findings.push({
          code: "health.draft_changes",
          kind: "INFO",
          domain,
          message: "This section has draft changes that are not live.",
          affectedResource: input.affectedResource,
          suggestedAction:
            input.suggestedAction ??
            "Review and include the draft in a future release.",
          adminRoute: input.adminRoute,
        });
      }

      const blockers = findings.filter(({ kind }) => kind === "BLOCKER");
      const warnings = findings.filter(({ kind }) => kind === "WARNING");
      const notices = findings.filter(({ kind }) => kind === "INFO");

      return {
        domain,
        status: statusForDomain(input, blockers, warnings),
        blockers,
        warnings,
        notices,
      };
    },
  );

  const blockers = domains.flatMap((domain) => domain.blockers);
  const warnings = domains.flatMap((domain) => domain.warnings);
  const notices = domains.flatMap((domain) => domain.notices);
  const configuredCount = domains.filter(
    ({ status }) => status !== CONFIGURATION_HEALTH_STATUS.NOT_CONFIGURED,
  ).length;
  const hasDraftChanges = domains.some(
    ({ status }) => status === CONFIGURATION_HEALTH_STATUS.DRAFT_CHANGES,
  );

  let status: ConfigurationHealthStatus;
  if (configuredCount === 0)
    status = CONFIGURATION_HEALTH_STATUS.NOT_CONFIGURED;
  else if (blockers.length > 0)
    status = CONFIGURATION_HEALTH_STATUS.ACTION_REQUIRED;
  else if (hasDraftChanges) status = CONFIGURATION_HEALTH_STATUS.DRAFT_CHANGES;
  else if (warnings.length > 0) status = CONFIGURATION_HEALTH_STATUS.WARNING;
  else status = CONFIGURATION_HEALTH_STATUS.READY;

  return { status, domains, blockers, warnings, notices };
}
