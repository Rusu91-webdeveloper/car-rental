import assert from "node:assert/strict"
import { prisma } from "../lib/db"
import {
  attachPhase6DraftsToRelease,
  createPhase6Draft,
  loadPhase6ConfigurationPage,
  updateBookingWorkflowDraft,
  updateCustomerFieldDraft,
  updateInsuranceDraft,
  validatePhase6Drafts,
} from "../lib/phase6-admin/service"
import { activateDraftRelease, validateDraftRelease } from "../lib/business-configuration/workflow-service"
import { quoteConfiguredVehicleRental } from "../lib/booking-configuration/quote-service"
import { PrismaPricingContextRepository } from "../lib/pricing/prisma-repository"
import { createAuthoritativeBooking } from "../lib/pricing/prisma-booking-service"

const actorId = "p4-admin"
const vehicleId = "p4-car"

async function main() {
  const historicalBefore = await prisma.bookingInsuranceSnapshot.findUniqueOrThrow({
    where: { bookingId: "p6-release-booking" },
  })
  for (const domain of ["INSURANCE", "CUSTOMER_DRIVER_REQUIREMENTS", "BOOKING_WORKFLOW"] as const) {
    await createPhase6Draft({
      actorId,
      domain,
      source: "LIVE",
      changeSummary: `Phase 6 ${domain.toLowerCase()} integration`,
      db: prisma,
    })
  }
  const page = await loadPhase6ConfigurationPage(prisma)
  assert(page.draftInsurance && page.draftCustomerDriver && page.draftWorkflow)
  await updateInsuranceDraft({
    actorId,
    versionId: page.draftInsurance.id,
    expectedRevision: page.draftInsurance.revision,
    changeSummary: "Offer optional Vollkasko",
    configuration: {
      ...page.draftInsurance.configuration,
      enabled: true,
      selectionMode: "OPTIONAL",
      pricePerDay: "10.00",
      availabilityScope: "ALL_VEHICLES",
      vehicleIds: [],
      showInConfirmation: true,
      showCustomerSelection: true,
      preselectedByDefault: false,
    },
    db: prisma,
  })
  await updateCustomerFieldDraft({
    actorId,
    versionId: page.draftCustomerDriver.id,
    expectedRevision: page.draftCustomerDriver.revision,
    changeSummary: "Require supported driver evidence",
    configuration: {
      ...page.draftCustomerDriver.configuration,
      fields: {
        ...page.draftCustomerDriver.configuration.fields,
        LICENCE_NUMBER: "REQUIRED",
        LICENCE_ISSUE_DATE: "REQUIRED",
        LICENCE_EXPIRY_DATE: "REQUIRED",
        LICENCE_ISSUING_COUNTRY: "REQUIRED",
      },
    },
    db: prisma,
  })
  await updateBookingWorkflowDraft({
    actorId,
    versionId: page.draftWorkflow.id,
    expectedRevision: page.draftWorkflow.revision,
    changeSummary: "Use the supported Phase 6 booking flow",
    configuration: {
      steps: page.draftWorkflow.configuration.steps.map((step) => ({
        ...step,
        requirement:
          step.step === "DOCUMENTS" || step.step === "LEGAL_ACCEPTANCE"
            ? "HIDDEN"
            : step.step === "INSURANCE"
              ? "OPTIONAL"
              : "REQUIRED",
      })),
    },
    db: prisma,
  })
  const phase6Validation = await validatePhase6Drafts({ actorId, db: prisma })
  assert.notEqual(phase6Validation.outcome, "BLOCKED")
  const attached = await attachPhase6DraftsToRelease({ actorId, db: prisma })
  const releaseValidation = await validateDraftRelease(attached.releaseId, actorId, prisma)
  assert.notEqual(releaseValidation.result.outcome, "BLOCKED")
  const draft = await prisma.businessConfigurationRelease.findUniqueOrThrow({ where: { id: attached.releaseId } })
  await activateDraftRelease({
    releaseId: draft.id,
    expectedRevision: draft.revision,
    actorId,
    warningsAcknowledged: true,
    db: prisma,
  })

  const pickupAt = new Date("2031-06-01T10:00:00.000Z")
  const returnAt = new Date("2031-06-03T10:00:00.000Z")
  const request = { vehicleId, pickupAt, returnAt, paymentMethod: "PAY_AT_PICKUP" as const }
  const unselected = await quoteConfiguredVehicleRental({
    db: prisma,
    pricingRepository: new PrismaPricingContextRepository(prisma),
    request,
    locale: "en",
    insuranceSelected: false,
  })
  const selected = await quoteConfiguredVehicleRental({
    db: prisma,
    pricingRepository: new PrismaPricingContextRepository(prisma),
    request,
    locale: "en",
    insuranceSelected: true,
  })
  assert.equal(unselected.quote.insuranceSubtotal, 0)
  assert.equal(selected.quote.insuranceSubtotal, 2_000)
  assert.equal(selected.quote.grandTotal - unselected.quote.grandTotal, 2_000)

  const beforeRejected = await prisma.booking.count()
  await assert.rejects(() =>
    createAuthoritativeBooking(prisma, {
      userId: "p4-manager",
      vehicleId,
      pickupAt,
      returnAt,
      location: "Synthetic",
      locale: "en",
      paymentMethod: "PAY_AT_PICKUP",
      bookingNumber: "P6-REJECTED",
      transferCode: "P6REJ",
      insuranceSelected: true,
      customer: {
        firstName: "Under",
        lastName: "Age",
        email: "underage@example.invalid",
        dateOfBirth: "2020-01-01",
        licenceNumber: "MASKED",
        licenceIssueDate: "2030-01-01",
        licenceExpiryDate: "2035-01-01",
        licenceIssuingCountry: "DE",
      },
    }),
  )
  assert.equal(await prisma.booking.count(), beforeRejected)

  const created = await createAuthoritativeBooking(prisma, {
    userId: "p4-manager",
    vehicleId,
    pickupAt,
    returnAt,
    location: "Synthetic",
    locale: "en",
    paymentMethod: "PAY_AT_PICKUP",
    bookingNumber: "P6-ACTIVE",
    transferCode: "P6ACT",
    insuranceSelected: true,
    customer: {
      firstName: "Synthetic",
      lastName: "Driver",
      email: "driver@example.invalid",
      dateOfBirth: "1990-01-01",
      licenceNumber: "SYNTHETIC1234",
      licenceIssueDate: "2010-01-01",
      licenceExpiryDate: "2035-01-01",
      licenceIssuingCountry: "DE",
    },
  })
  const persisted = await prisma.booking.findUniqueOrThrow({
    where: { id: created.booking.id },
    include: { pricingSnapshot: true, insuranceSnapshot: true, customerDriverSnapshot: true },
  })
  assert.equal(persisted.insuranceSnapshot?.subtotal, 2_000)
  assert.equal(persisted.insuranceSnapshot?.currency, persisted.pricingSnapshot?.currency)
  assert.equal(
    persisted.customerDriverSnapshot?.customerDriverConfigVersionId,
    created.configuration.customerDriverConfigVersionId,
  )
  assert(persisted.customerDriverSnapshot?.validatedAt)
  assert.deepEqual(
    await prisma.bookingInsuranceSnapshot.findUniqueOrThrow({ where: { bookingId: "p6-release-booking" } }),
    historicalBefore,
  )
  console.log("Phase 6 disposable integration verification passed")
}

main().finally(() => prisma.$disconnect())
