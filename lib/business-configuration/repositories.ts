import type { BusinessConfigurationDomains } from "./domains"
import type {
  ConfigurationDomainId,
  ConfigurationValidationResult,
  ConfigurationValidationStatus,
  ConfigurationVersionStatus,
} from "./types"

export interface ConfigurationVersionSummary {
  id: string
  domain: ConfigurationDomainId
  versionNumber: number
  status: ConfigurationVersionStatus
  validationStatus: ConfigurationValidationStatus
  revision: number
  changeSummary: string
  updatedAt: string
  authorName: string
}

export interface FleetRateRecord {
  id: string
  vehicleId: string
  vehicleName: string
  dailyRate: number
  weeklyRate?: number
  monthlyRate?: number
  weeklyRateEnabled: boolean
  monthlyRateEnabled: boolean
}

export interface ReleaseAggregate {
  id: string
  releaseNumber: number
  name: string
  changeSummary: string
  status: "DRAFT" | "VALIDATED" | "ACTIVE" | "SUPERSEDED" | "ARCHIVED"
  validationStatus: ConfigurationValidationStatus
  revision: number
  validationSnapshot?: unknown
  createdAt: string
  updatedAt: string
  activatedAt?: string
  createdByName: string
  updatedByName: string
  activatedByName?: string
  supersedesReleaseId?: string
  versions: Record<ConfigurationDomainId, ConfigurationVersionSummary>
  domains: Partial<BusinessConfigurationDomains>
  fleetRateSet: {
    id: string
    versionNumber: number
    status: ConfigurationVersionStatus
    validationStatus: ConfigurationValidationStatus
    revision: number
    currency: string
    updatedAt: string
    rates: FleetRateRecord[]
  }
}

export interface ConfigurationAuditRecord {
  id: string
  actorName: string
  action: string
  targetType: string
  targetId: string
  releaseId?: string
  summary?: string
  createdAt: string
}

export interface ConfigurationVersionRepository {
  findReleaseAggregate(releaseId: string): Promise<ReleaseAggregate | null>
}

export interface BusinessConfigurationReleaseRepository extends ConfigurationVersionRepository {
  findActiveRelease(): Promise<ReleaseAggregate | null>
  findLatestDraftRelease(): Promise<ReleaseAggregate | null>
}

export interface ConfigurationEvidenceRepository {
  countBookableVehicles(): Promise<number>
  listBookableVehicles(): Promise<Array<{ id: string; name: string }>>
  listPublishedLegalEvidence(): Promise<
    Array<{ id: string; type: "RENTAL_TERMS" | "PRIVACY_NOTICE"; status: string; locales: string[] }>
  >
}

export interface AuditEventRepository {
  listRecentConfigurationEvents(limit?: number): Promise<ConfigurationAuditRecord[]>
}

export interface ReleaseValidationRecord {
  result: ConfigurationValidationResult
  release: ReleaseAggregate
}
