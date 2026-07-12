import type { BusinessConfigurationDomains } from "@/lib/business-configuration/domains"
import type { ReleaseAggregate } from "@/lib/business-configuration/repositories"

export interface PricingDraftRecord {
  id: string
  versionNumber: number
  status: string
  validationStatus: string
  revision: number
  changeSummary: string
  updatedAt: string
  updatedBy: string
  configuration: BusinessConfigurationDomains["pricing-billing"]
}

export interface FleetDraftRecord {
  id: string
  versionNumber: number
  status: string
  validationStatus: string
  revision: number
  currency: string
  changeSummary: string
  updatedAt: string
  updatedBy: string
  rates: Array<{
    id: string
    vehicleId: string
    dailyRate: number
    weeklyRate?: number
    monthlyRate?: number
    weeklyRateEnabled: boolean
    monthlyRateEnabled: boolean
  }>
}

export interface PricingVehicleRecord {
  id: string
  slug: string
  name: string
  status: string
  price: number
}

export interface PricingWorkspaceRecords {
  activeRelease: ReleaseAggregate | null
  draftRelease: ReleaseAggregate | null
  pricingDraft: PricingDraftRecord | null
  fleetDraft: FleetDraftRecord | null
  vehicles: PricingVehicleRecord[]
  companyCurrency: string
}

export interface PricingAdminRepository {
  loadWorkspace(): Promise<PricingWorkspaceRecords>
}
