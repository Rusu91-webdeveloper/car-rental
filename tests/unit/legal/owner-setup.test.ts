import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PrismaClient } from "@prisma/client"
import type { LegalAcceptanceConfiguration } from "@/lib/business-configuration/domains"
import type { LegalAdministrationPageData, LegalAdminDocument } from "@/lib/legal/admin-types"

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  createAcceptance: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  publishDocument: vi.fn(),
  updateAcceptance: vi.fn(),
  validateAcceptance: vi.fn(),
  attachAcceptance: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/legal/service", () => ({
  loadLegalAdministrationPage: mocks.load,
  createLegalAcceptanceDraft: mocks.createAcceptance,
  createLegalDraft: mocks.createDocument,
  updateLegalDraft: mocks.updateDocument,
  publishLegalVersion: mocks.publishDocument,
  updateLegalAcceptanceDraft: mocks.updateAcceptance,
  validateLegalAcceptanceDraft: mocks.validateAcceptance,
  attachLegalDraftToRelease: mocks.attachAcceptance,
}))

import { saveOwnerLegalSetup } from "@/lib/legal/owner-setup"
import { ownerLegalSetupSchema } from "@/lib/legal/owner-setup-schema"

const meaningful =
  "This approved wording explains the booking, payment, vehicle use, customer duties, cancellation, return, and data handling rules."

function document(
  id: string,
  type: "RENTAL_TERMS" | "PRIVACY_NOTICE",
): LegalAdminDocument {
  return {
    id,
    type,
    versionNumber: 1,
    versionLabel: "v1",
    status: "DRAFT",
    revision: 1,
    primaryLocale: "en",
    validationStatus: "NOT_VALIDATED",
    changeSummary: "Owner setup",
    updatedAt: new Date(0).toISOString(),
    updatedBy: "Owner",
    translations: [
      { id: `${id}-en`, locale: "en", title: "Title", canonicalContent: meaningful, contentHash: "0".repeat(64), validationStatus: "NOT_VALIDATED" },
      { id: `${id}-de`, locale: "de", title: "Titel", canonicalContent: meaningful, contentHash: "0".repeat(64), validationStatus: "NOT_VALIDATED" },
    ],
    configurationUsage: 0,
  }
}

function agreementConfiguration(terms: LegalAdminDocument, privacy: LegalAdminDocument) {
  return {
    termsDocument: { id: terms.id, type: "RENTAL_TERMS" as const, publicationStatus: "DRAFT" as never, availableLocales: ["en", "de"], contentHash: "0".repeat(64) },
    privacyDocument: { id: privacy.id, type: "PRIVACY_NOTICE" as const, publicationStatus: "DRAFT" as never, availableLocales: ["en", "de"], contentHash: "0".repeat(64) },
    termsAcceptance: "REQUIRED" as const,
    privacyAcknowledgment: "REQUIRED" as const,
    retainRenderedSnapshot: true,
    bookingEnforcementEnabled: false,
    requiredLocales: [],
    termsPresentation: "DIALOG" as const,
    privacyPresentation: "DIALOG" as const,
    showInConfirmation: true,
    translations: [],
  } satisfies LegalAcceptanceConfiguration
}

describe("owner bilingual legal setup", () => {
  let terms: LegalAdminDocument
  let privacy: LegalAdminDocument
  let page: LegalAdministrationPageData

  beforeEach(() => {
    vi.clearAllMocks()
    terms = document("terms-draft", "RENTAL_TERMS")
    privacy = document("privacy-draft", "PRIVACY_NOTICE")
    page = {
      supportedLocales: ["en", "de"],
      documents: [terms, privacy],
      draftAcceptance: {
        id: "acceptance-draft",
        versionNumber: 1,
        revision: 1,
        status: "DRAFT",
        validationStatus: "NOT_VALIDATED",
        changeSummary: "Owner setup",
        configuration: agreementConfiguration(terms, privacy),
      },
      issues: [],
    }
    mocks.load.mockImplementation(async () => page)
    mocks.updateDocument.mockImplementation(async ({ documentId }: { documentId: string }) => {
      const current = page.documents.find(({ id }) => id === documentId)!
      current.revision += 1
      return { revision: current.revision }
    })
    mocks.publishDocument.mockImplementation(async ({ documentId }: { documentId: string }) => {
      const current = page.documents.find(({ id }) => id === documentId)!
      current.status = "PUBLISHED"
      current.revision += 1
      current.manifestHash = current.type === "RENTAL_TERMS" ? "a".repeat(64) : "b".repeat(64)
      return current
    })
    mocks.updateAcceptance.mockResolvedValue({ revision: 2 })
    mocks.validateAcceptance.mockResolvedValue({ outcome: "VALID", issues: [] })
    mocks.attachAcceptance.mockResolvedValue({ releaseId: "release-draft" })
  })

  it("publishes both languages before validating and attaching the customer agreement", async () => {
    const value = ownerLegalSetupSchema.parse({
      rentalTerms: { id: terms.id, revision: terms.revision, translations: terms.translations },
      privacyNotice: { id: privacy.id, revision: privacy.revision, translations: privacy.translations },
      agreement: {
        requireAgreement: true,
        translations: [
          { locale: "en", termsCheckboxLabel: "I agree to the Rental Terms.", termsLinkLabel: "Rental Terms", privacyCheckboxLabel: "I have read the Privacy Notice.", privacyLinkLabel: "Privacy Notice" },
          { locale: "de", termsCheckboxLabel: "Ich stimme den Mietbedingungen zu.", termsLinkLabel: "Mietbedingungen", privacyCheckboxLabel: "Ich habe die Datenschutzerklärung gelesen.", privacyLinkLabel: "Datenschutzerklärung" },
        ],
      },
    })

    await saveOwnerLegalSetup({ actorId: "owner", value, db: {} as PrismaClient })

    expect(mocks.publishDocument).toHaveBeenCalledTimes(2)
    expect(mocks.updateAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId: "acceptance-draft",
        configuration: expect.objectContaining({
          bookingEnforcementEnabled: true,
          requiredLocales: ["en", "de"],
          termsDocument: expect.objectContaining({ publicationStatus: "PUBLISHED" }),
          privacyDocument: expect.objectContaining({ publicationStatus: "PUBLISHED" }),
        }),
      }),
    )
    expect(mocks.publishDocument.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.updateAcceptance.mock.invocationCallOrder[0],
    )
    expect(mocks.updateAcceptance.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.validateAcceptance.mock.invocationCallOrder[0],
    )
    expect(mocks.validateAcceptance.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.attachAcceptance.mock.invocationCallOrder[0],
    )
  })

  it("requires complete English and German content", () => {
    const parsed = ownerLegalSetupSchema.safeParse({
      rentalTerms: { id: terms.id, revision: 1, translations: [terms.translations[0]] },
      privacyNotice: { id: privacy.id, revision: 1, translations: privacy.translations },
      agreement: { requireAgreement: true, translations: [] },
    })
    expect(parsed.success).toBe(false)
  })
})
