import { Prisma, type PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/db"
import { CAPABILITIES } from "@/lib/authorization/capabilities"
import { configurationValidationResult, type ConfigurationValidationIssue } from "@/lib/business-configuration/types"
import { validateConfigurationDomain } from "@/lib/business-configuration/validation"
import type {
  BookingWorkflowConfiguration,
  CustomerDriverRequirementsConfiguration,
  InsuranceConfiguration,
} from "@/lib/business-configuration/domains"
import { ConfigurationWorkflowError } from "@/lib/business-configuration/workflow-errors"
import { parseAdminMoneyInput } from "@/lib/pricing-admin/money-input"
import { resolveEffectiveBookingFields } from "@/lib/booking-configuration/field-resolver"
import { validateBookingWorkflow } from "@/lib/booking-configuration/workflow"
import { PrismaPhase6AdminRepository } from "./prisma-repository"
import type { Phase6AdminPageData } from "./types"
import { calculatePricing } from "@/lib/pricing/engine"
import { money } from "@/lib/pricing/money"
import type { ConfigurationDbClient } from "@/lib/business-configuration/prisma-repository"

async function mutation<T>(operation: Promise<T>) {
  try {
    return await operation
  } catch (error) {
    if (error instanceof ConfigurationWorkflowError) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code))
      throw new ConfigurationWorkflowError(
        "OPTIMISTIC_LOCK_FAILED",
        "The draft changed while you were working.",
        "CONFLICT",
      )
    throw error
  }
}

function phase6Issues(page: Phase6AdminPageData) {
  const issues: ConfigurationValidationIssue[] = []
  if (page.draftInsurance) {
    issues.push(...validateConfigurationDomain("insurance", page.draftInsurance.configuration).issues)
    if (
      page.draftInsurance.configuration.enabled &&
      page.draftInsurance.configuration.availabilityScope === "SELECTED_VEHICLES"
    ) {
      const eligibleVehicleIds = page.draftInsurance.configuration.vehicleIds
      for (const vehicle of page.vehicles.filter(
        ({ activeForBooking, id }) => activeForBooking && !eligibleVehicleIds.includes(id),
      ))
        issues.push({
          code: "insurance.active_vehicle_unavailable",
          domain: "insurance",
          severity: "WARNING",
          affectedResource: vehicle.name,
          adminMessage: "Insurance is unavailable for an active vehicle.",
          remediation: "Confirm the vehicle exclusion before activation.",
        })
    }
  } else
    issues.push({
      code: "insurance.draft_missing",
      domain: "insurance",
      severity: "BLOCKER",
      adminMessage: "Create an insurance draft.",
      remediation: "Create and validate the insurance configuration.",
    })
  if (page.draftCustomerDriver)
    issues.push(
      ...validateConfigurationDomain("customer-driver-requirements", page.draftCustomerDriver.configuration).issues,
    )
  else
    issues.push({
      code: "driver.draft_missing",
      domain: "customer-driver-requirements",
      severity: "BLOCKER",
      adminMessage: "Create a customer and driver requirements draft.",
      remediation: "Create and validate the requirements.",
    })
  if (page.draftWorkflow && page.draftInsurance && page.draftCustomerDriver)
    issues.push(
      ...validateBookingWorkflow({
        workflow: page.draftWorkflow.configuration,
        insurance: page.draftInsurance.configuration,
        fields: resolveEffectiveBookingFields(page.draftCustomerDriver.configuration),
      }),
    )
  else if (!page.draftWorkflow)
    issues.push({
      code: "workflow.draft_missing",
      domain: "booking-workflow",
      severity: "BLOCKER",
      adminMessage: "Create a booking-flow draft.",
      remediation: "Create and validate the workflow.",
    })
  return issues
}

export async function loadPhase6ConfigurationPage(db: ConfigurationDbClient = prisma) {
  const page = await new PrismaPhase6AdminRepository(db).loadPageData()
  page.issues = phase6Issues(page)
  const insurance = page.draftInsurance?.configuration ?? page.liveInsurance?.configuration
  if (insurance?.enabled) {
    const request = {
      vehicleId: "phase6-preview",
      pickupAt: new Date("2030-01-01T10:00:00.000Z"),
      returnAt: new Date("2030-01-04T10:00:00.000Z"),
      businessTimeZone: "UTC",
      rates: {
        daily: money(10_000, page.currency),
        weeklyEnabled: false,
        monthlyEnabled: false,
      },
      strategy: "DAILY_ONLY" as const,
      persistentStrategy: "DAILY_ONLY" as const,
      monthDefinition: "FIXED_30_DAYS" as const,
      billableDayMethod: "STARTED_24_HOUR_PERIODS" as const,
      minimumRentalMinutes: 1,
      minimumChargeDays: 1,
      gracePeriodMinutes: 0,
      taxTreatment: "TAX_INCLUDED" as const,
      taxRateBps: 0,
      source: {
        vehicleId: "phase6-preview",
        rateSourceType: "FLEET_RATE_SET" as const,
        rateSourceReference: "phase6-preview",
      },
      compatibilityMode: "ACTIVE_RELEASE" as const,
      calculatedAt: new Date("2030-01-01T00:00:00.000Z"),
    }
    const unselected = calculatePricing(request)
    const insuranceSubtotal = insurance.pricePerDay * unselected.chargeableDuration.chargeableDays
    const selected = calculatePricing({
      ...request,
      insuranceSubtotal: money(insuranceSubtotal, page.currency),
      insuranceTaxTreatment: insurance.taxTreatment,
    })
    page.insuranceQuoteExample = {
      billableDays: selected.chargeableDuration.chargeableDays,
      unselectedGrandTotal: unselected.grandTotal,
      selectedGrandTotal: selected.grandTotal,
      insuranceSubtotal,
    }
  }
  return page
}

export async function createPhase6Draft(input: {
  actorId: string
  domain: "INSURANCE" | "CUSTOMER_DRIVER_REQUIREMENTS" | "BOOKING_WORKFLOW"
  source: "LIVE" | "DEFAULT"
  changeSummary: string
  db?: PrismaClient
}) {
  return mutation(
    new PrismaPhase6AdminRepository(input.db ?? prisma).createDraft({
      ...input,
      client: input.db ?? prisma,
    }),
  )
}

export async function updateInsuranceDraft(input: {
  actorId: string
  versionId: string
  expectedRevision: number
  configuration: Omit<InsuranceConfiguration, "pricePerDay"> & {
    pricePerDay: string
  }
  changeSummary: string
  db?: PrismaClient
}) {
  const pricePerDay = parseAdminMoneyInput(input.configuration.pricePerDay)
  if (pricePerDay === undefined)
    throw new ConfigurationWorkflowError("RELEASE_INVALID", "Insurance price is required.", "VALIDATION")
  return mutation(
    new PrismaPhase6AdminRepository(input.db ?? prisma).updateInsurance({
      ...input,
      configuration: { ...input.configuration, pricePerDay },
      client: input.db ?? prisma,
    }),
  )
}

export async function updateDriverRequirementsDraft(input: {
  actorId: string
  versionId: string
  expectedRevision: number
  configuration: CustomerDriverRequirementsConfiguration
  changeSummary: string
  db?: PrismaClient
}) {
  return mutation(
    new PrismaPhase6AdminRepository(input.db ?? prisma).updateCustomerDriver({
      ...input,
      capability: CAPABILITIES.DRIVER_REQUIREMENTS_MANAGE,
      action: "driver.requirements_changed",
      client: input.db ?? prisma,
    }),
  )
}

export async function updateCustomerFieldDraft(input: {
  actorId: string
  versionId: string
  expectedRevision: number
  configuration: CustomerDriverRequirementsConfiguration
  changeSummary: string
  db?: PrismaClient
}) {
  return mutation(
    new PrismaPhase6AdminRepository(input.db ?? prisma).updateCustomerDriver({
      ...input,
      capability: CAPABILITIES.CUSTOMER_FIELDS_MANAGE,
      action: "customer_fields.modes_changed",
      client: input.db ?? prisma,
    }),
  )
}

export async function updateBookingWorkflowDraft(input: {
  actorId: string
  versionId: string
  expectedRevision: number
  configuration: BookingWorkflowConfiguration
  changeSummary: string
  db?: PrismaClient
}) {
  return mutation(
    new PrismaPhase6AdminRepository(input.db ?? prisma).updateWorkflow({
      ...input,
      client: input.db ?? prisma,
    }),
  )
}

export async function validatePhase6Drafts(input: { actorId: string; db?: PrismaClient }) {
  const db = input.db ?? prisma
  const page = await loadPhase6ConfigurationPage(db)
  if (!page.draftInsurance || !page.draftCustomerDriver || !page.draftWorkflow)
    throw new ConfigurationWorkflowError("RELEASE_INCOMPLETE", "All Phase 6 drafts are required.", "VALIDATION")
  const issues = phase6Issues(page)
  const domains = [
    { version: page.draftInsurance, domain: "insurance" },
    {
      version: page.draftCustomerDriver,
      domain: "customer-driver-requirements",
    },
    { version: page.draftWorkflow, domain: "booking-workflow" },
  ] as const
  await mutation(
    new PrismaPhase6AdminRepository(db).persistValidation({
      actorId: input.actorId,
      versions: domains.map(({ version, domain }) => {
        const result = configurationValidationResult(issues.filter((issue) => issue.domain === domain))
        return {
          id: version.id,
          revision: version.revision,
          outcome: result.outcome,
          issues: {
            outcome: result.outcome,
            issues: result.issues.map(({ code, severity, field, affectedResource, adminMessage }) => ({
              code,
              severity,
              field,
              affectedResource,
              message: adminMessage,
            })),
          } as Prisma.InputJsonValue,
        }
      }),
      client: db,
    }),
  )
  return configurationValidationResult(issues)
}

export async function attachPhase6DraftsToRelease(input: {
  actorId: string
  expectedReleaseRevision?: number
  db?: PrismaClient
}) {
  return mutation(
    new PrismaPhase6AdminRepository(input.db ?? prisma).attachDrafts({
      ...input,
      client: input.db ?? prisma,
    }),
  )
}

export async function discardPhase6Draft(input: {
  actorId: string
  domain: "INSURANCE" | "CUSTOMER_DRIVER_REQUIREMENTS" | "BOOKING_WORKFLOW"
  versionId: string
  expectedRevision: number
  db?: PrismaClient
}) {
  return mutation(
    new PrismaPhase6AdminRepository(input.db ?? prisma).discardDraft({
      ...input,
      client: input.db ?? prisma,
    }),
  )
}
