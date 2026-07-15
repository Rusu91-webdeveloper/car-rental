import type { PricingBillingConfiguration } from "@/lib/business-configuration/domains"
import type { ConfigurationValidationIssue } from "@/lib/business-configuration/types"
import type { PricingResult } from "@/lib/pricing/types"

export interface PricingVersionView {
  id: string
  versionNumber: number
  status: string
  validationStatus: string
  revision: number
  changeSummary: string
  updatedAt: string
  updatedBy: string
  configuration: PricingBillingConfiguration
}

export interface FleetRateSetView {
  id: string
  versionNumber: number
  status: string
  validationStatus: string
  revision: number
  currency: string
  changeSummary: string
  updatedAt: string
  updatedBy: string
}

export interface VehicleRateView {
  vehicleId: string
  vehicleName: string
  businessIdentifier: string
  vehicleStatus: string
  activeForBooking: boolean
  legacyDailyRate: number
  draftRateId?: string
  draftDailyRate?: number
  draftWeeklyRate?: number
  draftMonthlyRate?: number
  weeklyRateEnabled: boolean
  monthlyRateEnabled: boolean
  liveDailyRate?: number
  liveWeeklyRate?: number
  liveMonthlyRate?: number
  liveWeeklyRateEnabled: boolean
  liveMonthlyRateEnabled: boolean
  changedFromLive: boolean
  issues: ConfigurationValidationIssue[]
}

export interface PricingCoverageView {
  totalActiveVehicles: number
  dailyRates: number
  weeklyRates: number
  monthlyRates: number
  missingRequiredRates: number
  vehiclesNotInDraft: number
  currencyConsistent: boolean
  blockers: number
  warnings: number
}

export interface PricingComparison {
  ruleChanges: Array<{ field: string; label: string; live: string; draft: string }>
  rateChanges: Array<{
    vehicleId: string
    vehicleName: string
    field: string
    live?: number
    draft?: number
    absoluteChange?: number
    percentageChange?: number
  }>
  addedVehicles: string[]
  removedVehicles: string[]
  affectedVehicleCount: number
}

export interface PricingAdminPageData {
  liveRelease?: { id: string; releaseNumber: number; name: string }
  draftRelease?: { id: string; releaseNumber: number; name: string; revision: number }
  pricingDraftAttached: boolean
  fleetDraftAttached: boolean
  businessTimeZone: string
  liveBusinessTimeZone?: string
  currency: string
  livePricing?: PricingVersionView
  draftPricing?: PricingVersionView
  liveFleet?: FleetRateSetView
  draftFleet?: FleetRateSetView
  vehicles: VehicleRateView[]
  coverage: PricingCoverageView
  issues: ConfigurationValidationIssue[]
  comparison: PricingComparison
}

export interface PricingQuoteView {
  live?: PricingResult
  draft?: PricingResult
  liveError?: string
  draftError?: string
}
