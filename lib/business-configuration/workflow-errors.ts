export const CONFIGURATION_WORKFLOW_ERROR_CODES = [
  "CONFIGURATION_NOT_FOUND",
  "RELEASE_NOT_FOUND",
  "RELEASE_INCOMPLETE",
  "RELEASE_INVALID",
  "RELEASE_STALE",
  "RELEASE_ALREADY_ACTIVE",
  "ACTIVATION_CONFLICT",
  "CAPABILITY_REQUIRED",
  "DOMAIN_VERSION_MISSING",
  "FLEET_RATE_SET_INCOMPLETE",
  "LEGAL_PUBLICATION_MISSING",
  "OPTIMISTIC_LOCK_FAILED",
  "AUDIT_WRITE_FAILED",
  "LEGAL_VERSION_CONFLICT",
  "LEGAL_PUBLICATION_NOT_FOUND",
  "LEGAL_ALREADY_PUBLISHED",
  "LEGAL_ACCEPTANCE_CONFIG_MISSING",
  "LEGAL_PUBLICATION_IN_USE",
] as const

export type ConfigurationWorkflowErrorCode = (typeof CONFIGURATION_WORKFLOW_ERROR_CODES)[number]
export type ConfigurationWorkflowErrorKind = "VALIDATION" | "AUTHORIZATION" | "CONFLICT" | "OPERATIONAL"

export class ConfigurationWorkflowError extends Error {
  constructor(
    readonly code: ConfigurationWorkflowErrorCode,
    message: string,
    readonly kind: ConfigurationWorkflowErrorKind,
  ) {
    super(message)
    this.name = "ConfigurationWorkflowError"
  }
}

export function publicConfigurationWorkflowMessage(error: ConfigurationWorkflowError): string {
  switch (error.code) {
    case "CAPABILITY_REQUIRED":
      return "You do not have permission to perform this configuration action."
    case "RELEASE_NOT_FOUND":
    case "CONFIGURATION_NOT_FOUND":
      return "This configuration draft could not be found."
    case "RELEASE_INCOMPLETE":
    case "DOMAIN_VERSION_MISSING":
    case "FLEET_RATE_SET_INCOMPLETE":
    case "LEGAL_PUBLICATION_MISSING":
      return "This draft is missing required settings and cannot be activated yet."
    case "RELEASE_INVALID":
      return "Resolve the blocking issues before activating this draft."
    case "RELEASE_STALE":
      return "This draft is based on older settings. Refresh it before activation."
    case "RELEASE_ALREADY_ACTIVE":
      return "This release is already active."
    case "ACTIVATION_CONFLICT":
    case "OPTIMISTIC_LOCK_FAILED":
      return "The draft changed while you were working. Refresh and review it again."
    case "AUDIT_WRITE_FAILED":
      return "The action was not completed because its audit record could not be saved."
    case "LEGAL_VERSION_CONFLICT":
      return "The legal draft changed while you were working. Refresh and review it again."
    case "LEGAL_PUBLICATION_NOT_FOUND":
      return "This legal publication could not be found."
    case "LEGAL_ALREADY_PUBLISHED":
      return "This legal version has already been published and is immutable."
    case "LEGAL_ACCEPTANCE_CONFIG_MISSING":
      return "Create the legal acceptance policy before continuing."
    case "LEGAL_PUBLICATION_IN_USE":
      return "This publication is used by the active release and cannot be archived."
  }
}
