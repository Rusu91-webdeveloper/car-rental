import type { ConfigurationDbClient } from "@/lib/business-configuration/prisma-repository"
import type {
  BookingWorkflowConfiguration,
  CustomerDriverRequirementsConfiguration,
  InsuranceConfiguration,
  LegalAcceptanceConfiguration,
} from "@/lib/business-configuration/domains"

export interface ActiveLegalDocumentRecord {
  id: string
  type: "RENTAL_TERMS" | "PRIVACY_NOTICE"
  versionNumber: number
  versionLabel: string
  status: string
  validationStatus: string
  translations: Array<{
    id: string
    locale: string
    title: string
    canonicalContent: string
    sanitizedHtml: string
    contentHash: string
    validationStatus: string
  }>
}

export interface ActivePhase6Record {
  releaseId: string
  releaseNumber: number
  releaseValidationStatus: string
  businessTimeZone: string
  currency: string
  minimumRentalMinutes: number
  insuranceVersionId: string
  insuranceVersionStatus: string
  insuranceValidationStatus: string
  insurance: InsuranceConfiguration
  customerDriverVersionId: string
  customerDriverVersionStatus: string
  customerDriverValidationStatus: string
  customerDriver: CustomerDriverRequirementsConfiguration
  workflowVersionId: string
  workflowVersionStatus: string
  workflowValidationStatus: string
  workflow: BookingWorkflowConfiguration
  legalVersionId: string
  legalVersionStatus: string
  legalValidationStatus: string
  legal: LegalAcceptanceConfiguration
  legalDocuments: {
    terms: ActiveLegalDocumentRecord
    privacy: ActiveLegalDocumentRecord
  }
}

export class PrismaBookingConfigurationRepository {
  constructor(readonly db: ConfigurationDbClient) {}

  async findActiveConfiguration(vehicleId: string, locale: string): Promise<ActivePhase6Record | null> {
    const release = await this.db.businessConfigurationRelease.findFirst({
      where: { status: "ACTIVE" },
      include: {
        generalRentalConfig: true,
        pricingBillingConfig: true,
        insuranceConfig: {
          include: {
            version: true,
            translations: true,
            vehicleAvailability: {
              where: { carId: vehicleId, available: true },
            },
          },
        },
        customerDriverConfig: { include: { version: true, fieldRules: true } },
        bookingWorkflowConfig: { include: { version: true, stepRules: true } },
        legalAcceptanceConfig: {
          include: {
            version: true,
            translations: true,
            termsDocument: { include: { translations: true } },
            privacyDocument: { include: { translations: true } },
          },
        },
      },
    })
    if (!release) return null
    const translation =
      release.insuranceConfig.translations.find((item) => item.locale === locale) ??
      release.insuranceConfig.translations.find((item) => item.locale === "en") ??
      release.insuranceConfig.translations[0]
    return {
      releaseId: release.id,
      releaseNumber: release.releaseNumber,
      releaseValidationStatus: release.validationStatus,
      businessTimeZone: release.generalRentalConfig.businessTimeZone,
      currency: release.generalRentalConfig.currency,
      minimumRentalMinutes: release.pricingBillingConfig.minimumRentalMinutes,
      insuranceVersionId: release.insuranceConfigVersionId,
      insuranceVersionStatus: release.insuranceConfig.version.status,
      insuranceValidationStatus: release.insuranceConfig.version.validationStatus,
      insurance: {
        enabled: release.insuranceConfig.requirementMode !== "DISABLED",
        selectionMode: release.insuranceConfig.requirementMode === "MANDATORY" ? "MANDATORY" : "OPTIONAL",
        customerFacingName: translation?.customerFacingName ?? "Insurance",
        shortDescription: translation?.shortDescription ?? undefined,
        pricePerDay: release.insuranceConfig.pricePerDay,
        taxTreatment: release.insuranceConfig.taxTreatment,
        availabilityScope: release.insuranceConfig.availabilityScope,
        vehicleIds: release.insuranceConfig.vehicleAvailability.map(({ carId }) => carId),
        showInConfirmation: release.insuranceConfig.showInConfirmation,
        showCustomerSelection: release.insuranceConfig.showCustomerSelection,
        preselectedByDefault: release.insuranceConfig.preselectedByDefault,
      },
      customerDriverVersionId: release.customerDriverConfigVersionId,
      customerDriverVersionStatus: release.customerDriverConfig.version.status,
      customerDriverValidationStatus: release.customerDriverConfig.version.validationStatus,
      customerDriver: {
        minimumDriverAge: release.customerDriverConfig.minimumDriverAge,
        maximumDriverAge: release.customerDriverConfig.maximumDriverAge ?? undefined,
        minimumLicenceHeldMonths: release.customerDriverConfig.minimumLicenceHeldMonths,
        licenceMustCoverRentalEnd: release.customerDriverConfig.licenceMustCoverRentalEnd,
        allowedLicenceCountries: release.customerDriverConfig.allowedLicenceCountries,
        fields: Object.fromEntries(
          release.customerDriverConfig.fieldRules.map(({ field, mode }) => [field, mode]),
        ) as CustomerDriverRequirementsConfiguration["fields"],
      },
      workflowVersionId: release.bookingWorkflowConfigVersionId,
      workflowVersionStatus: release.bookingWorkflowConfig.version.status,
      workflowValidationStatus: release.bookingWorkflowConfig.version.validationStatus,
      workflow: {
        steps: release.bookingWorkflowConfig.stepRules.map(({ step, mode, displayOrder }) => ({
          step,
          requirement: mode,
          displayOrder,
        })),
      },
      legalVersionId: release.legalAcceptanceConfigVersionId,
      legalVersionStatus: release.legalAcceptanceConfig.version.status,
      legalValidationStatus: release.legalAcceptanceConfig.version.validationStatus,
      legal: {
        termsDocument: {
          id: release.legalAcceptanceConfig.termsDocument.id,
          type: release.legalAcceptanceConfig.termsDocument.type,
          publicationStatus: release.legalAcceptanceConfig.termsDocument.status as "PUBLISHED" | "ARCHIVED",
          availableLocales: release.legalAcceptanceConfig.termsDocument.translations.map(({ locale }) => locale),
          contentHash: release.legalAcceptanceConfig.termsDocument.manifestHash ?? "",
        },
        privacyDocument: {
          id: release.legalAcceptanceConfig.privacyDocument.id,
          type: release.legalAcceptanceConfig.privacyDocument.type,
          publicationStatus: release.legalAcceptanceConfig.privacyDocument.status as "PUBLISHED" | "ARCHIVED",
          availableLocales: release.legalAcceptanceConfig.privacyDocument.translations.map(({ locale }) => locale),
          contentHash: release.legalAcceptanceConfig.privacyDocument.manifestHash ?? "",
        },
        termsAcceptance: release.legalAcceptanceConfig.termsAcceptance,
        privacyAcknowledgment: release.legalAcceptanceConfig.privacyAcknowledgment,
        retainRenderedSnapshot: release.legalAcceptanceConfig.retainContentSnapshot,
        bookingEnforcementEnabled: release.legalAcceptanceConfig.bookingEnforcementEnabled,
        requiredLocales: release.legalAcceptanceConfig.requiredLocales,
        termsPresentation: release.legalAcceptanceConfig.termsPresentation,
        privacyPresentation: release.legalAcceptanceConfig.privacyPresentation,
        showInConfirmation: release.legalAcceptanceConfig.showInConfirmation,
        translations: release.legalAcceptanceConfig.translations.map((labels) => ({
          locale: labels.locale,
          termsCheckboxLabel: labels.termsCheckboxLabel ?? undefined,
          termsLinkLabel: labels.termsLinkLabel,
          privacyCheckboxLabel: labels.privacyCheckboxLabel ?? undefined,
          privacyLinkLabel: labels.privacyLinkLabel,
        })),
      },
      legalDocuments: {
        terms: mapLegalDocument(release.legalAcceptanceConfig.termsDocument),
        privacy: mapLegalDocument(release.legalAcceptanceConfig.privacyDocument),
      },
    }
  }
}

function mapLegalDocument(document: {
  id: string
  type: "RENTAL_TERMS" | "PRIVACY_NOTICE"
  versionNumber: number
  versionLabel: string
  status: string
  validationStatus: string
  translations: Array<{
    id: string
    locale: string
    title: string
    canonicalContent: string
    sanitizedHtml: string | null
    contentHash: string
    validationStatus: string
  }>
}): ActiveLegalDocumentRecord {
  return {
    ...document,
    translations: document.translations.map((translation) => ({
      ...translation,
      sanitizedHtml: translation.sanitizedHtml ?? "",
    })),
  }
}
