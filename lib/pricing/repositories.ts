import type {
  BillableDayMethod,
  PersistentPricingStrategy,
  PriceTaxTreatment,
  RentalMonthDefinition,
} from "./types"

export interface LegacyVehicleRateRecord {
  vehicleId: string
  dailyRate: number
  currency: string
  taxIncluded: boolean
  taxRateFraction: number
  depositFraction: number
  guaranteeFraction: number
}

export interface ActiveReleasePricingRecord {
  releaseId: string
  releaseNumber: number
  releaseStatus: string
  releaseValidationStatus: string
  pricingConfigVersionId: string
  pricingVersionNumber: number
  pricingVersionStatus: string
  pricingValidationStatus: string
  fleetRateSetId: string
  fleetRateSetVersionNumber: number
  fleetRateSetStatus: string
  fleetRateSetValidationStatus: string
  vehicleRentalRateId?: string
  vehicleId: string
  currency: string
  fleetCurrency: string
  businessTimeZone: string
  dailyRate?: number
  weeklyRate?: number | null
  monthlyRate?: number | null
  weeklyRateEnabled?: boolean
  monthlyRateEnabled?: boolean
  strategy: PersistentPricingStrategy
  monthDefinition: RentalMonthDefinition
  billableDayMethod: BillableDayMethod
  gracePeriodMinutes: number
  minimumRentalMinutes: number
  minimumChargeDays: number
  taxTreatment: PriceTaxTreatment
  taxRateBps: number
  depositFraction: number
  guaranteeFraction: number
}

export interface VehicleRateRepository {
  findLegacyVehicleRate(vehicleId: string): Promise<LegacyVehicleRateRecord | null>
}

export interface ActiveBusinessConfigurationRepository {
  findActivePricingConfiguration(vehicleId: string): Promise<ActiveReleasePricingRecord | null>
}

export interface FleetRateSetRepository {
  // Marker contract for infrastructure that resolves immutable fleet-rate provenance.
  readonly resolvesFleetRateSets: true
}

export interface BookingPricingSnapshotRepository {
  createPricingSnapshot(input: unknown): Promise<void>
}

export type PricingContextRepository = VehicleRateRepository & ActiveBusinessConfigurationRepository
