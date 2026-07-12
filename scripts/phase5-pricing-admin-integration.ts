import { prisma } from "../lib/db"
import { ConfigurationWorkflowError } from "../lib/business-configuration/workflow-errors"
import { activateDraftRelease, loadConfigurationOverview, validateDraftRelease } from "../lib/business-configuration/workflow-service"
import { createAuthoritativeBooking } from "../lib/pricing/prisma-booking-service"
import { PrismaPricingContextRepository } from "../lib/pricing/prisma-repository"
import { quoteVehicleRental } from "../lib/pricing/quote-service"
import {
  attachPricingDraftToRelease,
  createPricingDraft,
  discardPricingDraft,
  generatePricingPreview,
  loadPricingConfigurationPage,
  updatePricingRules,
  updateVehicleRate,
  updateVehicleRatesBulk,
  validatePricingDraft,
} from "../lib/pricing-admin/service"

async function expectWorkflowError(operation: Promise<unknown>, code: string) {
  try {
    await operation
    throw new Error(`Expected ${code}`)
  } catch (error) {
    if (!(error instanceof ConfigurationWorkflowError) || error.code !== code) throw error
  }
}

async function main() {
  const historicalBefore = await prisma.bookingPricingSnapshot.findUniqueOrThrow({
    where: { id: "p4-historical-snapshot" },
  })
  const legacyQuote = await quoteVehicleRental(new PrismaPricingContextRepository(prisma), {
    vehicleId: "p4-car",
    pickupAt: new Date("2035-01-01T10:00:00.000Z"),
    returnAt: new Date("2035-01-02T10:00:00.000Z"),
    paymentMethod: "PAY_AT_PICKUP",
  })
  if (legacyQuote.compatibilityMode !== "LEGACY_CAR_PRICE" || legacyQuote.sourceDailyRate !== 10_000) {
    throw new Error("Legacy pricing compatibility was not preserved before activation.")
  }

  const initialValidation = await validateDraftRelease("p4-release-1", "p4-admin", prisma)
  await activateDraftRelease({ releaseId: "p4-release-1", expectedRevision: initialValidation.release.revision, actorId: "p4-admin", warningsAcknowledged: false, db: prisma })

  await expectWorkflowError(createPricingDraft({ actorId: "p4-no-cap", source: "LEGACY", changeSummary: "Unauthorized draft", db: prisma }), "CAPABILITY_REQUIRED")
  let page = await createPricingDraft({ actorId: "p4-admin", source: "LEGACY", changeSummary: "Legacy copy verification", db: prisma })
  if (page.vehicles[0]?.draftDailyRate !== page.vehicles[0]?.legacyDailyRate || page.vehicles[0]?.weeklyRateEnabled || page.vehicles[0]?.monthlyRateEnabled) {
    throw new Error("Initial legacy draft did not copy only Car.price.")
  }
  await discardPricingDraft({ actorId: "p4-admin", db: prisma })

  page = await createPricingDraft({ actorId: "p4-admin", source: "LIVE", changeSummary: "Phase 5 pricing update", db: prisma })
  if (!page.draftPricing || !page.draftFleet || page.vehicles[0]?.draftDailyRate !== 10_000) throw new Error("Live pricing draft was not created correctly.")
  const overviewWithIndependentDraft = await loadConfigurationOverview({ db: prisma, includeAudit: false })
  if (!overviewWithIndependentDraft.changedDomains.includes("pricing-billing")) throw new Error("Business health did not include the independent pricing draft.")

  await prisma.car.create({ data: { id: "p5-car-2", slug: "p5-car-2", name: "Phase 5 Added Car", description: "Synthetic Phase 5 car", category: "SUV", price: 13_000, image: "https://example.invalid/p5.jpg", status: "AVAILABLE", gearbox: "Automatic", seats: 5, fuelType: "Electric", acceleration: "6sec" } })
  page = await loadPricingConfigurationPage(prisma)
  if (page.coverage.vehiclesNotInDraft !== 1 || !page.issues.some(({ code }) => code === "rates.active_vehicle_missing")) throw new Error("A vehicle added after draft creation was not reported.")

  await expectWorkflowError(updateVehicleRatesBulk({ actorId: "p4-admin", fleetRateSetId: page.draftFleet!.id, expectedRevision: page.draftFleet!.revision, vehicleIds: ["p4-car", "p5-car-2"], action: "ENABLE_WEEKLY", db: prisma }), "FLEET_RATE_SET_INCOMPLETE")
  const afterFailedBulk = await loadPricingConfigurationPage(prisma)
  if (afterFailedBulk.draftFleet?.revision !== page.draftFleet!.revision || afterFailedBulk.vehicles[0]?.weeklyRateEnabled) throw new Error("Failed bulk action was not atomic.")
  await updateVehicleRatesBulk({ actorId: "p4-admin", fleetRateSetId: page.draftFleet!.id, expectedRevision: page.draftFleet!.revision, vehicleIds: ["p5-car-2"], action: "COPY_LEGACY", db: prisma })
  page = await loadPricingConfigurationPage(prisma)
  if (page.vehicles.find(({ vehicleId }) => vehicleId === "p5-car-2")?.draftDailyRate !== 13_000) throw new Error("Missing daily price was not explicitly copied from Car.price.")

  try {
    await prisma.vehicleRentalRate.create({ data: { fleetRateSetId: page.draftFleet!.id, carId: "p4-car", dailyRate: 10_000 } })
    throw new Error("Duplicate vehicle rate was accepted.")
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Unique constraint")) throw error
  }

  const concurrent = await Promise.allSettled([
    updateVehicleRate({ actorId: "p4-admin", fleetRateSetId: page.draftFleet!.id, expectedRevision: page.draftFleet!.revision, vehicleId: "p4-car", dailyRate: "110.00", weeklyRateEnabled: false, monthlyRateEnabled: false, db: prisma }),
    updateVehicleRate({ actorId: "p4-admin", fleetRateSetId: page.draftFleet!.id, expectedRevision: page.draftFleet!.revision, vehicleId: "p4-car", dailyRate: "120.00", weeklyRateEnabled: false, monthlyRateEnabled: false, db: prisma }),
  ])
  if (concurrent.filter(({ status }) => status === "fulfilled").length !== 1) throw new Error("Concurrent rate edits did not produce exactly one winner.")
  const rejected = concurrent.find(({ status }) => status === "rejected")
  if (!rejected || rejected.status !== "rejected" || !(rejected.reason instanceof ConfigurationWorkflowError) || rejected.reason.code !== "OPTIMISTIC_LOCK_FAILED") throw new Error("Stale rate edit did not return the stable conflict code.")

  page = await loadPricingConfigurationPage(prisma)
  if (!page.draftFleet || !page.draftPricing) throw new Error("Draft disappeared after concurrent update.")
  await expectWorkflowError(updateVehicleRate({ actorId: "p4-no-cap", fleetRateSetId: page.draftFleet.id, expectedRevision: page.draftFleet.revision, vehicleId: "p4-car", dailyRate: "1.00", weeklyRateEnabled: false, monthlyRateEnabled: false, db: prisma }), "CAPABILITY_REQUIRED")
  await updateVehicleRate({ actorId: "p4-admin", fleetRateSetId: page.draftFleet.id, expectedRevision: page.draftFleet.revision, vehicleId: "p4-car", dailyRate: "110.00", weeklyRate: "650.00", monthlyRate: "2500.00", weeklyRateEnabled: true, monthlyRateEnabled: true, db: prisma })

  page = await loadPricingConfigurationPage(prisma)
  await updateVehicleRate({ actorId: "p4-admin", fleetRateSetId: page.draftFleet!.id, expectedRevision: page.draftFleet!.revision, vehicleId: "p5-car-2", dailyRate: "130.00", weeklyRate: "800.00", monthlyRate: "3000.00", weeklyRateEnabled: true, monthlyRateEnabled: true, db: prisma })

  page = await loadPricingConfigurationPage(prisma)
  if (!page.draftPricing) throw new Error("Pricing draft missing before rule update.")
  await updatePricingRules({
    actorId: "p4-admin",
    pricingVersionId: page.draftPricing.id,
    expectedRevision: page.draftPricing.revision,
    configuration: {
      ...page.draftPricing.configuration,
      weeklyPricingEnabled: true,
      monthlyPricingEnabled: true,
      mixedDurationStrategy: "LOWEST_VALID_TOTAL",
      rentalMonthDefinition: "FIXED_30_DAYS",
      gracePeriodMinutes: 30,
    },
    changeSummary: "Enable weekly and fixed-month best pricing",
    businessTimeZone: page.businessTimeZone,
    db: prisma,
  })
  const pricingValidation = await validatePricingDraft({ actorId: "p4-admin", db: prisma })
  if (pricingValidation.outcome !== "VALID") throw new Error(`Expected valid pricing draft, received ${pricingValidation.outcome}`)

  const preview = await generatePricingPreview({ actorId: "p4-admin", vehicleId: "p4-car", pickupAt: new Date("2035-03-01T10:00:00.000Z"), returnAt: new Date("2035-03-11T10:00:00.000Z"), db: prisma })
  if (!preview.live || !preview.draft || preview.live.compatibilityMode !== "ACTIVE_RELEASE" || preview.draft.selectedStrategy !== "LOWEST_VALID_PRICE") throw new Error("Live/draft server preview was incomplete.")

  const attachment = await attachPricingDraftToRelease({ actorId: "p4-admin", db: prisma })
  page = await loadPricingConfigurationPage(prisma)
  if (!page.pricingDraftAttached || !page.fleetDraftAttached || page.draftRelease?.id !== attachment.releaseId) throw new Error("Exact pricing drafts were not attached to the release.")
  const releaseValidation = await validateDraftRelease(attachment.releaseId, "p4-admin", prisma)
  if (releaseValidation.result.outcome !== "VALID") throw new Error("Complete Phase 5 release did not validate.")
  await activateDraftRelease({ releaseId: attachment.releaseId, expectedRevision: releaseValidation.release.revision, actorId: "p4-admin", warningsAcknowledged: false, db: prisma })

  const activeQuote = await quoteVehicleRental(new PrismaPricingContextRepository(prisma), {
    vehicleId: "p4-car",
    pickupAt: new Date("2035-04-01T10:00:00.000Z"),
    returnAt: new Date("2035-04-11T10:00:00.000Z"),
    paymentMethod: "PAY_AT_PICKUP",
  })
  if (activeQuote.sourceDailyRate !== 11_000 || activeQuote.units.weekly !== 1 || activeQuote.units.daily !== 3 || activeQuote.grandTotal !== 98_000) throw new Error("Activated pricing was not used by the Phase 3 runtime.")

  const booking = await createAuthoritativeBooking(prisma, {
    userId: "p4-manager",
    vehicleId: "p4-car",
    pickupAt: new Date("2036-05-01T10:00:00.000Z"),
    returnAt: new Date("2036-05-11T10:00:00.000Z"),
    location: "Synthetic Phase 5",
    locale: "en",
    paymentMethod: "PAY_AT_PICKUP",
    bookingNumber: "P5-RELEASE-RATE",
    transferCode: "P5RATE",
  })
  const snapshot = await prisma.bookingPricingSnapshot.findUniqueOrThrow({ where: { bookingId: booking.booking.id } })
  if (snapshot.configurationReleaseId !== attachment.releaseId || snapshot.sourceDailyRate !== 11_000 || snapshot.weeklyUnits !== 1) throw new Error("Booking snapshot did not preserve exact Phase 5 release-backed rates.")

  const historicalAfter = await prisma.bookingPricingSnapshot.findUniqueOrThrow({ where: { id: "p4-historical-snapshot" } })
  if (JSON.stringify(historicalAfter) !== JSON.stringify(historicalBefore)) throw new Error("Historical booking snapshot changed during Phase 5.")
  if ((await prisma.car.findUniqueOrThrow({ where: { id: "p4-car" }, select: { price: true } })).price !== 10_000) throw new Error("Car.price was modified.")
  if ((await prisma.businessConfigurationRelease.count({ where: { status: "ACTIVE" } })) !== 1) throw new Error("Phase 5 activation violated the single-active invariant.")
  const auditCount = await prisma.auditEvent.count({ where: { category: "PRICING" } })
  if (auditCount < 8) throw new Error("Expected pricing audit events were not written.")

  process.stdout.write(JSON.stringify({ result: "phase5 pricing admin integration passed", activeReleaseId: attachment.releaseId, runtimeTotal: activeQuote.grandTotal, auditCount, legacyPathPreserved: true, historicalSnapshotUnchanged: true, carPriceUnchanged: true, concurrentEditWinnerCount: 1 }))
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => prisma.$disconnect())
