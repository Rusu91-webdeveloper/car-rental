import type { Prisma, PrismaClient } from "@prisma/client"
import type { ConfigurationDbClient } from "@/lib/business-configuration/prisma-repository"
import type {
  BookingWorkflowConfiguration,
  CustomerDriverRequirementsConfiguration,
  InsuranceConfiguration,
} from "@/lib/business-configuration/domains"

export interface ActivePhase6Record {
  releaseId: string
  releaseNumber: number
  releaseValidationStatus: string
  businessTimeZone: string
  currency: string
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
}

export class PrismaBookingConfigurationRepository {
  constructor(readonly db: ConfigurationDbClient) {}

  async findActiveConfiguration(vehicleId: string, locale: string): Promise<ActivePhase6Record | null> {
    const release = await this.db.businessConfigurationRelease.findFirst({
      where: { status: "ACTIVE" },
      include: {
        generalRentalConfig: true,
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
      },
    })
    if (!release) return null
    const translation =
      release.insuranceConfig.translations.find((item) => item.locale === locale) ??
      release.insuranceConfig.translations.find((item) => item.locale === "en") ??
      release.insuranceConfig.translations[0]
    const modes = new Map(release.customerDriverConfig.fieldRules.map(({ field, mode }) => [field, mode]))
    return {
      releaseId: release.id,
      releaseNumber: release.releaseNumber,
      releaseValidationStatus: release.validationStatus,
      businessTimeZone: release.generalRentalConfig.businessTimeZone,
      currency: release.generalRentalConfig.currency,
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
    }
  }
}
