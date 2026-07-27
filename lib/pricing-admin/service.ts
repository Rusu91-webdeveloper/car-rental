import { Prisma, type PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/db"
import { calculatePricing } from "@/lib/pricing/engine"
import { PricingError, publicPricingErrorMessage } from "@/lib/pricing/errors"
import { money } from "@/lib/pricing/money"
import { PrismaPricingContextRepository } from "@/lib/pricing/prisma-repository"
import { quoteVehicleRental } from "@/lib/pricing/quote-service"
import type { PricingBillingConfiguration } from "@/lib/business-configuration/domains"
import type { ConfigurationValidationIssue } from "@/lib/business-configuration/types"
import { ConfigurationWorkflowError } from "@/lib/business-configuration/workflow-errors"
import { parseAdminMoneyInput } from "./money-input"
import { PrismaPricingAdminRepository } from "./prisma-repository"
import type { PricingWorkspaceRecords } from "./repositories"
import type {
  FleetRateSetView,
  PricingAdminPageData,
  PricingComparison,
  PricingQuoteView,
  PricingVersionView,
  VehicleRateView,
} from "./types"
import { validatePricingWorkspace } from "./validation"

async function pricingMutation<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation
  } catch (error) {
    if (error instanceof ConfigurationWorkflowError) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      throw new ConfigurationWorkflowError("OPTIMISTIC_LOCK_FAILED", "The pricing draft changed while you were working.", "CONFLICT")
    }
    throw error
  }
}

function pricingVersionFromRelease(
  release: NonNullable<PricingWorkspaceRecords["activeRelease"]>,
): PricingVersionView {
  const version = release.versions["pricing-billing"]
  return {
    ...version,
    updatedBy: version.authorName,
    configuration: release.domains["pricing-billing"]!,
  }
}

function fleetFromRelease(
  release: NonNullable<PricingWorkspaceRecords["activeRelease"]>,
): FleetRateSetView {
  return {
    id: release.fleetRateSet.id,
    versionNumber: release.fleetRateSet.versionNumber,
    status: release.fleetRateSet.status,
    validationStatus: release.fleetRateSet.validationStatus,
    revision: release.fleetRateSet.revision,
    currency: release.fleetRateSet.currency,
    changeSummary: release.changeSummary,
    updatedAt: release.fleetRateSet.updatedAt,
    updatedBy: release.updatedByName,
  }
}

const ruleLabels: Record<keyof PricingBillingConfiguration, string> = {
  weeklyPricingEnabled: "Weekly pricing",
  monthlyPricingEnabled: "Monthly pricing",
  mixedDurationStrategy: "Pricing strategy",
  rentalMonthDefinition: "Month length",
  billableDayRule: "Billable duration",
  gracePeriodMinutes: "Grace period",
  preparationBufferMinutes: "Preparation buffer",
  minimumRentalMinutes: "Minimum rental duration",
  minimumChargeDays: "Minimum charge",
  pricesIncludeTax: "Tax treatment",
  taxRateBps: "Tax rate",
}

function displayRule(value: unknown) {
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled"
  return String(value).replaceAll("_", " ").toLowerCase()
}

function comparePricing(
  live: PricingBillingConfiguration | undefined,
  draft: PricingBillingConfiguration | undefined,
  vehicles: VehicleRateView[],
): PricingComparison {
  const ruleChanges = !draft ? [] : (Object.keys(ruleLabels) as Array<keyof PricingBillingConfiguration>)
    .filter((field) => live?.[field] !== draft[field])
    .map((field) => ({
      field,
      label: ruleLabels[field],
      live: live ? displayRule(live[field]) : "Not configured",
      draft: displayRule(draft[field]),
    }))
  const rateChanges = vehicles.flatMap((vehicle) =>
    ([
      ["Daily price", vehicle.liveDailyRate, vehicle.draftDailyRate],
      ["Weekly price", vehicle.liveWeeklyRate, vehicle.draftWeeklyRate],
      ["Monthly price", vehicle.liveMonthlyRate, vehicle.draftMonthlyRate],
    ] as const).flatMap(([field, before, after]) => {
      if (before === after) return []
      const absoluteChange = before !== undefined && after !== undefined ? after - before : undefined
      const percentageChange = before !== undefined && before > 0 && after !== undefined
        ? Math.round(((after - before) * 10_000) / before) / 100
        : undefined
      return [{ vehicleId: vehicle.vehicleId, vehicleName: vehicle.vehicleName, field, live: before, draft: after, absoluteChange, percentageChange }]
    }),
  )
  const addedVehicles = vehicles.filter((vehicle) => !vehicle.liveDailyRate && vehicle.draftRateId).map((vehicle) => vehicle.vehicleName)
  const removedVehicles = vehicles.filter((vehicle) => vehicle.liveDailyRate && !vehicle.draftRateId).map((vehicle) => vehicle.vehicleName)
  return {
    ruleChanges,
    rateChanges,
    addedVehicles,
    removedVehicles,
    affectedVehicleCount: new Set(rateChanges.map(({ vehicleId }) => vehicleId)).size,
  }
}

export function buildPricingAdminPageData(records: PricingWorkspaceRecords): PricingAdminPageData {
  const active = records.activeRelease
  const draftRelease = records.draftRelease
  const pricingDraft = records.pricingDraft ?? undefined
  const fleetDraft = records.fleetDraft ?? undefined
  const liveRates = new Map(active?.fleetRateSet.rates.map((rate) => [rate.vehicleId, rate]) ?? [])
  const draftRates = new Map(fleetDraft?.rates.map((rate) => [rate.vehicleId, rate]) ?? [])
  const vehicles: VehicleRateView[] = records.vehicles.map((vehicle) => {
    const live = liveRates.get(vehicle.id)
    const draft = draftRates.get(vehicle.id)
    return {
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      businessIdentifier: vehicle.slug,
      vehicleStatus: vehicle.status,
      activeForBooking: vehicle.status === "AVAILABLE" || vehicle.status === "LOW_STOCK",
      legacyDailyRate: vehicle.price,
      draftRateId: draft?.id,
      draftDailyRate: draft?.dailyRate,
      draftWeeklyRate: draft?.weeklyRate,
      draftMonthlyRate: draft?.monthlyRate,
      weeklyRateEnabled: draft?.weeklyRateEnabled ?? false,
      monthlyRateEnabled: draft?.monthlyRateEnabled ?? false,
      liveDailyRate: live?.dailyRate,
      liveWeeklyRate: live?.weeklyRate,
      liveMonthlyRate: live?.monthlyRate,
      liveWeeklyRateEnabled: live?.weeklyRateEnabled ?? false,
      liveMonthlyRateEnabled: live?.monthlyRateEnabled ?? false,
      changedFromLive:
        draft?.dailyRate !== live?.dailyRate ||
        draft?.weeklyRate !== live?.weeklyRate ||
        draft?.monthlyRate !== live?.monthlyRate ||
        (draft?.weeklyRateEnabled ?? false) !== (live?.weeklyRateEnabled ?? false) ||
        (draft?.monthlyRateEnabled ?? false) !== (live?.monthlyRateEnabled ?? false),
      issues: [],
    }
  })
  const currency = draftRelease?.domains["general-rental"]?.currency ?? active?.domains["general-rental"]?.currency ?? records.companyCurrency
  const base: PricingAdminPageData = {
    liveRelease: active ? { id: active.id, releaseNumber: active.releaseNumber, name: active.name } : undefined,
    draftRelease: draftRelease ? { id: draftRelease.id, releaseNumber: draftRelease.releaseNumber, name: draftRelease.name, revision: draftRelease.revision } : undefined,
    pricingDraftAttached: Boolean(draftRelease && pricingDraft && draftRelease.versions["pricing-billing"].id === pricingDraft.id),
    fleetDraftAttached: Boolean(draftRelease && fleetDraft && draftRelease.fleetRateSet.id === fleetDraft.id),
    businessTimeZone: draftRelease?.domains["general-rental"]?.businessTimeZone ?? active?.domains["general-rental"]?.businessTimeZone ?? "UTC",
    liveBusinessTimeZone: active?.domains["general-rental"]?.businessTimeZone,
    currency,
    livePricing: active ? pricingVersionFromRelease(active) : undefined,
    draftPricing: pricingDraft,
    liveFleet: active ? fleetFromRelease(active) : undefined,
    draftFleet: fleetDraft,
    vehicles,
    coverage: {
      totalActiveVehicles: 0,
      dailyRates: 0,
      weeklyRates: 0,
      monthlyRates: 0,
      missingRequiredRates: 0,
      vehiclesNotInDraft: 0,
      currencyConsistent: !fleetDraft || fleetDraft.currency === currency,
      blockers: 0,
      warnings: 0,
    },
    issues: [],
    comparison: { ruleChanges: [], rateChanges: [], addedVehicles: [], removedVehicles: [], affectedVehicleCount: 0 },
  }
  const validation = validatePricingWorkspace(base)
  for (const vehicle of vehicles) {
    vehicle.issues = validation.issues.filter(({ affectedResource }) => affectedResource === vehicle.vehicleName)
  }
  const activeVehicles = vehicles.filter(({ activeForBooking }) => activeForBooking)
  base.issues = validation.issues
  base.coverage = {
    totalActiveVehicles: activeVehicles.length,
    dailyRates: activeVehicles.filter(({ draftDailyRate }) => (draftDailyRate ?? 0) > 0).length,
    weeklyRates: activeVehicles.filter(({ weeklyRateEnabled, draftWeeklyRate }) => weeklyRateEnabled && (draftWeeklyRate ?? 0) > 0).length,
    monthlyRates: activeVehicles.filter(({ monthlyRateEnabled, draftMonthlyRate }) => monthlyRateEnabled && (draftMonthlyRate ?? 0) > 0).length,
    missingRequiredRates: new Set(validation.issues.filter(({ severity, affectedResource }) => severity === "BLOCKER" && affectedResource).map(({ affectedResource }) => affectedResource)).size,
    vehiclesNotInDraft: activeVehicles.filter(({ draftRateId }) => !draftRateId).length,
    currencyConsistent: !fleetDraft || fleetDraft.currency === currency,
    blockers: validation.issues.filter(({ severity }) => severity === "BLOCKER").length,
    warnings: validation.issues.filter(({ severity }) => severity === "WARNING").length,
  }
  base.comparison = comparePricing(active?.domains["pricing-billing"], pricingDraft?.configuration, vehicles)
  return base
}

export async function loadPricingConfigurationPage(db = prisma) {
  return buildPricingAdminPageData(await new PrismaPricingAdminRepository(db).loadWorkspace())
}

export async function createPricingDraft(input: {
  actorId: string
  source: "LIVE" | "LEGACY"
  changeSummary: string
  db?: PrismaClient
}) {
  await pricingMutation(new PrismaPricingAdminRepository(input.db ?? prisma).createWorkspaceDrafts({ ...input, client: input.db ?? prisma }))
  return loadPricingConfigurationPage(input.db ?? prisma)
}

export async function updateVehicleRate(input: {
  actorId: string
  fleetRateSetId: string
  expectedRevision: number
  vehicleId: string
  dailyRate: string
  weeklyRate?: string
  monthlyRate?: string
  weeklyRateEnabled: boolean
  monthlyRateEnabled: boolean
  db?: PrismaClient
}) {
  const dailyRate = parseAdminMoneyInput(input.dailyRate)
  const weeklyRate = parseAdminMoneyInput(input.weeklyRate ?? "", { optional: !input.weeklyRateEnabled })
  const monthlyRate = parseAdminMoneyInput(input.monthlyRate ?? "", { optional: !input.monthlyRateEnabled })
  if (dailyRate === undefined || (input.weeklyRateEnabled && weeklyRate === undefined) || (input.monthlyRateEnabled && monthlyRate === undefined)) {
    throw new ConfigurationWorkflowError("FLEET_RATE_SET_INCOMPLETE", "Enabled rates require an amount.", "VALIDATION")
  }
  return pricingMutation(new PrismaPricingAdminRepository(input.db ?? prisma).updateVehicleRate({ ...input, dailyRate, weeklyRate, monthlyRate, client: input.db ?? prisma }))
}

export async function updateVehicleRatesBulk(input: {
  actorId: string
  fleetRateSetId: string
  expectedRevision: number
  vehicleIds: string[]
  action: "COPY_LEGACY" | "COPY_LIVE" | "ENABLE_WEEKLY" | "DISABLE_WEEKLY" | "ENABLE_MONTHLY" | "DISABLE_MONTHLY"
  db?: PrismaClient
}) {
  return pricingMutation(new PrismaPricingAdminRepository(input.db ?? prisma).updateRatesBulk({ ...input, client: input.db ?? prisma }))
}

export async function updatePricingRules(input: {
  actorId: string
  pricingVersionId: string
  expectedRevision: number
  configuration: PricingBillingConfiguration
  changeSummary: string
  businessTimeZone?: string
  db?: PrismaClient
}) {
  return pricingMutation(new PrismaPricingAdminRepository(input.db ?? prisma).updatePricingRules({ ...input, client: input.db ?? prisma }))
}

export async function validatePricingDraft(input: { actorId: string; db?: PrismaClient }) {
  const db = input.db ?? prisma
  const page = await loadPricingConfigurationPage(db)
  if (!page.draftPricing || !page.draftFleet) throw new ConfigurationWorkflowError("CONFIGURATION_NOT_FOUND", "Pricing drafts not found.", "VALIDATION")
  const result = validatePricingWorkspace(page)
  await pricingMutation(new PrismaPricingAdminRepository(db).persistValidation({
    actorId: input.actorId,
    pricingVersionId: page.draftPricing.id,
    fleetRateSetId: page.draftFleet.id,
    pricingRevision: page.draftPricing.revision,
    fleetRevision: page.draftFleet.revision,
    outcome: result.outcome,
    issues: result.issues.map(({ code, severity, field, affectedResource, adminMessage }) => ({ code, severity, field, affectedResource, message: adminMessage })),
    client: db,
  }))
  return result
}

export async function attachPricingDraftToRelease(input: { actorId: string; expectedReleaseRevision?: number; db?: PrismaClient }) {
  const db = input.db ?? prisma
  const page = await loadPricingConfigurationPage(db)
  if (!page.draftPricing || !page.draftFleet) throw new ConfigurationWorkflowError("CONFIGURATION_NOT_FOUND", "Pricing drafts not found.", "VALIDATION")
  return pricingMutation(new PrismaPricingAdminRepository(db).attachDraftsToRelease({ actorId: input.actorId, pricingVersionId: page.draftPricing.id, fleetRateSetId: page.draftFleet.id, expectedReleaseRevision: input.expectedReleaseRevision, client: db }))
}

export async function discardPricingDraft(input: { actorId: string; db?: PrismaClient }) {
  const db = input.db ?? prisma
  const page = await loadPricingConfigurationPage(db)
  if (!page.draftPricing || !page.draftFleet) throw new ConfigurationWorkflowError("CONFIGURATION_NOT_FOUND", "Pricing drafts not found.", "VALIDATION")
  return pricingMutation(new PrismaPricingAdminRepository(db).discardDrafts({ actorId: input.actorId, pricingVersionId: page.draftPricing.id, fleetRateSetId: page.draftFleet.id, client: db }))
}

function runtimeStrategy(configuration: PricingBillingConfiguration) {
  if (configuration.mixedDurationStrategy === "LONGEST_BLOCKS_THEN_DAYS") return "ORDERED_PERIODS" as const
  if (configuration.mixedDurationStrategy === "LOWEST_VALID_TOTAL") return "LOWEST_VALID_PRICE" as const
  return "DAILY_ONLY" as const
}

function safePreviewError(error: unknown) {
  if (error instanceof PricingError) return publicPricingErrorMessage(error)
  if (error instanceof ConfigurationWorkflowError) return error.message
  return "This quote could not be generated from the selected settings."
}

export async function generatePricingPreview(input: {
  actorId: string
  vehicleId: string
  pickupAt: Date
  returnAt: Date
  db?: PrismaClient
}): Promise<PricingQuoteView> {
  const db = input.db ?? prisma
  const page = await loadPricingConfigurationPage(db)
  const output: PricingQuoteView = {}
  try {
    output.live = await quoteVehicleRental(new PrismaPricingContextRepository(db), {
      vehicleId: input.vehicleId,
      pickupAt: input.pickupAt,
      returnAt: input.returnAt,
      paymentMethod: "PAY_AT_PICKUP",
    })
  } catch (error) {
    output.liveError = safePreviewError(error)
  }
  try {
    const validation = validatePricingWorkspace(page)
    if (validation.issues.some(({ severity }) => severity === "BLOCKER")) throw new ConfigurationWorkflowError("RELEASE_INVALID", "Resolve draft blockers before previewing it.", "VALIDATION")
    const configuration = page.draftPricing?.configuration
    const vehicle = page.vehicles.find(({ vehicleId }) => vehicleId === input.vehicleId)
    if (!configuration || !vehicle?.draftRateId || !vehicle.draftDailyRate) throw new ConfigurationWorkflowError("FLEET_RATE_SET_INCOMPLETE", "The selected vehicle has no draft rate.", "VALIDATION")
    output.draft = calculatePricing({
      vehicleId: input.vehicleId,
      pickupAt: input.pickupAt,
      returnAt: input.returnAt,
      businessTimeZone: page.businessTimeZone,
      rates: {
        daily: money(vehicle.draftDailyRate, page.currency),
        weekly: vehicle.draftWeeklyRate === undefined ? undefined : money(vehicle.draftWeeklyRate, page.currency),
        monthly: vehicle.draftMonthlyRate === undefined ? undefined : money(vehicle.draftMonthlyRate, page.currency),
        weeklyEnabled: configuration.weeklyPricingEnabled && vehicle.weeklyRateEnabled,
        monthlyEnabled: configuration.monthlyPricingEnabled && vehicle.monthlyRateEnabled,
      },
      strategy: runtimeStrategy(configuration),
      persistentStrategy: configuration.mixedDurationStrategy,
      monthDefinition: configuration.rentalMonthDefinition,
      billableDayMethod: configuration.billableDayRule,
      minimumRentalMinutes: configuration.minimumRentalMinutes,
      minimumChargeDays: configuration.minimumChargeDays,
      gracePeriodMinutes: configuration.gracePeriodMinutes,
      taxTreatment: configuration.pricesIncludeTax ? "TAX_INCLUDED" : "TAX_EXCLUDED",
      taxRateBps: configuration.taxRateBps,
      source: { vehicleId: input.vehicleId, rateSourceType: "FLEET_RATE_SET", rateSourceReference: vehicle.draftRateId, pricingConfigVersionId: page.draftPricing!.id, fleetRateSetId: page.draftFleet!.id, vehicleRentalRateId: vehicle.draftRateId },
      compatibilityMode: "ACTIVE_RELEASE",
    })
  } catch (error) {
    output.draftError = safePreviewError(error)
  }
  await new PrismaPricingAdminRepository(db).auditPreview({ actorId: input.actorId, vehicleId: input.vehicleId, hasLive: Boolean(output.live), hasDraft: Boolean(output.draft) })
  return output
}

export function issuesForPricingReleasePreview(page: PricingAdminPageData): ConfigurationValidationIssue[] {
  return validatePricingWorkspace(page).issues
}
