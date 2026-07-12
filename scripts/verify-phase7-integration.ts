import assert from "node:assert/strict"
import { prisma } from "../lib/db"
import {
  createLegalAcceptanceDraft,
  createLegalDraft,
  loadLegalAdministrationPage,
  publishLegalVersion,
  updateLegalAcceptanceDraft,
  updateLegalDraft,
  validateLegalAcceptanceDraft,
  validateLegalDocumentDraft,
} from "../lib/legal/service"
import { activateDraftRelease, validateDraftRelease } from "../lib/business-configuration/workflow-service"
import { createAuthoritativeBooking } from "../lib/pricing/prisma-booking-service"

const actorId = "p4-admin"
const vehicleId = "p4-car"
const content = (name: string, locale: string) =>
  `${name} (${locale}) describes the rental booking, vehicle use, customer responsibilities, return process, charges, cancellations, and applicable notices. `.repeat(4)

async function publish(type: "RENTAL_TERMS" | "PRIVACY_NOTICE") {
  const id = await createLegalDraft({ actorId, type, primaryLocale: "en", changeSummary: `Phase 7 ${type}`, db: prisma })
  await updateLegalDraft({
    actorId,
    documentId: id,
    expectedRevision: 1,
    primaryLocale: "en",
    changeSummary: `Validated ${type}`,
    translations: ["de", "en"].map((locale) => ({
      locale,
      title: type === "RENTAL_TERMS" ? `Rental Terms ${locale}` : `Privacy Notice ${locale}`,
      canonicalContent: content(type, locale),
    })),
    db: prisma,
  })
  await validateLegalDocumentDraft({ actorId, documentId: id, expectedRevision: 2, supportedLocales: ["de", "en"], requiredLocales: ["de", "en"], db: prisma })
  await publishLegalVersion({ actorId, documentId: id, expectedRevision: 3, supportedLocales: ["de", "en"], requiredLocales: ["de", "en"], warningsAcknowledged: true, db: prisma })
  return id
}

async function main() {
  const termsId = await publish("RENTAL_TERMS")
  const privacyId = await publish("PRIVACY_NOTICE")
  const legalVersionId = await createLegalAcceptanceDraft({ actorId, source: "LIVE", db: prisma })
  const page = await loadLegalAdministrationPage(prisma)
  assert(page.draftAcceptance)
  const terms = page.documents.find(({ id }) => id === termsId)!
  const privacy = page.documents.find(({ id }) => id === privacyId)!
  await updateLegalAcceptanceDraft({
    actorId,
    versionId: legalVersionId,
    expectedRevision: page.draftAcceptance.revision,
    changeSummary: "Require exact Phase 7 publications",
    configuration: {
      termsDocument: { id: terms.id, type: "RENTAL_TERMS", publicationStatus: "PUBLISHED", availableLocales: terms.translations.map(({ locale }) => locale), contentHash: terms.manifestHash! },
      privacyDocument: { id: privacy.id, type: "PRIVACY_NOTICE", publicationStatus: "PUBLISHED", availableLocales: privacy.translations.map(({ locale }) => locale), contentHash: privacy.manifestHash! },
      termsAcceptance: "REQUIRED",
      privacyAcknowledgment: "REQUIRED",
      retainRenderedSnapshot: true,
      bookingEnforcementEnabled: true,
      requiredLocales: ["de", "en"],
      termsPresentation: "INLINE",
      privacyPresentation: "DIALOG",
      showInConfirmation: true,
      translations: [
        { locale: "de", termsCheckboxLabel: "Ich erkenne die Mietbedingungen an.", termsLinkLabel: "Mietbedingungen", privacyCheckboxLabel: "Ich habe den Datenschutzhinweis gelesen.", privacyLinkLabel: "Datenschutzhinweis" },
        { locale: "en", termsCheckboxLabel: "I acknowledge the Rental Terms.", termsLinkLabel: "Rental Terms", privacyCheckboxLabel: "I have read the Privacy Notice.", privacyLinkLabel: "Privacy Notice" },
      ],
    },
    db: prisma,
  })
  const legalValidation = await validateLegalAcceptanceDraft({ actorId, db: prisma })
  assert.notEqual(legalValidation.outcome, "BLOCKED")

  const active = await prisma.businessConfigurationRelease.findFirstOrThrow({
    where: { status: "ACTIVE" },
    include: { bookingWorkflowConfig: { include: { stepRules: true } } },
  })
  const workflowNumber = (await prisma.configurationVersion.aggregate({ where: { domain: "BOOKING_WORKFLOW" }, _max: { versionNumber: true } }))._max.versionNumber ?? 0
  const workflowId = "p7-workflow"
  await prisma.configurationVersion.create({
    data: {
      id: workflowId,
      domain: "BOOKING_WORKFLOW",
      versionNumber: workflowNumber + 1,
      changeSummary: "Enable Phase 7 legal acknowledgement",
      createdById: actorId,
      updatedById: actorId,
      bookingWorkflow: {
        create: {
          stepRules: {
            create: active.bookingWorkflowConfig.stepRules.map(({ step, displayOrder }) => ({
              step,
              displayOrder,
              mode: step === "DOCUMENTS" || step === "INSURANCE" ? "HIDDEN" : "REQUIRED",
            })),
          },
        },
      },
    },
  })
  const nextRelease = (await prisma.businessConfigurationRelease.aggregate({ _max: { releaseNumber: true } }))._max.releaseNumber ?? 0
  const release = await prisma.businessConfigurationRelease.create({
    data: {
      releaseNumber: nextRelease + 1,
      name: "Phase 7 legal acceptance",
      changeSummary: "Activate exact legal publications.",
      generalRentalConfigVersionId: active.generalRentalConfigVersionId,
      pricingBillingConfigVersionId: active.pricingBillingConfigVersionId,
      fleetRateSetId: active.fleetRateSetId,
      insuranceConfigVersionId: active.insuranceConfigVersionId,
      customerDriverConfigVersionId: active.customerDriverConfigVersionId,
      bookingWorkflowConfigVersionId: workflowId,
      documentPolicyConfigVersionId: active.documentPolicyConfigVersionId,
      paymentConfigVersionId: active.paymentConfigVersionId,
      confirmationConfigVersionId: active.confirmationConfigVersionId,
      legalAcceptanceConfigVersionId: legalVersionId,
      supersedesReleaseId: active.id,
      createdById: actorId,
      updatedById: actorId,
    },
  })
  const releaseValidation = await validateDraftRelease(release.id, actorId, prisma)
  assert.notEqual(releaseValidation.result.outcome, "BLOCKED")
  await activateDraftRelease({ releaseId: release.id, expectedRevision: releaseValidation.release.revision, actorId, warningsAcknowledged: true, db: prisma })

  const common = {
    userId: "p4-manager",
    vehicleId,
    pickupAt: new Date("2034-06-01T10:00:00.000Z"),
    returnAt: new Date("2034-06-02T10:00:00.000Z"),
    location: "Disposable Phase 7",
    locale: "en" as const,
    paymentMethod: "PAY_AT_PICKUP" as const,
    insuranceSelected: false,
    customer: {
      firstName: "Synthetic",
      lastName: "Customer",
      email: "phase7@example.invalid",
      dateOfBirth: "1990-01-01",
      licenceNumber: "SYNTHETIC-P7",
      licenceIssueDate: "2010-01-01",
      licenceExpiryDate: "2036-01-01",
      licenceIssuingCountry: "DE",
    },
  }
  const beforeRejected = await prisma.booking.count()
  await assert.rejects(() => createAuthoritativeBooking(prisma, { ...common, bookingNumber: "P7-REJECT", transferCode: "P7REJ", legalAcknowledgements: { rentalTerms: true, privacyNotice: false } }))
  assert.equal(await prisma.booking.count(), beforeRejected)

  const created = await createAuthoritativeBooking(prisma, {
    ...common,
    bookingNumber: "P7-ACTIVE",
    transferCode: "P7ACT",
    legalAcknowledgements: { rentalTerms: true, privacyNotice: true, publicationId: "browser-fake", contentHash: "browser-fake" } as { rentalTerms: boolean; privacyNotice: boolean },
  })
  const persisted = await prisma.booking.findUniqueOrThrow({
    where: { id: created.booking.id },
    include: { pricingSnapshot: true, legalAcceptances: { include: { legalDocumentTranslation: true } } },
  })
  assert.equal(persisted.legalAcceptances.length, 2)
  assert(persisted.legalAcceptances.every(({ accepted, source }) => accepted && source === "CUSTOMER_CHECKBOX"))
  assert(persisted.legalAcceptances.every(({ configurationReleaseId }) => configurationReleaseId === release.id))
  assert(persisted.legalAcceptances.every(({ legalAcceptanceConfigVersionId }) => legalAcceptanceConfigVersionId === legalVersionId))
  assert(persisted.legalAcceptances.every(({ contentHash, legalDocumentTranslation }) => contentHash === legalDocumentTranslation.contentHash))
  assert(persisted.legalAcceptances.every(({ acceptedAt }) => acceptedAt.getTime() <= Date.now()))

  await assert.rejects(() =>
    prisma.legalDocumentTranslation.update({
      where: { id: persisted.legalAcceptances[0].legalDocumentTranslationId },
      data: { title: "Forbidden published edit" },
    }),
  )
  await assert.rejects(() =>
    prisma.legalAcceptanceTranslation.updateMany({
      where: { legalAcceptanceConfigVersionId: legalVersionId },
      data: { termsLinkLabel: "Forbidden released edit" },
    }),
  )
  await assert.rejects(() =>
    prisma.bookingLegalAcceptance.update({
      where: { id: persisted.legalAcceptances[0].id },
      data: { acceptedAt: new Date() },
    }),
  )
  await assert.rejects(() =>
    prisma.legalDocumentVersion.update({
      where: { id: termsId },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    }),
  )

  const beforeAtomicFailure = await prisma.booking.count()
  await assert.rejects(() =>
    prisma.$transaction(async (tx) => {
      const failedBooking = await tx.booking.create({
        data: {
          userId: "p4-manager",
          carId: vehicleId,
          locale: "en",
          pickupDate: new Date("2035-01-01T10:00:00.000Z"),
          dropoffDate: new Date("2035-01-02T10:00:00.000Z"),
          location: "Disposable rollback",
          pricePerDay: 10_000,
          totalDays: 1,
          totalPrice: 10_000,
          depositAmount: 0,
          transferCode: "P7FAIL",
          bookingNumber: "P7-FAIL",
        },
      })
      await tx.bookingLegalAcceptance.create({
        data: {
          bookingId: failedBooking.id,
          legalDocumentTranslationId: persisted.legalAcceptances[0].legalDocumentTranslationId,
          customerUserId: "p4-manager",
          configurationReleaseId: release.id,
          legalAcceptanceConfigVersionId: legalVersionId,
          documentType: persisted.legalAcceptances[0].documentType,
          documentVersionNumber: persisted.legalAcceptances[0].documentVersionNumber,
          locale: "en",
          contentHash: persisted.legalAcceptances[0].contentHash,
          accepted: false,
          acceptedAt: new Date(),
          source: "CUSTOMER_CHECKBOX",
        },
      })
    }),
  )
  assert.equal(await prisma.booking.count(), beforeAtomicFailure)

  const historicalBefore = await prisma.bookingLegalAcceptance.findUniqueOrThrow({ where: { id: persisted.legalAcceptances[0].id } })
  await publish("RENTAL_TERMS")
  assert.deepEqual(await prisma.bookingLegalAcceptance.findUniqueOrThrow({ where: { id: historicalBefore.id } }), historicalBefore)

  const auditActions = await prisma.auditEvent.findMany({ where: { category: "LEGAL" }, select: { action: true } })
  assert(auditActions.some(({ action }) => action === "legal.version_published"))
  assert(auditActions.some(({ action }) => action === "legal_acceptance.configuration_changed"))
  console.log("Phase 7 disposable integration verification passed")
}

main().finally(() => prisma.$disconnect())
