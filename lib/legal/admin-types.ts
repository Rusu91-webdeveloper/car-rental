import type { LegalAcceptanceConfiguration } from "@/lib/business-configuration/domains"
import type { ConfigurationValidationIssue } from "@/lib/business-configuration/types"
import type { LegalDocumentKind } from "./types"

export interface LegalAdminTranslation {
  id: string
  locale: string
  title: string
  canonicalContent: string
  contentHash: string
  validationStatus: string
}

export interface LegalAdminDocument {
  id: string
  type: LegalDocumentKind
  versionNumber: number
  versionLabel: string
  status: string
  revision: number
  primaryLocale?: string
  validationStatus: string
  changeSummary: string
  manifestHash?: string
  publishedAt?: string
  publishedBy?: string
  updatedAt: string
  updatedBy: string
  translations: LegalAdminTranslation[]
  configurationUsage: number
}

export interface LegalAcceptanceDraft {
  id: string
  versionNumber: number
  revision: number
  status: string
  validationStatus: string
  changeSummary: string
  configuration: LegalAcceptanceConfiguration
}

export interface LegalAdministrationPageData {
  supportedLocales: string[]
  documents: LegalAdminDocument[]
  draftAcceptance?: LegalAcceptanceDraft
  liveAcceptance?: LegalAcceptanceDraft
  issues: ConfigurationValidationIssue[]
}
