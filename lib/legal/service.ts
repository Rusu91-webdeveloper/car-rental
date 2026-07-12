import { Prisma, type PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/db"
import type { LegalAcceptanceConfiguration } from "@/lib/business-configuration/domains"
import { configurationValidationResult, type ConfigurationValidationIssue } from "@/lib/business-configuration/types"
import { legalAcceptanceConfigurationSchema } from "@/lib/business-configuration/schema"
import { ConfigurationWorkflowError } from "@/lib/business-configuration/workflow-errors"
import { PrismaLegalRepository } from "./prisma-repository"
import type { LegalDocumentKind, LegalTranslationInput } from "./types"

async function mutation<T>(operation: Promise<T>) {
  try { return await operation }
  catch (error) {
    if (error instanceof ConfigurationWorkflowError) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw new ConfigurationWorkflowError("LEGAL_VERSION_CONFLICT", "The legal record changed concurrently.", "CONFLICT")
    throw error
  }
}

const legalIssue = (code: string, severity: "BLOCKER" | "WARNING" | "INFO", message: string, affectedResource?: string): ConfigurationValidationIssue => ({ code, domain: "legal-acceptance", severity, affectedResource, adminMessage: message, remediation: severity === "BLOCKER" ? "Complete the legal publication and policy before activation." : "Review this legal configuration." })

export function validateLegalAcceptanceConfiguration(configuration: LegalAcceptanceConfiguration, supportedLocales: string[]) {
  const issues: ConfigurationValidationIssue[] = []
  const parsed = legalAcceptanceConfigurationSchema.safeParse(configuration)
  if (!parsed.success) issues.push(...parsed.error.issues.map((item) => legalIssue(item.message.split(":")[0] || "LEGAL_ACCEPTANCE_CONFIG_INVALID", "BLOCKER", item.message)))
  if (!configuration.bookingEnforcementEnabled) return configurationValidationResult(issues)
  if (configuration.requiredLocales.length === 0) issues.push(legalIssue("LEGAL_PRIMARY_LANGUAGE_MISSING", "BLOCKER", "Choose at least one required legal language."))
  for (const locale of configuration.requiredLocales) {
    if (!supportedLocales.includes(locale)) issues.push(legalIssue("LEGAL_LOCALE_UNSUPPORTED", "BLOCKER", "A required legal language is not supported by the booking application.", locale))
    const labels = configuration.translations.find((item) => item.locale === locale)
    if (!labels) issues.push(legalIssue("LEGAL_TRANSLATION_MISSING", "BLOCKER", "Localized legal acceptance labels are missing.", locale))
    if (configuration.termsAcceptance !== "DISABLED" && configuration.termsDocument.publicationStatus !== "PUBLISHED") issues.push(legalIssue("LEGAL_ACCEPTANCE_PUBLICATION_INVALID", "BLOCKER", "The selected Rental Terms publication is not available for a future release.", locale))
    if (configuration.privacyAcknowledgment !== "DISABLED" && configuration.privacyDocument.publicationStatus !== "PUBLISHED") issues.push(legalIssue("LEGAL_ACCEPTANCE_PUBLICATION_INVALID", "BLOCKER", "The selected Privacy Notice publication is not available for a future release.", locale))
    if (configuration.termsAcceptance !== "DISABLED" && !configuration.termsDocument.availableLocales.includes(locale)) issues.push(legalIssue("LEGAL_REQUIRED_LANGUAGE_MISSING", "BLOCKER", "Rental Terms are missing a required booking language.", locale))
    if (configuration.privacyAcknowledgment !== "DISABLED" && !configuration.privacyDocument.availableLocales.includes(locale)) issues.push(legalIssue("LEGAL_REQUIRED_LANGUAGE_MISSING", "BLOCKER", "The Privacy Notice is missing a required booking language.", locale))
    if (configuration.termsAcceptance === "REQUIRED" && !labels?.termsCheckboxLabel?.trim()) issues.push(legalIssue("LEGAL_TRANSLATION_MISSING", "BLOCKER", "Rental Terms acknowledgement text is required.", locale))
    if (configuration.privacyAcknowledgment === "REQUIRED" && !labels?.privacyCheckboxLabel?.trim()) issues.push(legalIssue("LEGAL_TRANSLATION_MISSING", "BLOCKER", "Privacy Notice acknowledgement text is required.", locale))
  }
  if (configuration.termsAcceptance === "DISABLED" && configuration.privacyAcknowledgment === "DISABLED") issues.push(legalIssue("LEGAL_ACCEPTANCE_CONFIG_MISSING", "BLOCKER", "Enable at least one legal document or disable booking enforcement."))
  return configurationValidationResult(issues)
}

export async function loadLegalAdministrationPage(db = prisma) {
  const page = await new PrismaLegalRepository(db).loadPageData()
  if (page.draftAcceptance) page.issues.push(...validateLegalAcceptanceConfiguration(page.draftAcceptance.configuration, page.supportedLocales).issues)
  for (const draft of page.documents.filter(({ status }) => status === "DRAFT")) {
    if (draft.validationStatus === "NOT_VALIDATED") page.issues.push(legalIssue("LEGAL_DRAFT_CHANGES", "WARNING", "This legal draft has unpublished, unvalidated changes.", `${draft.type} v${draft.versionNumber}`))
  }
  for (const type of ["RENTAL_TERMS", "PRIVACY_NOTICE"] as const) if (!page.documents.some((document) => document.type === type && document.status === "PUBLISHED")) page.issues.push(legalIssue("LEGAL_DOCUMENT_NOT_PUBLISHED", "BLOCKER", `${type === "RENTAL_TERMS" ? "Rental Terms" : "Privacy Notice"} has no published version.`))
  if (!page.draftAcceptance && !page.liveAcceptance)
    page.issues.push(legalIssue("LEGAL_ACCEPTANCE_CONFIG_MISSING", "BLOCKER", "No Legal Acceptance configuration exists."))
  if (!page.issues.some(({ severity }) => severity === "BLOCKER") && page.liveAcceptance)
    page.issues.push(legalIssue("LEGAL_READY", "INFO", "Published legal documents and the live legal policy are ready for booking."))
  return page
}

export function createLegalDraft(input: { actorId: string; type: LegalDocumentKind; primaryLocale: string; changeSummary: string; sourceDocumentId?: string; db?: PrismaClient }) { return mutation(new PrismaLegalRepository(input.db ?? prisma).createDocumentDraft({ ...input, client: input.db ?? prisma })) }
export function updateLegalDraft(input: { actorId: string; documentId: string; expectedRevision: number; primaryLocale: string; changeSummary: string; translations: LegalTranslationInput[]; db?: PrismaClient }) { return mutation(new PrismaLegalRepository(input.db ?? prisma).updateDocumentDraft({ ...input, client: input.db ?? prisma })) }
export function discardLegalDraft(input: { actorId: string; documentId: string; expectedRevision: number; db?: PrismaClient }) { return mutation(new PrismaLegalRepository(input.db ?? prisma).discardDocumentDraft({ ...input, client: input.db ?? prisma })) }
export function validateLegalDocumentDraft(input: { actorId: string; documentId: string; expectedRevision: number; supportedLocales: string[]; requiredLocales: string[]; db?: PrismaClient }) { return mutation(new PrismaLegalRepository(input.db ?? prisma).validateDocumentDraft({ ...input, client: input.db ?? prisma })) }
export function publishLegalVersion(input: { actorId: string; documentId: string; expectedRevision: number; supportedLocales: string[]; requiredLocales: string[]; warningsAcknowledged: boolean; db?: PrismaClient }) { return mutation(new PrismaLegalRepository(input.db ?? prisma).publishDocument({ ...input, client: input.db ?? prisma })) }
export function archiveLegalVersion(input: { actorId: string; documentId: string; db?: PrismaClient }) { return mutation(new PrismaLegalRepository(input.db ?? prisma).archiveDocument({ ...input, client: input.db ?? prisma })) }
export function createLegalAcceptanceDraft(input: { actorId: string; source: "LIVE" | "DEFAULT"; db?: PrismaClient }) { return mutation(new PrismaLegalRepository(input.db ?? prisma).createAcceptanceDraft({ ...input, client: input.db ?? prisma })) }
export function updateLegalAcceptanceDraft(input: { actorId: string; versionId: string; expectedRevision: number; changeSummary: string; configuration: LegalAcceptanceConfiguration; db?: PrismaClient }) { return mutation(new PrismaLegalRepository(input.db ?? prisma).updateAcceptanceDraft({ ...input, client: input.db ?? prisma })) }
export async function validateLegalAcceptanceDraft(input: { actorId: string; db?: PrismaClient }) {
  const db = input.db ?? prisma; const page = await loadLegalAdministrationPage(db); const draft = page.draftAcceptance
  if (!draft) throw new ConfigurationWorkflowError("LEGAL_ACCEPTANCE_CONFIG_MISSING", "Create a legal acceptance draft first.", "VALIDATION")
  const result = validateLegalAcceptanceConfiguration(draft.configuration, page.supportedLocales)
  await mutation(new PrismaLegalRepository(db).persistAcceptanceValidation({ actorId: input.actorId, versionId: draft.id, expectedRevision: draft.revision, outcome: result.outcome, snapshot: { outcome: result.outcome, issues: result.issues.slice(0, 100).map(({ code, severity, affectedResource, field, remediation }) => ({ code, severity, locale: affectedResource, field, remediation })), validatorVersion: "legal-acceptance-v1" } as Prisma.InputJsonValue, client: db }))
  return result
}
export function attachLegalDraftToRelease(input: { actorId: string; versionId: string; expectedReleaseRevision?: number; db?: PrismaClient }) { return mutation(new PrismaLegalRepository(input.db ?? prisma).attachAcceptanceDraft({ ...input, client: input.db ?? prisma })) }
