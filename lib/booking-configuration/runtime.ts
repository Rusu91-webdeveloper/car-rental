import { PricingError } from "@/lib/pricing/errors"
import { money } from "@/lib/pricing/money"
import type { PublicBookingConfiguration } from "./types"
import { resolveEffectiveBookingFields } from "./field-resolver"
import { resolveEffectiveBookingFlow, validateBookingWorkflow } from "./workflow"
import { PrismaBookingConfigurationRepository, type ActivePhase6Record } from "./prisma-repository"
import type { ConfigurationDbClient } from "@/lib/business-configuration/prisma-repository"

function valid(value: string) {
  return value === "VALID" || value === "WARNING"
}

export function assertActivePhase6Configuration(record: ActivePhase6Record) {
  if (
    !valid(record.releaseValidationStatus) ||
    [record.insuranceVersionStatus, record.customerDriverVersionStatus, record.workflowVersionStatus].some(
      (status) => status !== "RELEASED",
    ) ||
    [record.insuranceValidationStatus, record.customerDriverValidationStatus, record.workflowValidationStatus].some(
      (status) => !valid(status),
    )
  )
    throw new PricingError(
      "ACTIVE_CONFIGURATION_INVALID",
      "Active booking configuration lifecycle is invalid.",
      "OPERATIONAL",
    )
  const fields = resolveEffectiveBookingFields(record.customerDriver)
  const workflowIssues = validateBookingWorkflow({
    workflow: record.workflow,
    insurance: record.insurance,
    fields,
  })
  if (workflowIssues.some(({ severity }) => severity === "BLOCKER"))
    throw new PricingError("ACTIVE_CONFIGURATION_INVALID", "Active booking workflow is invalid.", "OPERATIONAL")
  if (record.insurance.enabled && record.insurance.pricePerDay <= 0)
    throw new PricingError("ACTIVE_CONFIGURATION_INVALID", "Active insurance price is invalid.", "OPERATIONAL")
  money(record.insurance.pricePerDay, record.currency)
}

export async function resolvePublicBookingConfiguration(input: {
  db: ConfigurationDbClient
  vehicleId: string
  locale: string
}): Promise<PublicBookingConfiguration> {
  const record = await new PrismaBookingConfigurationRepository(input.db).findActiveConfiguration(
    input.vehicleId,
    input.locale,
  )
  if (!record) return { mode: "LEGACY", businessTimeZone: "UTC", fields: [], steps: [] }
  assertActivePhase6Configuration(record)
  const availableForVehicle =
    record.insurance.availabilityScope === "ALL_VEHICLES" || record.insurance.vehicleIds.includes(input.vehicleId)
  return {
    mode: "ACTIVE_RELEASE",
    releaseId: record.releaseId,
    releaseNumber: record.releaseNumber,
    customerDriverConfigVersionId: record.customerDriverVersionId,
    bookingWorkflowConfigVersionId: record.workflowVersionId,
    businessTimeZone: record.businessTimeZone,
    fields: resolveEffectiveBookingFields(record.customerDriver),
    steps: resolveEffectiveBookingFlow(record.workflow),
    insurance: {
      configurationVersionId: record.insuranceVersionId,
      enabled: record.insurance.enabled,
      requirementMode: record.insurance.enabled ? record.insurance.selectionMode : "DISABLED",
      customerFacingName: record.insurance.customerFacingName,
      description: record.insurance.shortDescription,
      pricePerDay: record.insurance.pricePerDay,
      currency: record.currency,
      taxTreatment: record.insurance.taxTreatment,
      availabilityScope: record.insurance.availabilityScope,
      availabilityVehicleId:
        record.insurance.availabilityScope === "SELECTED_VEHICLES" && availableForVehicle ? input.vehicleId : undefined,
      availableForVehicle,
      showInConfirmation: record.insurance.showInConfirmation,
      showCustomerSelection: record.insurance.showCustomerSelection,
      preselectedByDefault: record.insurance.preselectedByDefault,
    },
  }
}
