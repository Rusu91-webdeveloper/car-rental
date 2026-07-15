import type { Prisma, PrismaClient } from "@prisma/client"
import type {
  ActiveBusinessConfigurationRepository,
  ActiveReleasePricingRecord,
  FleetRateSetRepository,
  LegacyVehicleRateRecord,
  VehicleRateRepository,
} from "./repositories"

type DbClient = PrismaClient | Prisma.TransactionClient

export class PrismaPricingContextRepository
  implements VehicleRateRepository, ActiveBusinessConfigurationRepository, FleetRateSetRepository
{
  readonly resolvesFleetRateSets = true as const

  constructor(private readonly db: DbClient) {}

  async findActivePricingConfiguration(vehicleId: string): Promise<ActiveReleasePricingRecord | null> {
    const release = await this.db.businessConfigurationRelease.findFirst({
      where: { status: "ACTIVE" },
      include: {
        generalRentalConfig: true,
        pricingBillingConfig: { include: { version: true } },
        fleetRateSet: {
          include: {
            rates: { where: { carId: vehicleId }, take: 1 },
          },
        },
      },
    })
    if (!release) return null

    const paymentSettings = await this.db.companySettings.findUnique({
      where: { id: "company-settings" },
      select: { depositPercentage: true, guaranteePercentage: true },
    })
    const rate = release.fleetRateSet.rates[0]
    return {
      releaseId: release.id,
      releaseNumber: release.releaseNumber,
      releaseStatus: release.status,
      releaseValidationStatus: release.validationStatus,
      pricingConfigVersionId: release.pricingBillingConfigVersionId,
      pricingVersionNumber: release.pricingBillingConfig.version.versionNumber,
      pricingVersionStatus: release.pricingBillingConfig.version.status,
      pricingValidationStatus: release.pricingBillingConfig.version.validationStatus,
      fleetRateSetId: release.fleetRateSetId,
      fleetRateSetVersionNumber: release.fleetRateSet.versionNumber,
      fleetRateSetStatus: release.fleetRateSet.status,
      fleetRateSetValidationStatus: release.fleetRateSet.validationStatus,
      vehicleRentalRateId: rate?.id,
      vehicleId,
      currency: release.generalRentalConfig.currency,
      fleetCurrency: release.fleetRateSet.currency,
      businessTimeZone: release.generalRentalConfig.businessTimeZone,
      dailyRate: rate?.dailyRate,
      weeklyRate: rate?.weeklyRate,
      monthlyRate: rate?.monthlyRate,
      weeklyRateEnabled: release.pricingBillingConfig.weeklyPricingEnabled && Boolean(rate?.weeklyRateEnabled),
      monthlyRateEnabled: release.pricingBillingConfig.monthlyPricingEnabled && Boolean(rate?.monthlyRateEnabled),
      strategy: release.pricingBillingConfig.mixedDurationStrategy,
      monthDefinition: release.pricingBillingConfig.rentalMonthDefinition,
      billableDayMethod: release.pricingBillingConfig.billableDayMethod,
      gracePeriodMinutes: release.pricingBillingConfig.gracePeriodMinutes,
      minimumRentalMinutes: release.pricingBillingConfig.minimumRentalMinutes,
      minimumChargeDays: release.pricingBillingConfig.minimumChargeDays,
      taxTreatment: release.pricingBillingConfig.priceTaxTreatment,
      taxRateBps: release.pricingBillingConfig.taxRateBps,
      depositFraction: paymentSettings?.depositPercentage ?? 0.2,
      guaranteeFraction: paymentSettings?.guaranteePercentage ?? 0,
    }
  }

  async findLegacyVehicleRate(vehicleId: string): Promise<LegacyVehicleRateRecord | null> {
    const [car, settings] = await Promise.all([
      this.db.car.findFirst({
        where: { id: vehicleId, isDeleted: false },
        select: { id: true, price: true },
      }),
      this.db.companySettings.findUnique({
        where: { id: "company-settings" },
        select: {
          currency: true,
          taxRate: true,
          taxIncluded: true,
          depositPercentage: true,
          guaranteePercentage: true,
        },
      }),
    ])
    if (!car) return null
    return {
      vehicleId: car.id,
      dailyRate: car.price,
      currency: settings?.currency ?? "EUR",
      taxIncluded: settings?.taxIncluded ?? false,
      taxRateFraction: settings?.taxRate ?? 0,
      depositFraction: settings?.depositPercentage ?? 0.2,
      guaranteeFraction: settings?.guaranteePercentage ?? 0,
    }
  }
}
