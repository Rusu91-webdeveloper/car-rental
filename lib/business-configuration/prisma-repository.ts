import { Prisma, type PrismaClient } from "@prisma/client"
import { CONFIRMATION_SECTIONS, type BusinessConfigurationDomains } from "./domains"
import type { ConfigurationDomainId } from "./types"
import type {
  AuditEventRepository,
  BusinessConfigurationReleaseRepository,
  ConfigurationAuditRecord,
  ConfigurationEvidenceRepository,
  ReleaseAggregate,
} from "./repositories"

export type ConfigurationDbClient = PrismaClient | Prisma.TransactionClient

const releaseInclude = {
  createdBy: { select: { name: true, email: true } },
  updatedBy: { select: { name: true, email: true } },
  activatedBy: { select: { name: true, email: true } },
  generalRentalConfig: { include: { version: { include: { updatedBy: { select: { name: true, email: true } } } } } },
  pricingBillingConfig: { include: { version: { include: { updatedBy: { select: { name: true, email: true } } } } } },
  insuranceConfig: {
    include: {
      version: { include: { updatedBy: { select: { name: true, email: true } } } },
      translations: true,
      vehicleAvailability: true,
    },
  },
  customerDriverConfig: {
    include: {
      version: { include: { updatedBy: { select: { name: true, email: true } } } },
      fieldRules: true,
    },
  },
  bookingWorkflowConfig: {
    include: {
      version: { include: { updatedBy: { select: { name: true, email: true } } } },
      stepRules: true,
    },
  },
  documentPolicyConfig: {
    include: {
      version: { include: { updatedBy: { select: { name: true, email: true } } } },
      requirements: { include: { documentType: true } },
      rolePermissions: true,
    },
  },
  paymentConfig: {
    include: {
      version: { include: { updatedBy: { select: { name: true, email: true } } } },
      methods: true,
      instructions: true,
    },
  },
  confirmationConfig: {
    include: {
      version: { include: { updatedBy: { select: { name: true, email: true } } } },
      sections: { include: { sectionDefinition: true } },
      translations: true,
    },
  },
  legalAcceptanceConfig: {
    include: {
      version: { include: { updatedBy: { select: { name: true, email: true } } } },
      termsDocument: { include: { translations: true } },
      privacyDocument: { include: { translations: true } },
      translations: true,
    },
  },
  fleetRateSet: { include: { rates: { include: { car: { select: { name: true } } } } } },
} satisfies Prisma.BusinessConfigurationReleaseInclude

type ReleaseRow = Prisma.BusinessConfigurationReleaseGetPayload<{ include: typeof releaseInclude }>

const domainByDatabaseValue = {
  GENERAL_RENTAL: "general-rental",
  PRICING_BILLING: "pricing-billing",
  INSURANCE: "insurance",
  CUSTOMER_DRIVER_REQUIREMENTS: "customer-driver-requirements",
  BOOKING_WORKFLOW: "booking-workflow",
  DOCUMENT_POLICY: "document-policy",
  PAYMENTS: "payments",
  CONFIRMATIONS: "confirmations",
  LEGAL_ACCEPTANCE: "legal-acceptance",
} as const

function actorName(actor: { name: string | null; email: string } | null | undefined) {
  return actor?.name || actor?.email || "Unknown administrator"
}

function versionSummary(row: ReleaseRow["generalRentalConfig"]["version"]) {
  return {
    id: row.id,
    domain: domainByDatabaseValue[row.domain] as ConfigurationDomainId,
    versionNumber: row.versionNumber,
    status: row.status,
    validationStatus: row.validationStatus,
    revision: row.revision,
    changeSummary: row.changeSummary,
    updatedAt: row.updatedAt.toISOString(),
    authorName: actorName(row.updatedBy),
  }
}

function mapDomains(row: ReleaseRow): BusinessConfigurationDomains {
  const insuranceTranslation = row.insuranceConfig.translations.find(({ locale }) => locale === "en") ?? row.insuranceConfig.translations[0]
  const fields = Object.fromEntries(row.customerDriverConfig.fieldRules.map(({ field, mode }) => [field, mode]))
  const confirmationSections = new Map(
    row.confirmationConfig.sections.map(({ sectionDefinition, enabled }) => [sectionDefinition.key, enabled]),
  )
  return {
    "general-rental": {
      businessTimeZone: row.generalRentalConfig.businessTimeZone,
      currency: row.generalRentalConfig.currency,
      supportedLocales: row.generalRentalConfig.supportedLocales,
    },
    "pricing-billing": {
      weeklyPricingEnabled: row.pricingBillingConfig.weeklyPricingEnabled,
      monthlyPricingEnabled: row.pricingBillingConfig.monthlyPricingEnabled,
      mixedDurationStrategy: row.pricingBillingConfig.mixedDurationStrategy,
      rentalMonthDefinition: row.pricingBillingConfig.rentalMonthDefinition,
      billableDayRule: row.pricingBillingConfig.billableDayMethod,
      gracePeriodMinutes: row.pricingBillingConfig.gracePeriodMinutes,
      preparationBufferMinutes: row.pricingBillingConfig.preparationBufferMinutes,
      minimumRentalMinutes: row.pricingBillingConfig.minimumRentalMinutes,
      minimumChargeDays: row.pricingBillingConfig.minimumChargeDays,
      pricesIncludeTax: row.pricingBillingConfig.priceTaxTreatment === "TAX_INCLUDED",
      taxRateBps: row.pricingBillingConfig.taxRateBps,
    },
    insurance: {
      enabled: row.insuranceConfig.requirementMode !== "DISABLED",
      customerFacingName: insuranceTranslation?.customerFacingName ?? "",
      shortDescription: insuranceTranslation?.shortDescription ?? undefined,
      selectionMode: row.insuranceConfig.requirementMode === "MANDATORY" ? "MANDATORY" : "OPTIONAL",
      pricePerDay: row.insuranceConfig.pricePerDay,
      taxTreatment: row.insuranceConfig.taxTreatment,
      availabilityScope: row.insuranceConfig.availabilityScope,
      vehicleIds: row.insuranceConfig.vehicleAvailability.filter(({ available }) => available).map(({ carId }) => carId),
      showInConfirmation: row.insuranceConfig.showInConfirmation,
      showCustomerSelection: row.insuranceConfig.showCustomerSelection,
      preselectedByDefault: row.insuranceConfig.preselectedByDefault,
    },
    "customer-driver-requirements": {
      minimumDriverAge: row.customerDriverConfig.minimumDriverAge,
      maximumDriverAge: row.customerDriverConfig.maximumDriverAge ?? undefined,
      minimumLicenceHeldMonths: row.customerDriverConfig.minimumLicenceHeldMonths,
      licenceMustCoverRentalEnd: row.customerDriverConfig.licenceMustCoverRentalEnd,
      allowedLicenceCountries: row.customerDriverConfig.allowedLicenceCountries,
      fields: fields as BusinessConfigurationDomains["customer-driver-requirements"]["fields"],
    },
    "booking-workflow": {
      steps: row.bookingWorkflowConfig.stepRules.map(({ step, mode, displayOrder }) => ({
        step,
        requirement: mode,
        displayOrder,
      })),
    },
    "document-policy": {
      retentionPreferenceDays: row.documentPolicyConfig.retentionPreferenceDays,
      requirements: row.documentPolicyConfig.requirements.map(({ documentType, mode, fileCount, sides, uploadStage }) => ({
        documentType: documentType.key as BusinessConfigurationDomains["document-policy"]["requirements"][number]["documentType"],
        requirement: mode,
        fileCount,
        sides,
        uploadStage,
      })),
      permittedRoleIds: row.documentPolicyConfig.rolePermissions
        .filter(({ mayView }) => mayView)
        .map(({ accessRoleId }) => accessRoleId),
    },
    payments: {
      defaultMethod: row.paymentConfig.defaultMethod,
      confirmationMode: row.paymentConfig.confirmationMode,
      depositMode: row.paymentConfig.depositType,
      depositValue: row.paymentConfig.depositValue,
      remainingBalanceRule: row.paymentConfig.remainingBalanceRule,
      methods: row.paymentConfig.methods.map(({ method, enabled }) => ({ method, enabled })),
      instructions: row.paymentConfig.instructions.map(({ method, locale, instructions }) => ({ method, locale, instructions })),
    },
    confirmations: {
      sections: CONFIRMATION_SECTIONS.map((section) => ({
        section,
        enabled: confirmationSections.get(section) ?? false,
      })),
      content: row.confirmationConfig.translations.map(({ locale, heading, safeContent }) => ({
        locale,
        heading: heading ?? undefined,
        safeContent: safeContent ?? undefined,
      })),
    },
    "legal-acceptance": {
      termsDocument: {
        id: row.legalAcceptanceConfig.termsDocument.id,
        type: row.legalAcceptanceConfig.termsDocument.type,
        publicationStatus: row.legalAcceptanceConfig.termsDocument.status as "PUBLISHED" | "ARCHIVED",
        availableLocales: row.legalAcceptanceConfig.termsDocument.translations.map(({ locale }) => locale),
        contentHash:
          row.legalAcceptanceConfig.termsDocument.manifestHash ??
          row.legalAcceptanceConfig.termsDocument.translations[0]?.contentHash ??
          "",
      },
      privacyDocument: {
        id: row.legalAcceptanceConfig.privacyDocument.id,
        type: row.legalAcceptanceConfig.privacyDocument.type,
        publicationStatus: row.legalAcceptanceConfig.privacyDocument.status as "PUBLISHED" | "ARCHIVED",
        availableLocales: row.legalAcceptanceConfig.privacyDocument.translations.map(({ locale }) => locale),
        contentHash:
          row.legalAcceptanceConfig.privacyDocument.manifestHash ??
          row.legalAcceptanceConfig.privacyDocument.translations[0]?.contentHash ??
          "",
      },
      termsAcceptance: row.legalAcceptanceConfig.termsAcceptance,
      privacyAcknowledgment: row.legalAcceptanceConfig.privacyAcknowledgment,
      retainRenderedSnapshot: row.legalAcceptanceConfig.retainContentSnapshot,
      bookingEnforcementEnabled: row.legalAcceptanceConfig.bookingEnforcementEnabled,
      requiredLocales: row.legalAcceptanceConfig.requiredLocales,
      termsPresentation: row.legalAcceptanceConfig.termsPresentation,
      privacyPresentation: row.legalAcceptanceConfig.privacyPresentation,
      showInConfirmation: row.legalAcceptanceConfig.showInConfirmation,
      translations: row.legalAcceptanceConfig.translations.map(({ locale, termsCheckboxLabel, termsLinkLabel, privacyCheckboxLabel, privacyLinkLabel }) => ({ locale, termsCheckboxLabel: termsCheckboxLabel ?? undefined, termsLinkLabel, privacyCheckboxLabel: privacyCheckboxLabel ?? undefined, privacyLinkLabel })),
    },
  }
}

function releaseAggregate(row: ReleaseRow): ReleaseAggregate {
  const summaries = [
    row.generalRentalConfig.version,
    row.pricingBillingConfig.version,
    row.insuranceConfig.version,
    row.customerDriverConfig.version,
    row.bookingWorkflowConfig.version,
    row.documentPolicyConfig.version,
    row.paymentConfig.version,
    row.confirmationConfig.version,
    row.legalAcceptanceConfig.version,
  ].map(versionSummary)
  return {
    id: row.id,
    releaseNumber: row.releaseNumber,
    name: row.name,
    changeSummary: row.changeSummary,
    status: row.status,
    validationStatus: row.validationStatus,
    revision: row.revision,
    validationSnapshot: row.validationSnapshot ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    activatedAt: row.activatedAt?.toISOString(),
    createdByName: actorName(row.createdBy),
    updatedByName: actorName(row.updatedBy),
    activatedByName: actorName(row.activatedBy),
    supersedesReleaseId: row.supersedesReleaseId ?? undefined,
    versions: Object.fromEntries(summaries.map((summary) => [summary.domain, summary])) as ReleaseAggregate["versions"],
    domains: mapDomains(row),
    fleetRateSet: {
      id: row.fleetRateSet.id,
      versionNumber: row.fleetRateSet.versionNumber,
      status: row.fleetRateSet.status,
      validationStatus: row.fleetRateSet.validationStatus,
      revision: row.fleetRateSet.revision,
      currency: row.fleetRateSet.currency,
      updatedAt: row.fleetRateSet.updatedAt.toISOString(),
      rates: row.fleetRateSet.rates.map((rate) => ({
        id: rate.id,
        vehicleId: rate.carId,
        vehicleName: rate.car.name,
        dailyRate: rate.dailyRate,
        weeklyRate: rate.weeklyRate ?? undefined,
        monthlyRate: rate.monthlyRate ?? undefined,
        weeklyRateEnabled: rate.weeklyRateEnabled,
        monthlyRateEnabled: rate.monthlyRateEnabled,
      })),
    },
  }
}

export class PrismaBusinessConfigurationRepository
  implements BusinessConfigurationReleaseRepository, ConfigurationEvidenceRepository, AuditEventRepository
{
  constructor(readonly db: ConfigurationDbClient) {}

  private async findRelease(where: Prisma.BusinessConfigurationReleaseWhereInput) {
    const row = await this.db.businessConfigurationRelease.findFirst({ where, include: releaseInclude })
    return row ? releaseAggregate(row) : null
  }

  findReleaseAggregate(releaseId: string) {
    return this.findRelease({ id: releaseId })
  }

  findActiveRelease() {
    return this.findRelease({ status: "ACTIVE" })
  }

  findLatestDraftRelease() {
    return this.db.businessConfigurationRelease
      .findFirst({
        where: { status: { in: ["DRAFT", "VALIDATED"] } },
        include: releaseInclude,
        orderBy: { updatedAt: "desc" },
      })
      .then((row) => (row ? releaseAggregate(row) : null))
  }

  countBookableVehicles() {
    return this.db.car.count({ where: { isDeleted: false, status: { in: ["AVAILABLE", "LOW_STOCK"] } } })
  }

  listBookableVehicles() {
    return this.db.car.findMany({
      where: { isDeleted: false, status: { in: ["AVAILABLE", "LOW_STOCK"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    })
  }

  async listPublishedLegalEvidence() {
    const documents = await this.db.legalDocumentVersion.findMany({
      where: { status: { in: ["PUBLISHED", "DRAFT"] } },
      select: { id: true, type: true, status: true, translations: { select: { locale: true } } },
      orderBy: [{ type: "asc" }, { versionNumber: "desc" }],
    })
    return documents.map(({ id, type, status, translations }) => ({
      id,
      type,
      status,
      locales: translations.map(({ locale }) => locale),
    }))
  }

  async findLatestPricingDraftEvidence() {
    const [pricing, fleet] = await Promise.all([
      this.db.configurationVersion.findFirst({
        where: { domain: "PRICING_BILLING", status: { in: ["DRAFT", "VALIDATED"] } },
        include: { pricingBilling: true },
        orderBy: { updatedAt: "desc" },
      }),
      this.db.fleetRateSet.findFirst({
        where: { status: { in: ["DRAFT", "VALIDATED"] } },
        include: { rates: { include: { car: { select: { name: true } } } } },
        orderBy: { updatedAt: "desc" },
      }),
    ])
    if (!pricing?.pricingBilling || !fleet) return null
    return {
      pricingVersionId: pricing.id,
      pricingVersionNumber: pricing.versionNumber,
      pricingValidationStatus: pricing.validationStatus,
      configuration: {
        weeklyPricingEnabled: pricing.pricingBilling.weeklyPricingEnabled,
        monthlyPricingEnabled: pricing.pricingBilling.monthlyPricingEnabled,
        mixedDurationStrategy: pricing.pricingBilling.mixedDurationStrategy,
        rentalMonthDefinition: pricing.pricingBilling.rentalMonthDefinition,
        billableDayRule: pricing.pricingBilling.billableDayMethod,
        gracePeriodMinutes: pricing.pricingBilling.gracePeriodMinutes,
        preparationBufferMinutes: pricing.pricingBilling.preparationBufferMinutes,
        minimumRentalMinutes: pricing.pricingBilling.minimumRentalMinutes,
        minimumChargeDays: pricing.pricingBilling.minimumChargeDays,
        pricesIncludeTax: pricing.pricingBilling.priceTaxTreatment === "TAX_INCLUDED",
        taxRateBps: pricing.pricingBilling.taxRateBps,
      },
      fleetRateSet: {
        id: fleet.id,
        versionNumber: fleet.versionNumber,
        status: fleet.status,
        validationStatus: fleet.validationStatus,
        revision: fleet.revision,
        currency: fleet.currency,
        updatedAt: fleet.updatedAt.toISOString(),
        rates: fleet.rates.map((rate) => ({
          id: rate.id,
          vehicleId: rate.carId,
          vehicleName: rate.car.name,
          dailyRate: rate.dailyRate,
          weeklyRate: rate.weeklyRate ?? undefined,
          monthlyRate: rate.monthlyRate ?? undefined,
          weeklyRateEnabled: rate.weeklyRateEnabled,
          monthlyRateEnabled: rate.monthlyRateEnabled,
        })),
      },
    }
  }

  async listRecentConfigurationEvents(limit = 20): Promise<ConfigurationAuditRecord[]> {
    const events = await this.db.auditEvent.findMany({
      where: { category: { in: ["CONFIGURATION", "PRICING", "AUTHORIZATION"] } },
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
    })
    return events.map((event) => {
      const summary =
        event.afterSummary && typeof event.afterSummary === "object" && !Array.isArray(event.afterSummary)
          ? String((event.afterSummary as Record<string, unknown>).changeSummary ?? "")
          : undefined
      return {
        id: event.id,
        actorName: actorName(event.actor),
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        releaseId: event.configurationReleaseId ?? undefined,
        summary: summary || undefined,
        createdAt: event.createdAt.toISOString(),
      }
    })
  }
}
