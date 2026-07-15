import type { Prisma, PrismaClient, User } from "@prisma/client"
import { getCurrentUser, requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { ConfigurationWorkflowError } from "@/lib/business-configuration/workflow-errors"
import {
  CAPABILITIES,
  checkAllCapabilities,
  checkAnyCapability,
  checkCapability,
  type Capability,
  type CapabilityPrincipal,
} from "./capabilities"
import { PrismaCapabilityRepository } from "./capability-repository"

type DbClient = PrismaClient | Prisma.TransactionClient

export async function capabilityPrincipalForUser(user: Pick<User, "id" | "role">, db: DbClient = prisma) {
  const capabilities = await new PrismaCapabilityRepository(db).findCapabilitiesForUser(user.id)
  return {
    authenticated: true,
    userId: user.id,
    role: user.role,
    capabilities,
  } satisfies CapabilityPrincipal
}

export async function getCapabilityPrincipal(db: DbClient = prisma): Promise<CapabilityPrincipal> {
  const user = await getCurrentUser()
  if (!user) return { authenticated: false }
  return capabilityPrincipalForUser(user, db)
}

async function deniedAudit(userId: string, required: readonly Capability[], action: string, db: DbClient) {
  await db.auditEvent.create({
    data: {
      actorUserId: userId,
      category: "AUTHORIZATION",
      action,
      targetType: "BusinessConfiguration",
      targetId: "business-configuration",
      metadata: { requiredCapabilities: [...required] },
    },
  })
}

async function requireDecision(
  required: readonly Capability[],
  decision: ReturnType<typeof checkCapability>,
  db: DbClient,
  auditDenied: boolean,
) {
  if (decision.allowed) return requireAuth()
  const user = await getCurrentUser()
  if (user && auditDenied) {
    await deniedAudit(user.id, required, "configuration.authorization_denied", db).catch(() => undefined)
  }
  throw new ConfigurationWorkflowError(
    "CAPABILITY_REQUIRED",
    "Missing required Business Configuration capability.",
    "AUTHORIZATION",
  )
}

export async function requireCapability(capability: Capability, options?: { db?: DbClient; auditDenied?: boolean }) {
  const db = options?.db ?? prisma
  const principal = await getCapabilityPrincipal(db)
  return requireDecision([capability], checkCapability(principal, capability), db, options?.auditDenied ?? false)
}

export async function requireAnyCapability(capabilities: readonly Capability[], options?: { db?: DbClient; auditDenied?: boolean }) {
  const db = options?.db ?? prisma
  const principal = await getCapabilityPrincipal(db)
  return requireDecision(capabilities, checkAnyCapability(principal, capabilities), db, options?.auditDenied ?? false)
}

export async function requireAllCapabilities(capabilities: readonly Capability[], options?: { db?: DbClient; auditDenied?: boolean }) {
  const db = options?.db ?? prisma
  const principal = await getCapabilityPrincipal(db)
  return requireDecision(capabilities, checkAllCapabilities(principal, capabilities), db, options?.auditDenied ?? false)
}

export async function getBusinessConfigurationCapabilities() {
  const principal = await getCapabilityPrincipal()
  const allowed = (capability: Capability) => checkCapability(principal, capability).allowed
  return {
    principal,
    canView: allowed(CAPABILITIES.CONFIGURATION_VIEW),
    canEdit: allowed(CAPABILITIES.CONFIGURATION_EDIT),
    canValidate: allowed(CAPABILITIES.CONFIGURATION_VALIDATE),
    canActivate: allowed(CAPABILITIES.CONFIGURATION_ACTIVATE),
    canManagePricing: allowed(CAPABILITIES.PRICING_MANAGE),
    canManageInsurance: allowed(CAPABILITIES.INSURANCE_MANAGE),
    canManageDriverRequirements: allowed(CAPABILITIES.DRIVER_REQUIREMENTS_MANAGE),
    canManageCustomerFields: allowed(CAPABILITIES.CUSTOMER_FIELDS_MANAGE),
    canManageBookingWorkflow: allowed(CAPABILITIES.BOOKING_WORKFLOW_MANAGE),
    canManagePayments: allowed(CAPABILITIES.PAYMENTS_MANAGE),
    canManageConfirmations: allowed(CAPABILITIES.CONFIRMATIONS_MANAGE),
    canViewSensitiveCustomerData: allowed(CAPABILITIES.CUSTOMER_SENSITIVE_DATA_VIEW),
    canEditLegal: allowed(CAPABILITIES.LEGAL_EDIT),
    canPublishLegal: allowed(CAPABILITIES.LEGAL_PUBLISH),
    canViewDocuments: allowed(CAPABILITIES.DOCUMENTS_VIEW),
    canViewAudit: allowed(CAPABILITIES.SECURITY_AUDIT_VIEW),
  }
}
