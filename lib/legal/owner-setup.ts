import type { PrismaClient } from "@prisma/client"
import type { LegalAcceptanceConfiguration } from "@/lib/business-configuration/domains"
import { prisma } from "@/lib/db"
import {
  attachLegalDraftToRelease,
  createLegalAcceptanceDraft,
  createLegalDraft,
  loadLegalAdministrationPage,
  publishLegalVersion,
  updateLegalAcceptanceDraft,
  updateLegalDraft,
  validateLegalAcceptanceDraft,
} from "./service"
import { normalizeCanonicalLegalText } from "./content"
import type { LegalAdminDocument } from "./admin-types"
import { OWNER_LEGAL_LOCALES, type OwnerLegalSetupInput } from "./owner-setup-schema"

export class OwnerLegalSetupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OwnerLegalSetupError"
  }
}

function documentMatchesInput(
  document: LegalAdminDocument,
  input: OwnerLegalSetupInput["rentalTerms"],
) {
  return OWNER_LEGAL_LOCALES.every((locale) => {
    const saved = document.translations.find((translation) => translation.locale === locale)
    const next = input.translations.find((translation) => translation.locale === locale)
    return Boolean(
      saved &&
        next &&
        saved.title.trim() === next.title.trim() &&
        normalizeCanonicalLegalText(saved.canonicalContent) ===
          normalizeCanonicalLegalText(next.canonicalContent),
    )
  })
}

async function publishOwnerDocument(input: {
  actorId: string
  type: "RENTAL_TERMS" | "PRIVACY_NOTICE"
  value: OwnerLegalSetupInput["rentalTerms"]
  supportedLocales: string[]
  db: PrismaClient
}) {
  let page = await loadLegalAdministrationPage(input.db)
  let document = page.documents.find(
    (candidate) => candidate.id === input.value.id && candidate.type === input.type,
  )
  if (!document) throw new OwnerLegalSetupError("This legal document changed. Reload Step 10 and try again.")

  if (document.status === "PUBLISHED" && documentMatchesInput(document, input.value)) {
    return document
  }

  if (document.status === "PUBLISHED") {
    const draftId = await createLegalDraft({
      actorId: input.actorId,
      type: input.type,
      primaryLocale: "en",
      changeSummary: `${input.type === "RENTAL_TERMS" ? "Rental Terms" : "Privacy Notice"} update`,
      sourceDocumentId: document.id,
      db: input.db,
    })
    page = await loadLegalAdministrationPage(input.db)
    document = page.documents.find((candidate) => candidate.id === draftId)
  }

  if (!document || document.status !== "DRAFT") {
    throw new OwnerLegalSetupError("This legal document is no longer editable. Reload Step 10 and try again.")
  }

  const updated = await updateLegalDraft({
    actorId: input.actorId,
    documentId: document.id,
    expectedRevision: document.revision,
    primaryLocale: "en",
    changeSummary: `${input.type === "RENTAL_TERMS" ? "Rental Terms" : "Privacy Notice"} update`,
    translations: input.value.translations,
    db: input.db,
  })
  await publishLegalVersion({
    actorId: input.actorId,
    documentId: document.id,
    expectedRevision: updated.revision,
    supportedLocales: input.supportedLocales,
    requiredLocales: [...OWNER_LEGAL_LOCALES],
    warningsAcknowledged: true,
    db: input.db,
  })

  const published = (await loadLegalAdministrationPage(input.db)).documents.find(
    (candidate) => candidate.id === document!.id && candidate.status === "PUBLISHED",
  )
  if (!published) throw new OwnerLegalSetupError("The legal document could not be published. Please try again.")
  return published
}

function documentReference(
  document: LegalAdminDocument,
  type: "RENTAL_TERMS" | "PRIVACY_NOTICE",
) {
  if (document.status !== "PUBLISHED" || !document.manifestHash) {
    throw new OwnerLegalSetupError("Both legal documents must be ready before the customer agreement can be saved.")
  }
  return {
    id: document.id,
    type,
    publicationStatus: "PUBLISHED" as const,
    availableLocales: document.translations.map(({ locale }) => locale),
    contentHash: document.manifestHash,
  }
}

export async function saveOwnerLegalSetup(input: {
  actorId: string
  value: OwnerLegalSetupInput
  db?: PrismaClient
}) {
  const db = input.db ?? prisma
  const page = await loadLegalAdministrationPage(db)
  const missingLocale = OWNER_LEGAL_LOCALES.find((locale) => !page.supportedLocales.includes(locale))
  if (missingLocale) {
    throw new OwnerLegalSetupError(
      "English and German must both be enabled in Business details before completing Legal terms.",
    )
  }

  const terms = await publishOwnerDocument({
    actorId: input.actorId,
    type: "RENTAL_TERMS",
    value: input.value.rentalTerms,
    supportedLocales: page.supportedLocales,
    db,
  })
  const privacy = await publishOwnerDocument({
    actorId: input.actorId,
    type: "PRIVACY_NOTICE",
    value: input.value.privacyNotice,
    supportedLocales: page.supportedLocales,
    db,
  })

  let refreshed = await loadLegalAdministrationPage(db)
  if (!refreshed.draftAcceptance) {
    await createLegalAcceptanceDraft({
      actorId: input.actorId,
      source: refreshed.liveAcceptance ? "LIVE" : "DEFAULT",
      db,
    })
    refreshed = await loadLegalAdministrationPage(db)
  }
  const acceptance = refreshed.draftAcceptance
  if (!acceptance) throw new OwnerLegalSetupError("The customer agreement could not be prepared. Please try again.")

  const requirement = input.value.agreement.requireAgreement ? "REQUIRED" : "DISPLAY_ONLY"
  const configuration: LegalAcceptanceConfiguration = {
    termsDocument: documentReference(terms, "RENTAL_TERMS"),
    privacyDocument: documentReference(privacy, "PRIVACY_NOTICE"),
    termsAcceptance: requirement,
    privacyAcknowledgment: requirement,
    retainRenderedSnapshot: true,
    bookingEnforcementEnabled: true,
    requiredLocales: [...OWNER_LEGAL_LOCALES],
    termsPresentation: "DIALOG",
    privacyPresentation: "DIALOG",
    showInConfirmation: true,
    translations: input.value.agreement.translations,
  }
  await updateLegalAcceptanceDraft({
    actorId: input.actorId,
    versionId: acceptance.id,
    expectedRevision: acceptance.revision,
    changeSummary: "Bilingual customer legal agreement",
    configuration,
    db,
  })
  const validation = await validateLegalAcceptanceDraft({ actorId: input.actorId, db })
  const blockers = validation.issues.filter(({ severity }) => severity === "BLOCKER")
  if (blockers.length > 0) {
    throw new OwnerLegalSetupError(blockers[0]?.adminMessage ?? "Check the legal setup and try again.")
  }
  await attachLegalDraftToRelease({ actorId: input.actorId, versionId: acceptance.id, db })

  return { termsDocumentId: terms.id, privacyDocumentId: privacy.id, acceptanceVersionId: acceptance.id }
}
