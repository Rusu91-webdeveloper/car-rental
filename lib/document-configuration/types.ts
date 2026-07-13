export interface DocumentPolicyDraftInput {
  identityDocumentChoice:
    | "DISABLED"
    | "IDENTITY_CARD_ONLY"
    | "PASSPORT_ONLY"
    | "EITHER_IDENTITY_CARD_OR_PASSPORT"
    | "BOTH"
  retentionPreferenceDays: number
  requirements: Array<{
    documentTypeKey: "IDENTITY_CARD" | "PASSPORT" | "DRIVING_LICENCE"
    mode: "REQUIRED" | "OPTIONAL" | "DISABLED"
    fileCount: number
    sides: "SINGLE_FILE" | "FRONT_AND_BACK"
    instructions: string
  }>
}

export interface DocumentConfigurationPageData {
  active?: {
    releaseId: string
    releaseNumber: number
    versionId: string
    versionNumber: number
    validationStatus: string
    configuration: DocumentPolicyDraftInput
  }
  draftRelease?: { id: string; releaseNumber: number; revision: number }
  canEdit: boolean
  healthCodes: string[]
}
