import type { CurrencyCode, Money } from "./money"

export const PRICING_ENGINE_VERSION = "pricing-engine-v1" as const
export const PRICING_SNAPSHOT_SCHEMA_VERSION = 1 as const

export type PricingStrategy = "DAILY_ONLY" | "ORDERED_PERIODS" | "LOWEST_VALID_PRICE"
export type PersistentPricingStrategy = "DAILY_ONLY" | "LONGEST_BLOCKS_THEN_DAYS" | "LOWEST_VALID_TOTAL"
export type RentalMonthDefinition = "FIXED_28_DAYS" | "FIXED_30_DAYS" | "CALENDAR_MONTH"
export type BillableDayMethod = "STARTED_24_HOUR_PERIODS" | "CALENDAR_DAYS" | "PICKUP_TIME_BOUNDARY"
export type PriceTaxTreatment = "TAX_INCLUDED" | "TAX_EXCLUDED"
export type InsuranceTaxTreatment = "INHERIT_RENTAL" | "TAX_INCLUDED" | "TAX_EXCLUDED"
export type CompatibilityMode = "LEGACY_CAR_PRICE" | "ACTIVE_RELEASE"

export interface PricingAdjustmentInput {
  code: string
  label: string
  amount: Money
}

export interface PricingRatesInput {
  daily: Money
  weekly?: Money
  monthly?: Money
  weeklyEnabled: boolean
  monthlyEnabled: boolean
}

export interface PricingSourceIdentifiers {
  vehicleId: string
  rateSourceType: "CAR_PRICE" | "FLEET_RATE_SET"
  rateSourceReference: string
  configurationReleaseId?: string
  releaseNumber?: number
  pricingConfigVersionId?: string
  pricingVersionNumber?: number
  fleetRateSetId?: string
  fleetRateSetVersionNumber?: number
  vehicleRentalRateId?: string
}

export interface PricingRequest {
  vehicleId: string
  pickupAt: Date
  returnAt: Date
  businessTimeZone: string
  rates: PricingRatesInput
  strategy: PricingStrategy
  persistentStrategy: PersistentPricingStrategy
  monthDefinition: RentalMonthDefinition
  billableDayMethod: BillableDayMethod
  minimumRentalMinutes: number
  minimumChargeDays: number
  gracePeriodMinutes: number
  taxTreatment: PriceTaxTreatment
  taxRateBps: number
  adjustments?: PricingAdjustmentInput[]
  insuranceSubtotal?: Money
  insuranceTaxTreatment?: InsuranceTaxTreatment
  source: PricingSourceIdentifiers
  compatibilityMode: CompatibilityMode
  configurationVersion?: string
  engineVersion?: string
  calculatedAt?: Date
  warnings?: string[]
}

export interface ChargeableDuration {
  pickupAt: string
  returnAt: string
  elapsedMinutes: number
  chargeableDurationMinutes: number
  chargeableDays: number
  billableDayMethod: BillableDayMethod
  businessTimeZone: string
  minimumChargeDays: number
  gracePeriodMinutes: number
}

export interface PricingUnits {
  daily: number
  weekly: number
  monthly: number
}

export interface PricingTraceStep {
  code: string
  message: string
  units?: number
  unitRate?: number
  subtotal?: number
}

export interface PricingTrace {
  engineVersion: string
  duration: ChargeableDuration
  steps: PricingTraceStep[]
}

export interface AppliedAdjustment {
  code: string
  label: string
  amount: number
}

export interface PricingResult {
  currency: CurrencyCode
  pickupAt: string
  returnAt: string
  chargeableDuration: ChargeableDuration
  durationStrategy: BillableDayMethod
  units: PricingUnits
  sourceDailyRate: number
  sourceWeeklyRate: number | null
  sourceMonthlyRate: number | null
  selectedStrategy: PricingStrategy
  persistentStrategy: PersistentPricingStrategy
  monthDefinition: RentalMonthDefinition
  baseSubtotal: number
  adjustments: AppliedAdjustment[]
  adjustmentTotal: number
  insuranceSubtotal: number
  insuranceTaxTreatment: InsuranceTaxTreatment
  taxTreatment: PriceTaxTreatment
  taxRateBps: number
  taxSubtotal: number
  grandTotal: number
  pricingEngineVersion: string
  source: PricingSourceIdentifiers
  calculatedAt: string
  trace: PricingTrace
  warnings: string[]
  compatibilityMode: CompatibilityMode
}

export interface PaymentAmounts {
  depositAmount: number
  guaranteeAmount: number
  depositRateBps: number
  guaranteeRateBps: number
}

export interface BookingPricingQuote extends PricingResult {
  payment: PaymentAmounts
}
