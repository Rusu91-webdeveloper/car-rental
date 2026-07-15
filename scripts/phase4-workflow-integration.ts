import { prisma } from "../lib/db"
import { PrismaCapabilityRepository } from "../lib/authorization/capability-repository"
import {
  activateDraftRelease,
  loadConfigurationOverview,
  validateDraftRelease,
} from "../lib/business-configuration/workflow-service"
import { ConfigurationWorkflowError } from "../lib/business-configuration/workflow-errors"
import { PrismaPricingContextRepository } from "../lib/pricing/prisma-repository"
import { quoteVehicleRental } from "../lib/pricing/quote-service"

const releaseReferences = {
  generalRentalConfigVersionId: "p4-general",
  pricingBillingConfigVersionId: "p4-pricing",
  fleetRateSetId: "p4-rates",
  insuranceConfigVersionId: "p4-insurance",
  customerDriverConfigVersionId: "p4-customer",
  bookingWorkflowConfigVersionId: "p4-workflow",
  documentPolicyConfigVersionId: "p4-documents",
  paymentConfigVersionId: "p4-payments",
  confirmationConfigVersionId: "p4-confirmations",
  legalAcceptanceConfigVersionId: "p4-legal",
}

async function expectWorkflowError(operation: Promise<unknown>, code: string) {
  try {
    await operation
    throw new Error(`Expected ${code}`)
  } catch (error) {
    if (!(error instanceof ConfigurationWorkflowError) || error.code !== code) throw error
  }
}

async function createDraft(id: string, releaseNumber: number, supersedesReleaseId: string) {
  await prisma.businessConfigurationRelease.create({
    data: {
      id,
      releaseNumber,
      name: `Phase 4 release ${releaseNumber}`,
      changeSummary: `Synthetic release ${releaseNumber}.`,
      ...releaseReferences,
      supersedesReleaseId,
      createdById: "p4-admin",
      updatedById: "p4-admin",
    },
  })
}

async function main() {
  const capabilityRepository = new PrismaCapabilityRepository(prisma)
  const managerCapabilities = await capabilityRepository.findCapabilitiesForUser("p4-manager")
  const deniedCapabilities = await capabilityRepository.findCapabilitiesForUser("p4-no-cap")
  if (!managerCapabilities.has("configuration.view") || !managerCapabilities.has("configuration.activate")) {
    throw new Error("Persisted capability user did not receive expected access.")
  }
  if (deniedCapabilities.size !== 0) throw new Error("Unauthorized user unexpectedly received capabilities.")

  const initialOverview = await loadConfigurationOverview({ db: prisma, includeAudit: true })
  if (initialOverview.activeRelease || initialOverview.draftRelease?.id !== "p4-release-1") {
    throw new Error("Draft-only overview state is incorrect.")
  }

  const historicalBefore = await prisma.bookingPricingSnapshot.findUniqueOrThrow({
    where: { id: "p4-historical-snapshot" },
    select: { grandTotal: true, sourceDailyRate: true, compatibilityMode: true, calculationTrace: true },
  })

  await expectWorkflowError(validateDraftRelease("p4-release-1", "p4-no-cap", prisma), "CAPABILITY_REQUIRED")

  const validation = await validateDraftRelease("p4-release-1", "p4-admin", prisma)
  if (validation.result.outcome !== "VALID" || validation.release.revision !== 2) {
    throw new Error("Complete release did not validate deterministically.")
  }
  if ((await prisma.businessConfigurationRelease.count({ where: { status: "ACTIVE" } })) !== 0) {
    throw new Error("Validation activated a release.")
  }

  await prisma.pricingBillingConfigVersion.update({
    where: { configurationVersionId: "p4-pricing" },
    data: { priceTaxTreatment: "TAX_EXCLUDED", taxRateBps: 0 },
  })
  await expectWorkflowError(
    activateDraftRelease({ releaseId: "p4-release-1", expectedRevision: 2, actorId: "p4-admin", warningsAcknowledged: false, db: prisma }),
    "RELEASE_INVALID",
  )
  await prisma.pricingBillingConfigVersion.update({
    where: { configurationVersionId: "p4-pricing" },
    data: { priceTaxTreatment: "TAX_INCLUDED", taxRateBps: 0 },
  })

  await prisma.vehicleRentalRate.delete({ where: { id: "p4-rate" } })
  await expectWorkflowError(
    activateDraftRelease({ releaseId: "p4-release-1", expectedRevision: 2, actorId: "p4-admin", warningsAcknowledged: true, db: prisma }),
    "RELEASE_INVALID",
  )
  await prisma.vehicleRentalRate.create({
    data: { id: "p4-rate", fleetRateSetId: "p4-rates", carId: "p4-car", dailyRate: 10000 },
  })

  await expectWorkflowError(
    activateDraftRelease({ releaseId: "p4-release-1", expectedRevision: 1, actorId: "p4-admin", warningsAcknowledged: true, db: prisma }),
    "OPTIMISTIC_LOCK_FAILED",
  )
  await expectWorkflowError(
    activateDraftRelease({ releaseId: "p4-release-1", expectedRevision: 2, actorId: "p4-no-cap", warningsAcknowledged: true, db: prisma }),
    "CAPABILITY_REQUIRED",
  )

  await activateDraftRelease({
    releaseId: "p4-release-1",
    expectedRevision: 2,
    actorId: "p4-manager",
    warningsAcknowledged: false,
    db: prisma,
  })
  if ((await prisma.businessConfigurationRelease.count({ where: { status: "ACTIVE" } })) !== 1) {
    throw new Error("First activation did not leave exactly one active release.")
  }

  const activeQuote = await quoteVehicleRental(new PrismaPricingContextRepository(prisma), {
    vehicleId: "p4-car",
    pickupAt: new Date("2031-01-01T10:00:00.000Z"),
    returnAt: new Date("2031-01-02T10:00:00.000Z"),
    paymentMethod: "PAY_AT_PICKUP",
    calculatedAt: new Date("2030-01-01T00:00:00.000Z"),
  })
  if (activeQuote.compatibilityMode !== "ACTIVE_RELEASE" || activeQuote.source.configurationReleaseId !== "p4-release-1") {
    throw new Error("Runtime pricing resolver did not use the newly active release.")
  }

  await createDraft("p4-release-2", 2, "p4-release-1")
  await activateDraftRelease({ releaseId: "p4-release-2", expectedRevision: 1, actorId: "p4-admin", warningsAcknowledged: false, db: prisma })
  const firstRelease = await prisma.businessConfigurationRelease.findUniqueOrThrow({ where: { id: "p4-release-1" } })
  if (firstRelease.status !== "SUPERSEDED") throw new Error("Prior active release was not superseded.")

  await Promise.all([
    createDraft("p4-release-3", 3, "p4-release-2"),
    createDraft("p4-release-4", 4, "p4-release-2"),
  ])
  const concurrent = await Promise.allSettled([
    activateDraftRelease({ releaseId: "p4-release-3", expectedRevision: 1, actorId: "p4-admin", warningsAcknowledged: false, db: prisma }),
    activateDraftRelease({ releaseId: "p4-release-4", expectedRevision: 1, actorId: "p4-admin", warningsAcknowledged: false, db: prisma }),
  ])
  if (concurrent.filter(({ status }) => status === "fulfilled").length !== 1) {
    throw new Error("Concurrent activation did not produce exactly one winner.")
  }
  if ((await prisma.businessConfigurationRelease.count({ where: { status: "ACTIVE" } })) !== 1) {
    throw new Error("Concurrent activation violated one-active-release integrity.")
  }

  const historicalAfter = await prisma.bookingPricingSnapshot.findUniqueOrThrow({
    where: { id: "p4-historical-snapshot" },
    select: { grandTotal: true, sourceDailyRate: true, compatibilityMode: true, calculationTrace: true },
  })
  if (JSON.stringify(historicalAfter) !== JSON.stringify(historicalBefore)) {
    throw new Error("Historical booking snapshot changed during activation.")
  }
  const auditCount = await prisma.auditEvent.count({
    where: { action: { in: ["configuration.release_validated", "configuration.release_activated"] } },
  })
  if (auditCount < 4) throw new Error("Configuration validation/activation audit events are missing.")

  process.stdout.write(
    JSON.stringify({
      result: "phase4 workflow integration passed",
      activeRelease: await prisma.businessConfigurationRelease.findFirst({ where: { status: "ACTIVE" }, select: { id: true, releaseNumber: true } }),
      auditCount,
      historicalSnapshotUnchanged: true,
      runtimePricingMode: activeQuote.compatibilityMode,
    }),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
