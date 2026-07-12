import type { ConfigurationValidationIssue } from "@/lib/business-configuration/types"

export type LegalDocumentKind = "RENTAL_TERMS" | "PRIVACY_NOTICE"
export type LegalRequirementMode = "REQUIRED" | "DISPLAY_ONLY" | "DISABLED"

export interface LegalTranslationInput {
  locale: string
  title: string
  canonicalContent: string
}

export interface LegalDraftValidation {
  outcome: "VALID" | "WARNING" | "BLOCKED"
  issues: ConfigurationValidationIssue[]
  translations: Array<LegalTranslationInput & { contentHash: string; sanitizedHtml: string }>
  manifestHash?: string
}

export interface BookingLegalDocumentRequirement {
  type: LegalDocumentKind
  requirement: LegalRequirementMode
  legalDocumentVersionId: string
  legalDocumentTranslationId: string
  versionNumber: number
  versionLabel: string
  locale: string
  title: string
  canonicalContent: string
  sanitizedHtml: string
  contentHash: string
  checkboxLabel?: string
  linkLabel: string
  presentation: "INLINE" | "DIALOG"
}

export interface BookingLegalRequirements {
  configurationReleaseId: string
  legalAcceptanceConfigVersionId: string
  locale: string
  showInConfirmation: boolean
  retainContentSnapshot: boolean
  documents: BookingLegalDocumentRequirement[]
}

export interface SubmittedLegalAcknowledgements {
  rentalTerms?: boolean
  privacyNotice?: boolean
}

export interface LegalValidationIssue {
  code: string
  message: string
  locale?: string
}
