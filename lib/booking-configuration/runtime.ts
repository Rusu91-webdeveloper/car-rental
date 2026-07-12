import { PricingError } from "@/lib/pricing/errors"
import { money } from "@/lib/pricing/money"
import type { PublicBookingConfiguration } from "./types"
import { resolveEffectiveBookingFields } from "./field-resolver"
import { resolveEffectiveBookingFlow, validateBookingWorkflow } from "./workflow"
import { PrismaBookingConfigurationRepository, type ActivePhase6Record } from "./prisma-repository"
import type { ConfigurationDbClient } from "@/lib/business-configuration/prisma-repository"
import { legalContentHash, renderLegalPlainText } from "@/lib/legal/content"
import type { BookingLegalDocumentRequirement, BookingLegalRequirements } from "@/lib/legal/types"

function valid(value: string) {
  return value === "VALID" || value === "WARNING"
}

export function assertActivePhase6Configuration(record: ActivePhase6Record) {
  if (
    !valid(record.releaseValidationStatus) ||
    [record.insuranceVersionStatus, record.customerDriverVersionStatus, record.workflowVersionStatus, record.legalVersionStatus].some(
      (status) => status !== "RELEASED",
    ) ||
    [record.insuranceValidationStatus, record.customerDriverValidationStatus, record.workflowValidationStatus, record.legalValidationStatus].some(
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
    legal: record.legal,
    fields,
  })
  if (workflowIssues.some(({ severity }) => severity === "BLOCKER"))
    throw new PricingError("ACTIVE_CONFIGURATION_INVALID", "Active booking workflow is invalid.", "OPERATIONAL")
  if (record.insurance.enabled && record.insurance.pricePerDay <= 0)
    throw new PricingError("ACTIVE_CONFIGURATION_INVALID", "Active insurance price is invalid.", "OPERATIONAL")
  money(record.insurance.pricePerDay, record.currency)
}

function resolveLegalRequirements(record: ActivePhase6Record, locale: string): BookingLegalRequirements | undefined {
  if (!record.legal.bookingEnforcementEnabled) return undefined
  if (!record.legal.requiredLocales.includes(locale))
    throw new PricingError("ACTIVE_CONFIGURATION_INVALID", "The active legal policy does not support this booking language.", "OPERATIONAL")
  const labels = record.legal.translations.find((item) => item.locale === locale)
  if (!labels)
    throw new PricingError("ACTIVE_CONFIGURATION_INVALID", "Localized legal acceptance labels are missing.", "OPERATIONAL")
  const specifications = [
    {
      document: record.legalDocuments.terms,
      requirement: record.legal.termsAcceptance,
      checkboxLabel: labels.termsCheckboxLabel,
      linkLabel: labels.termsLinkLabel,
      presentation: record.legal.termsPresentation,
    },
    {
      document: record.legalDocuments.privacy,
      requirement: record.legal.privacyAcknowledgment,
      checkboxLabel: labels.privacyCheckboxLabel,
      linkLabel: labels.privacyLinkLabel,
      presentation: record.legal.privacyPresentation,
    },
  ] as const
  const documents: BookingLegalDocumentRequirement[] = specifications
    .filter(({ requirement }) => requirement !== "DISABLED")
    .map(({ document, requirement, checkboxLabel, linkLabel, presentation }) => {
      const translation = document.translations.find((item) => item.locale === locale)
      if (
        document.status !== "PUBLISHED" ||
        !valid(document.validationStatus) ||
        !translation ||
        !valid(translation.validationStatus) ||
        translation.contentHash !== legalContentHash(translation.canonicalContent) ||
        translation.sanitizedHtml !== renderLegalPlainText(translation.canonicalContent) ||
        !linkLabel.trim() ||
        (requirement === "REQUIRED" && !checkboxLabel?.trim())
      )
        throw new PricingError("ACTIVE_CONFIGURATION_INVALID", "The active legal publication evidence is invalid.", "OPERATIONAL")
      return {
        type: document.type,
        requirement,
        legalDocumentVersionId: document.id,
        legalDocumentTranslationId: translation.id,
        versionNumber: document.versionNumber,
        versionLabel: document.versionLabel,
        locale,
        title: translation.title,
        canonicalContent: translation.canonicalContent,
        sanitizedHtml: translation.sanitizedHtml,
        contentHash: translation.contentHash,
        checkboxLabel,
        linkLabel,
        presentation,
      }
    })
  if (documents.length === 0)
    throw new PricingError("ACTIVE_CONFIGURATION_INVALID", "The active legal policy has no applicable publication.", "OPERATIONAL")
  return {
    configurationReleaseId: record.releaseId,
    legalAcceptanceConfigVersionId: record.legalVersionId,
    locale,
    showInConfirmation: record.legal.showInConfirmation,
    retainContentSnapshot: record.legal.retainRenderedSnapshot,
    documents,
  }
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
  const legal = resolveLegalRequirements(record, input.locale)
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
    steps: resolveEffectiveBookingFlow(record.workflow, record.legal),
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
    legal,
  }
}
