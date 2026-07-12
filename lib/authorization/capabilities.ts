import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

export const CAPABILITIES = {
  CONFIGURATION_VIEW: "configuration.view",
  CONFIGURATION_EDIT: "configuration.edit",
  CONFIGURATION_VALIDATE: "configuration.validate",
  CONFIGURATION_ACTIVATE: "configuration.activate",
  PRICING_MANAGE: "pricing.manage",
  INSURANCE_MANAGE: "insurance.manage",
  DRIVER_REQUIREMENTS_MANAGE: "driver-requirements.manage",
  CUSTOMER_FIELDS_MANAGE: "customer-fields.manage",
  BOOKING_WORKFLOW_MANAGE: "booking-workflow.manage",
  CUSTOMER_SENSITIVE_DATA_VIEW: "customer-sensitive-data.view",
  LEGAL_EDIT: "legal.edit",
  LEGAL_PUBLISH: "legal.publish",
  DOCUMENTS_VIEW: "documents.view",
  DOCUMENTS_DOWNLOAD: "documents.download",
  DOCUMENTS_DELETE: "documents.delete",
  DOCUMENTS_LEGAL_HOLD_MANAGE: "documents.legal-hold.manage",
  PAYMENTS_MANAGE: "payments.manage",
  CONFIRMATIONS_MANAGE: "confirmations.manage",
  ROLES_MANAGE: "roles.manage",
  SECURITY_AUDIT_VIEW: "security.audit.view",
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export const RESTRICTED_DOCUMENT_CAPABILITIES = new Set<Capability>([
  CAPABILITIES.DOCUMENTS_VIEW,
  CAPABILITIES.DOCUMENTS_DOWNLOAD,
  CAPABILITIES.DOCUMENTS_DELETE,
  CAPABILITIES.DOCUMENTS_LEGAL_HOLD_MANAGE,
]);

export type CapabilityPrincipal =
  | { authenticated: false }
  | {
      authenticated: true;
      userId: string;
      role?: string;
      capabilities: ReadonlySet<Capability>;
    };

export type AuthorizationDenialReason = "UNAUTHENTICATED" | "UNAUTHORIZED";

export type AuthorizationDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: AuthorizationDenialReason;
      missing: Capability[];
    };

function effectiveCapabilities(
  principal: Extract<CapabilityPrincipal, { authenticated: true }>,
) {
  // Compatibility only: this pure contract does not replace requireAdmin() or create role persistence.
  if (principal.role === "ADMIN")
    return new Set<Capability>(
      Object.values(CAPABILITIES).filter(
        (capability) => !RESTRICTED_DOCUMENT_CAPABILITIES.has(capability),
      ),
    );
  return principal.capabilities;
}

function unauthenticated(
  required: readonly Capability[],
): AuthorizationDecision {
  return { allowed: false, reason: "UNAUTHENTICATED", missing: [...required] };
}

export function checkCapability(
  principal: CapabilityPrincipal,
  capability: Capability,
): AuthorizationDecision {
  if (!principal.authenticated) return unauthenticated([capability]);
  if (effectiveCapabilities(principal).has(capability))
    return { allowed: true };
  return { allowed: false, reason: "UNAUTHORIZED", missing: [capability] };
}

export function checkAnyCapability(
  principal: CapabilityPrincipal,
  capabilities: readonly Capability[],
): AuthorizationDecision {
  if (!principal.authenticated) return unauthenticated(capabilities);
  const effective = effectiveCapabilities(principal);
  if (capabilities.some((capability) => effective.has(capability)))
    return { allowed: true };
  return { allowed: false, reason: "UNAUTHORIZED", missing: [...capabilities] };
}

export function checkAllCapabilities(
  principal: CapabilityPrincipal,
  capabilities: readonly Capability[],
): AuthorizationDecision {
  if (!principal.authenticated) return unauthenticated(capabilities);
  const effective = effectiveCapabilities(principal);
  const missing = capabilities.filter(
    (capability) => !effective.has(capability),
  );
  if (missing.length === 0) return { allowed: true };
  return { allowed: false, reason: "UNAUTHORIZED", missing };
}

export function assertAuthorized(
  decision: AuthorizationDecision,
): asserts decision is { allowed: true } {
  if (decision.allowed) return;
  if (decision.reason === "UNAUTHENTICATED") throw new UnauthorizedError();
  throw new ForbiddenError("Missing required capability");
}
