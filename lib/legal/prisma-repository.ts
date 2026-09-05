import { Prisma, type PrismaClient } from "@prisma/client"
import { CAPABILITIES, type Capability } from "@/lib/authorization/capabilities"
import { databaseUserHasCapability } from "@/lib/authorization/database-capabilities"
import type { ConfigurationDbClient } from "@/lib/business-configuration/prisma-repository"
import { ConfigurationWorkflowError } from "@/lib/business-configuration/workflow-errors"
import type { LegalAcceptanceConfiguration } from "@/lib/business-configuration/domains"
import type { LegalAdministrationPageData, LegalAcceptanceDraft, LegalAdminDocument } from "./admin-types"
import type { LegalDocumentKind, LegalTranslationInput } from "./types"
import { safeLegalValidationSnapshot, validateLegalDraft } from "./validation"

const actor = (user: { name: string | null; email: string } | null | undefined) => user?.name || user?.email || "Unknown administrator"

async function requireCapability(db: ConfigurationDbClient, actorId: string, capability: Capability) {
  if (!(await databaseUserHasCapability(db, actorId, capability))) throw new ConfigurationWorkflowError("CAPABILITY_REQUIRED", "Legal administration capability is required.", "AUTHORIZATION")
}

async function audit(db: ConfigurationDbClient, input: { actorId: string; action: string; targetType: string; targetId: string; before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue; releaseId?: string }) {
  await db.auditEvent.create({ data: { actorUserId: input.actorId, category: "LEGAL", action: input.action, targetType: input.targetType, targetId: input.targetId, configurationReleaseId: input.releaseId, beforeSummary: input.before, afterSummary: input.after } })
}

const documentInclude = {
  createdBy: { select: { name: true, email: true } },
  updatedBy: { select: { name: true, email: true } },
  publishedBy: { select: { name: true, email: true } },
  translations: { orderBy: { locale: "asc" as const } },
  _count: { select: { termsPolicies: true, privacyPolicies: true } },
} satisfies Prisma.LegalDocumentVersionInclude

type DocumentRow = Prisma.LegalDocumentVersionGetPayload<{ include: typeof documentInclude }>

function mapDocument(row: DocumentRow): LegalAdminDocument {
  return { id: row.id, type: row.type, versionNumber: row.versionNumber, versionLabel: row.versionLabel, status: row.status, revision: row.revision, primaryLocale: row.primaryLocale ?? undefined, validationStatus: row.validationStatus, changeSummary: row.changeSummary, manifestHash: row.manifestHash ?? undefined, publishedAt: row.publishedAt?.toISOString(), publishedBy: actor(row.publishedBy), updatedAt: row.updatedAt.toISOString(), updatedBy: actor(row.updatedBy), translations: row.translations.map(({ id, locale, title, canonicalContent, contentHash, validationStatus }) => ({ id, locale, title, canonicalContent, contentHash, validationStatus })), configurationUsage: row._count.termsPolicies + row._count.privacyPolicies }
}

function mapAcceptance(row: Prisma.ConfigurationVersionGetPayload<{ include: { legalAcceptance: { include: { termsDocument: { include: { translations: true } }; privacyDocument: { include: { translations: true } }; translations: true } } } }>): LegalAcceptanceDraft | undefined {
  if (!row.legalAcceptance) return undefined
  const config = row.legalAcceptance
  const reference = (document: typeof config.termsDocument) => ({ id: document.id, type: document.type, publicationStatus: document.status as "PUBLISHED" | "ARCHIVED", availableLocales: document.translations.map(({ locale }) => locale), contentHash: document.manifestHash ?? document.translations[0]?.contentHash ?? "" })
  return { id: row.id, versionNumber: row.versionNumber, revision: row.revision, status: row.status, validationStatus: row.validationStatus, changeSummary: row.changeSummary, configuration: { termsDocument: reference(config.termsDocument), privacyDocument: reference(config.privacyDocument), termsAcceptance: config.termsAcceptance, privacyAcknowledgment: config.privacyAcknowledgment, retainRenderedSnapshot: config.retainContentSnapshot, bookingEnforcementEnabled: config.bookingEnforcementEnabled, requiredLocales: config.requiredLocales, termsPresentation: config.termsPresentation, privacyPresentation: config.privacyPresentation, showInConfirmation: config.showInConfirmation, translations: config.translations.map(({ locale, termsCheckboxLabel, termsLinkLabel, privacyCheckboxLabel, privacyLinkLabel }) => ({ locale, termsCheckboxLabel: termsCheckboxLabel ?? undefined, termsLinkLabel, privacyCheckboxLabel: privacyCheckboxLabel ?? undefined, privacyLinkLabel })) } }
}

const acceptanceInclude = { legalAcceptance: { include: { termsDocument: { include: { translations: true } }, privacyDocument: { include: { translations: true } }, translations: true } } } as const

export class PrismaLegalRepository {
  constructor(readonly db: ConfigurationDbClient) {}

  async loadPageData(): Promise<LegalAdministrationPageData> {
    const [documents, draftConfig] = await Promise.all([
      this.db.legalDocumentVersion.findMany({ include: documentInclude, orderBy: [{ type: "asc" }, { versionNumber: "desc" }] }),
      this.db.configurationVersion.findFirst({ where: { domain: "LEGAL_ACCEPTANCE", status: { in: ["DRAFT", "VALIDATED"] } }, include: acceptanceInclude, orderBy: { updatedAt: "desc" } }),
    ])
    const [activeRelease, draftRelease] = await Promise.all([
      this.db.businessConfigurationRelease.findFirst({ where: { status: "ACTIVE" }, include: { generalRentalConfig: true, legalAcceptanceConfig: { include: { version: { include: acceptanceInclude }, termsDocument: { include: { translations: true } }, privacyDocument: { include: { translations: true } }, translations: true } } } }),
      this.db.businessConfigurationRelease.findFirst({ where: { status: { in: ["DRAFT", "VALIDATED"] } }, include: { generalRentalConfig: true }, orderBy: { updatedAt: "desc" } }),
    ])
    const supportedLocales = draftRelease?.generalRentalConfig.supportedLocales ?? activeRelease?.generalRentalConfig.supportedLocales ?? ["en"]
    return { supportedLocales, documents: documents.map(mapDocument), draftAcceptance: draftConfig ? mapAcceptance(draftConfig) : undefined, liveAcceptance: activeRelease ? mapAcceptance(activeRelease.legalAcceptanceConfig.version) : undefined, issues: [] }
  }

  createDocumentDraft(input: { actorId: string; type: LegalDocumentKind; primaryLocale: string; changeSummary: string; sourceDocumentId?: string; client: PrismaClient }) {
    return input.client.$transaction(async (tx) => {
      await requireCapability(tx, input.actorId, CAPABILITIES.LEGAL_EDIT)
      const existing = await tx.legalDocumentVersion.findFirst({ where: { type: input.type, status: "DRAFT" } })
      if (existing) return existing.id
      const source = input.sourceDocumentId ? await tx.legalDocumentVersion.findFirst({ where: { id: input.sourceDocumentId, type: input.type, status: "PUBLISHED" }, include: { translations: true } }) : null
      const next = (await tx.legalDocumentVersion.aggregate({ where: { type: input.type }, _max: { versionNumber: true } }))._max.versionNumber ?? 0
      const translations: LegalTranslationInput[] = source?.translations.map(({ locale, title, canonicalContent }) => ({ locale, title, canonicalContent })) ?? [{ locale: input.primaryLocale, title: "", canonicalContent: "" }]
      const created = await tx.legalDocumentVersion.create({ data: { type: input.type, versionNumber: next + 1, versionLabel: `v${next + 1}`, primaryLocale: input.primaryLocale, changeSummary: input.changeSummary, createdById: input.actorId, updatedById: input.actorId, translations: { create: translations.map(({ locale, title, canonicalContent }) => ({ locale, title, canonicalContent, contentHash: "0".repeat(64) })) } } })
      await audit(tx, { actorId: input.actorId, action: "legal.draft_created", targetType: "LegalDocumentVersion", targetId: created.id, after: { type: input.type, versionNumber: next + 1, languages: translations.map(({ locale }) => locale), sourceDocumentId: source?.id } })
      return created.id
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  updateDocumentDraft(input: { actorId: string; documentId: string; expectedRevision: number; primaryLocale: string; changeSummary: string; translations: LegalTranslationInput[]; client: PrismaClient }) {
    return input.client.$transaction(async (tx) => {
      await requireCapability(tx, input.actorId, CAPABILITIES.LEGAL_EDIT)
      const locked = await tx.legalDocumentVersion.updateMany({ where: { id: input.documentId, status: "DRAFT", revision: input.expectedRevision }, data: { revision: { increment: 1 }, primaryLocale: input.primaryLocale, changeSummary: input.changeSummary, validationStatus: "NOT_VALIDATED", validationSnapshot: Prisma.JsonNull, validatedById: null, validatedAt: null, updatedById: input.actorId } })
      if (locked.count !== 1) throw new ConfigurationWorkflowError("LEGAL_VERSION_CONFLICT", "This legal draft changed while you were editing it.", "CONFLICT")
      await tx.legalDocumentTranslation.deleteMany({ where: { legalDocumentVersionId: input.documentId } })
      await tx.legalDocumentTranslation.createMany({ data: input.translations.map(({ locale, title, canonicalContent }) => ({ legalDocumentVersionId: input.documentId, locale, title, canonicalContent, contentHash: "0".repeat(64) })) })
      await audit(tx, { actorId: input.actorId, action: "legal.draft_edited", targetType: "LegalDocumentVersion", targetId: input.documentId, before: { revision: input.expectedRevision }, after: { revision: input.expectedRevision + 1, languages: input.translations.map(({ locale }) => locale), changedFields: ["primaryLocale", "changeSummary", "translations"] } })
      return { revision: input.expectedRevision + 1 }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async discardDocumentDraft(input: { actorId: string; documentId: string; expectedRevision: number; client: PrismaClient }) {
    return input.client.$transaction(async (tx) => {
      await requireCapability(tx, input.actorId, CAPABILITIES.LEGAL_EDIT)
      const draft = await tx.legalDocumentVersion.findFirst({ where: { id: input.documentId, status: "DRAFT", revision: input.expectedRevision } })
      if (!draft) throw new ConfigurationWorkflowError("LEGAL_VERSION_CONFLICT", "This legal draft changed before discard.", "CONFLICT")
      await tx.legalDocumentVersion.delete({ where: { id: input.documentId } })
      await audit(tx, { actorId: input.actorId, action: "legal.draft_discarded", targetType: "LegalDocumentVersion", targetId: input.documentId, before: { type: draft.type, versionNumber: draft.versionNumber } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  validateDocumentDraft(input: { actorId: string; documentId: string; expectedRevision: number; supportedLocales: string[]; requiredLocales: string[]; client: PrismaClient }) {
    return input.client.$transaction(async (tx) => {
      await requireCapability(tx, input.actorId, CAPABILITIES.CONFIGURATION_VALIDATE)
      const draft = await tx.legalDocumentVersion.findFirst({ where: { id: input.documentId, status: "DRAFT", revision: input.expectedRevision }, include: { translations: true } })
      if (!draft) throw new ConfigurationWorkflowError("LEGAL_VERSION_CONFLICT", "This legal draft changed before validation.", "CONFLICT")
      const result = validateLegalDraft({ primaryLocale: draft.primaryLocale ?? undefined, supportedLocales: input.supportedLocales, requiredLocales: input.requiredLocales, translations: draft.translations })
      const now = new Date()
      for (const translation of result.translations) await tx.legalDocumentTranslation.update({ where: { legalDocumentVersionId_locale: { legalDocumentVersionId: draft.id, locale: translation.locale } }, data: { title: translation.title, canonicalContent: translation.canonicalContent, sanitizedHtml: translation.sanitizedHtml, contentHash: translation.contentHash, validationStatus: result.issues.some((issue) => issue.affectedResource === translation.locale && issue.severity === "BLOCKER") ? "BLOCKED" : result.issues.some((issue) => issue.affectedResource === translation.locale) ? "WARNING" : "VALID", validationSnapshot: safeLegalValidationSnapshot({ ...result, issues: result.issues.filter((issue) => issue.affectedResource === translation.locale) }) as Prisma.InputJsonValue } })
      await tx.legalDocumentVersion.update({ where: { id: draft.id }, data: { revision: { increment: 1 }, validationStatus: result.outcome, validationSnapshot: safeLegalValidationSnapshot(result) as Prisma.InputJsonValue, validatedById: input.actorId, validatedAt: now, manifestHash: result.manifestHash, updatedById: input.actorId } })
      await audit(tx, { actorId: input.actorId, action: "legal.validation_run", targetType: "LegalDocumentVersion", targetId: draft.id, after: { outcome: result.outcome, issueCodes: result.issues.map(({ code }) => code), languages: result.translations.map(({ locale }) => locale) } })
      return result
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  publishDocument(input: { actorId: string; documentId: string; expectedRevision: number; supportedLocales: string[]; requiredLocales: string[]; warningsAcknowledged: boolean; client: PrismaClient }) {
    return input.client.$transaction(async (tx) => {
      await requireCapability(tx, input.actorId, CAPABILITIES.LEGAL_PUBLISH)
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`legal-publication:${input.documentId}`}))::text AS locked`
      const draft = await tx.legalDocumentVersion.findFirst({ where: { id: input.documentId }, include: { translations: true } })
      if (!draft) throw new ConfigurationWorkflowError("LEGAL_PUBLICATION_NOT_FOUND", "Legal draft not found.", "VALIDATION")
      if (draft.status !== "DRAFT") throw new ConfigurationWorkflowError("LEGAL_ALREADY_PUBLISHED", "This legal version is already immutable.", "CONFLICT")
      if (draft.revision !== input.expectedRevision) throw new ConfigurationWorkflowError("LEGAL_VERSION_CONFLICT", "This legal draft changed before publication.", "CONFLICT")
      const result = validateLegalDraft({ primaryLocale: draft.primaryLocale ?? undefined, supportedLocales: input.supportedLocales, requiredLocales: input.requiredLocales, translations: draft.translations })
      if (result.outcome === "BLOCKED") throw new ConfigurationWorkflowError("RELEASE_INVALID", "Legal publication has validation blockers.", "VALIDATION")
      if (result.outcome === "WARNING" && !input.warningsAcknowledged) throw new ConfigurationWorkflowError("RELEASE_INVALID", "Legal publication warnings require acknowledgement.", "VALIDATION")
      const now = new Date()
      for (const translation of result.translations) await tx.legalDocumentTranslation.update({ where: { legalDocumentVersionId_locale: { legalDocumentVersionId: draft.id, locale: translation.locale } }, data: { title: translation.title, canonicalContent: translation.canonicalContent, sanitizedHtml: translation.sanitizedHtml, contentHash: translation.contentHash, validationStatus: result.outcome === "WARNING" ? "WARNING" : "VALID", validationSnapshot: safeLegalValidationSnapshot({ ...result, issues: result.issues.filter((issue) => issue.affectedResource === translation.locale) }) as Prisma.InputJsonValue } })
      const published = await tx.legalDocumentVersion.update({ where: { id: draft.id }, data: { status: "PUBLISHED", revision: { increment: 1 }, manifestHash: result.manifestHash, validationStatus: result.outcome, validationSnapshot: safeLegalValidationSnapshot(result) as Prisma.InputJsonValue, validatedById: input.actorId, validatedAt: now, publishedById: input.actorId, publishedAt: now, updatedById: input.actorId } })
      await audit(tx, { actorId: input.actorId, action: "legal.version_published", targetType: "LegalDocumentVersion", targetId: draft.id, after: { type: draft.type, versionNumber: draft.versionNumber, languages: result.translations.map(({ locale }) => locale), manifestHash: result.manifestHash } })
      return published
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  archiveDocument(input: { actorId: string; documentId: string; client: PrismaClient }) {
    return input.client.$transaction(async (tx) => {
      await requireCapability(tx, input.actorId, CAPABILITIES.LEGAL_PUBLISH)
      const document = await tx.legalDocumentVersion.findFirst({ where: { id: input.documentId, status: "PUBLISHED" } })
      if (!document) throw new ConfigurationWorkflowError("LEGAL_PUBLICATION_NOT_FOUND", "Published legal version not found.", "VALIDATION")
      const activeUsage = await tx.businessConfigurationRelease.count({
        where: {
          status: "ACTIVE",
          legalAcceptanceConfig: {
            OR: [{ termsDocumentVersionId: document.id }, { privacyDocumentVersionId: document.id }],
          },
        },
      })
      if (activeUsage)
        throw new ConfigurationWorkflowError(
          "LEGAL_PUBLICATION_IN_USE",
          "This publication is used by the active release and cannot be archived.",
          "CONFLICT",
        )
      await tx.legalDocumentVersion.update({ where: { id: document.id }, data: { status: "ARCHIVED", archivedAt: new Date() } })
      await audit(tx, { actorId: input.actorId, action: "legal.version_archived", targetType: "LegalDocumentVersion", targetId: document.id, before: { status: "PUBLISHED" }, after: { status: "ARCHIVED", versionNumber: document.versionNumber } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async createAcceptanceDraft(input: { actorId: string; source: "LIVE" | "DEFAULT"; client: PrismaClient }) {
    return input.client.$transaction(async (tx) => {
      await requireCapability(tx, input.actorId, CAPABILITIES.LEGAL_EDIT)
      const existing = await tx.configurationVersion.findFirst({ where: { domain: "LEGAL_ACCEPTANCE", status: { in: ["DRAFT", "VALIDATED"] } } })
      if (existing) return existing.id
      const active = await tx.businessConfigurationRelease.findFirst({ where: { status: "ACTIVE" }, include: { generalRentalConfig: true, legalAcceptanceConfig: { include: { translations: true } } } })
      const terms = await tx.legalDocumentVersion.findFirst({ where: { type: "RENTAL_TERMS", status: "PUBLISHED" }, orderBy: { versionNumber: "desc" } })
      const privacy = await tx.legalDocumentVersion.findFirst({ where: { type: "PRIVACY_NOTICE", status: "PUBLISHED" }, orderBy: { versionNumber: "desc" } })
      const source = input.source === "LIVE" ? active?.legalAcceptanceConfig : undefined
      const termsId = source?.termsDocumentVersionId ?? terms?.id
      const privacyId = source?.privacyDocumentVersionId ?? privacy?.id
      if (!termsId || !privacyId) throw new ConfigurationWorkflowError("LEGAL_PUBLICATION_NOT_FOUND", "Publish Rental Terms and a Privacy Notice before creating the legal policy draft.", "VALIDATION")
      const locales = active?.generalRentalConfig.supportedLocales ?? ["en"]
      const next = (await tx.configurationVersion.aggregate({ where: { domain: "LEGAL_ACCEPTANCE" }, _max: { versionNumber: true } }))._max.versionNumber ?? 0
      const created = await tx.configurationVersion.create({ data: { domain: "LEGAL_ACCEPTANCE", versionNumber: next + 1, changeSummary: "Legal acceptance update", createdById: input.actorId, updatedById: input.actorId, legalAcceptance: { create: { termsDocumentVersionId: termsId, privacyDocumentVersionId: privacyId, termsAcceptance: source?.termsAcceptance ?? "REQUIRED", privacyAcknowledgment: source?.privacyAcknowledgment ?? "REQUIRED", retainContentSnapshot: source?.retainContentSnapshot ?? true, bookingEnforcementEnabled: false, requiredLocales: [], termsPresentation: source?.termsPresentation ?? "DIALOG", privacyPresentation: source?.privacyPresentation ?? "DIALOG", showInConfirmation: source?.showInConfirmation ?? true, translations: { create: locales.map((locale) => locale === "de" ? { locale, termsCheckboxLabel: "Ich erkenne die Mietbedingungen an.", termsLinkLabel: "Mietbedingungen", privacyCheckboxLabel: "Ich habe den Datenschutzhinweis gelesen.", privacyLinkLabel: "Datenschutzhinweis" } : { locale, termsCheckboxLabel: "I acknowledge the Rental Terms.", termsLinkLabel: "Rental Terms", privacyCheckboxLabel: "I have read the Privacy Notice.", privacyLinkLabel: "Privacy Notice" }) } } } } })
      await audit(tx, { actorId: input.actorId, action: "legal_acceptance.draft_created", targetType: "ConfigurationVersion", targetId: created.id, after: { versionNumber: next + 1, enforcementEnabled: false } })
      return created.id
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  updateAcceptanceDraft(input: { actorId: string; versionId: string; expectedRevision: number; changeSummary: string; configuration: LegalAcceptanceConfiguration; client: PrismaClient }) {
    return input.client.$transaction(async (tx) => {
      await requireCapability(tx, input.actorId, CAPABILITIES.LEGAL_EDIT)
      const locked = await tx.configurationVersion.updateMany({ where: { id: input.versionId, domain: "LEGAL_ACCEPTANCE", revision: input.expectedRevision, status: { in: ["DRAFT", "VALIDATED"] } }, data: { revision: { increment: 1 }, status: "DRAFT", validationStatus: "NOT_VALIDATED", validationSnapshot: Prisma.JsonNull, changeSummary: input.changeSummary, updatedById: input.actorId } })
      if (locked.count !== 1) throw new ConfigurationWorkflowError("LEGAL_VERSION_CONFLICT", "This legal acceptance draft changed while you were editing it.", "CONFLICT")
      const config = input.configuration
      await tx.legalAcceptanceConfigVersion.update({ where: { configurationVersionId: input.versionId }, data: { termsDocumentVersionId: config.termsDocument.id, privacyDocumentVersionId: config.privacyDocument.id, termsAcceptance: config.termsAcceptance, privacyAcknowledgment: config.privacyAcknowledgment, retainContentSnapshot: config.retainRenderedSnapshot, bookingEnforcementEnabled: config.bookingEnforcementEnabled, requiredLocales: config.requiredLocales, termsPresentation: config.termsPresentation, privacyPresentation: config.privacyPresentation, showInConfirmation: config.showInConfirmation } })
      await tx.legalAcceptanceTranslation.deleteMany({ where: { legalAcceptanceConfigVersionId: input.versionId } })
      await tx.legalAcceptanceTranslation.createMany({ data: config.translations.map((translation) => ({ legalAcceptanceConfigVersionId: input.versionId, ...translation })) })
      await audit(tx, { actorId: input.actorId, action: "legal_acceptance.configuration_changed", targetType: "ConfigurationVersion", targetId: input.versionId, before: { revision: input.expectedRevision }, after: { revision: input.expectedRevision + 1, enforcementEnabled: config.bookingEnforcementEnabled, requiredLocales: config.requiredLocales, changedFields: ["documents", "requirements", "presentation", "labels", "confirmation"] } })
      return { revision: input.expectedRevision + 1 }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  persistAcceptanceValidation(input: { actorId: string; versionId: string; expectedRevision: number; outcome: "VALID" | "WARNING" | "BLOCKED"; snapshot: Prisma.InputJsonValue; client: PrismaClient }) {
    return input.client.$transaction(async (tx) => {
      await requireCapability(tx, input.actorId, CAPABILITIES.CONFIGURATION_VALIDATE)
      const updated = await tx.configurationVersion.updateMany({ where: { id: input.versionId, domain: "LEGAL_ACCEPTANCE", revision: input.expectedRevision, status: { in: ["DRAFT", "VALIDATED"] } }, data: { revision: { increment: 1 }, status: input.outcome === "BLOCKED" ? "DRAFT" : "VALIDATED", validationStatus: input.outcome, validationSnapshot: input.snapshot, validatedById: input.actorId, validatedAt: new Date(), updatedById: input.actorId } })
      if (updated.count !== 1) throw new ConfigurationWorkflowError("LEGAL_VERSION_CONFLICT", "The legal acceptance draft changed during validation.", "CONFLICT")
      await audit(tx, { actorId: input.actorId, action: "legal_acceptance.validation_run", targetType: "ConfigurationVersion", targetId: input.versionId, after: { outcome: input.outcome } })
      return { revision: input.expectedRevision + 1 }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  attachAcceptanceDraft(input: { actorId: string; versionId: string; expectedReleaseRevision?: number; client: PrismaClient }) {
    return input.client.$transaction(async (tx) => {
      await requireCapability(tx, input.actorId, CAPABILITIES.CONFIGURATION_EDIT)
      const version = await tx.configurationVersion.findFirst({ where: { id: input.versionId, domain: "LEGAL_ACCEPTANCE", status: { in: ["DRAFT", "VALIDATED"] } } })
      if (!version) throw new ConfigurationWorkflowError("LEGAL_ACCEPTANCE_CONFIG_MISSING", "A legal acceptance draft is required.", "VALIDATION")
      const draft = await tx.businessConfigurationRelease.findFirst({ where: { status: { in: ["DRAFT", "VALIDATED"] } }, orderBy: { updatedAt: "desc" } })
      if (!draft) throw new ConfigurationWorkflowError("RELEASE_INCOMPLETE", "Create a release draft from the Overview before attaching legal acceptance.", "VALIDATION")
      if (input.expectedReleaseRevision !== undefined && draft.revision !== input.expectedReleaseRevision) throw new ConfigurationWorkflowError("OPTIMISTIC_LOCK_FAILED", "The release draft changed.", "CONFLICT")
      const updated = await tx.businessConfigurationRelease.updateMany({ where: { id: draft.id, revision: draft.revision }, data: { legalAcceptanceConfigVersionId: input.versionId, status: "DRAFT", validationStatus: "NOT_VALIDATED", validationSnapshot: Prisma.JsonNull, revision: { increment: 1 }, updatedById: input.actorId } })
      if (updated.count !== 1) throw new ConfigurationWorkflowError("OPTIMISTIC_LOCK_FAILED", "The release draft changed.", "CONFLICT")
      await audit(tx, { actorId: input.actorId, action: "legal_acceptance.draft_attached_to_release", targetType: "BusinessConfigurationRelease", targetId: draft.id, releaseId: draft.id, after: { legalAcceptanceConfigVersionId: input.versionId } })
      return { releaseId: draft.id }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }
}
