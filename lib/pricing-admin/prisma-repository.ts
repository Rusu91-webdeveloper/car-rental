import { Prisma, type PrismaClient } from "@prisma/client"
import { CAPABILITIES } from "@/lib/authorization/capabilities"
import { databaseUserHasCapability } from "@/lib/authorization/database-capabilities"
import { PrismaBusinessConfigurationRepository, type ConfigurationDbClient } from "@/lib/business-configuration/prisma-repository"
import { ConfigurationWorkflowError } from "@/lib/business-configuration/workflow-errors"
import type {
  BusinessHoursException,
  HandoverPolicy,
  PricingBillingConfiguration,
  WeeklyOpeningHours,
} from "@/lib/business-configuration/domains"
import {
  handoverPoliciesEqual,
  openingHoursExceptionsEqual,
  weeklyOpeningHoursEqual,
} from "@/lib/business-hours"
import type {
  FleetDraftRecord,
  PricingAdminRepository,
  PricingDraftRecord,
  PricingWorkspaceRecords,
} from "./repositories"

const pricingDraftInclude = {
  updatedBy: { select: { name: true, email: true } },
  pricingBilling: true,
} satisfies Prisma.ConfigurationVersionInclude

const fleetDraftInclude = {
  updatedBy: { select: { name: true, email: true } },
  rates: true,
} satisfies Prisma.FleetRateSetInclude

function actorName(actor: { name: string | null; email: string }) {
  return actor.name || actor.email
}

function mapPricingDraft(
  row: Prisma.ConfigurationVersionGetPayload<{ include: typeof pricingDraftInclude }>,
): PricingDraftRecord {
  if (!row.pricingBilling) throw new Error("Pricing draft payload is missing")
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    status: row.status,
    validationStatus: row.validationStatus,
    revision: row.revision,
    changeSummary: row.changeSummary,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: actorName(row.updatedBy),
    configuration: {
      weeklyPricingEnabled: row.pricingBilling.weeklyPricingEnabled,
      monthlyPricingEnabled: row.pricingBilling.monthlyPricingEnabled,
      mixedDurationStrategy: row.pricingBilling.mixedDurationStrategy,
      rentalMonthDefinition: row.pricingBilling.rentalMonthDefinition,
      billableDayRule: row.pricingBilling.billableDayMethod,
      gracePeriodMinutes: row.pricingBilling.gracePeriodMinutes,
      preparationBufferMinutes: row.pricingBilling.preparationBufferMinutes,
      minimumRentalMinutes: row.pricingBilling.minimumRentalMinutes,
      minimumChargeDays: row.pricingBilling.minimumChargeDays,
      pricesIncludeTax: row.pricingBilling.priceTaxTreatment === "TAX_INCLUDED",
      taxRateBps: row.pricingBilling.taxRateBps,
    },
  }
}

function mapFleetDraft(
  row: Prisma.FleetRateSetGetPayload<{ include: typeof fleetDraftInclude }>,
): FleetDraftRecord {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    status: row.status,
    validationStatus: row.validationStatus,
    revision: row.revision,
    currency: row.currency,
    changeSummary: row.changeSummary,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: actorName(row.updatedBy),
    rates: row.rates.map((rate) => ({
      id: rate.id,
      vehicleId: rate.carId,
      dailyRate: rate.dailyRate,
      weeklyRate: rate.weeklyRate ?? undefined,
      monthlyRate: rate.monthlyRate ?? undefined,
      weeklyRateEnabled: rate.weeklyRateEnabled,
      monthlyRateEnabled: rate.monthlyRateEnabled,
    })),
  }
}

function pricingData(configuration: PricingBillingConfiguration) {
  return {
    weeklyPricingEnabled: configuration.weeklyPricingEnabled,
    monthlyPricingEnabled: configuration.monthlyPricingEnabled,
    mixedDurationStrategy: configuration.mixedDurationStrategy,
    rentalMonthDefinition: configuration.rentalMonthDefinition,
    billableDayMethod: configuration.billableDayRule,
    gracePeriodMinutes: configuration.gracePeriodMinutes,
    preparationBufferMinutes: configuration.preparationBufferMinutes,
    minimumRentalMinutes: configuration.minimumRentalMinutes,
    minimumChargeDays: configuration.minimumChargeDays,
    priceTaxTreatment: configuration.pricesIncludeTax ? "TAX_INCLUDED" as const : "TAX_EXCLUDED" as const,
    taxRateBps: configuration.taxRateBps,
  }
}

async function requireDatabaseCapability(
  db: ConfigurationDbClient,
  actorId: string,
  capability: typeof CAPABILITIES.PRICING_MANAGE | typeof CAPABILITIES.CONFIGURATION_VALIDATE,
) {
  if (!(await databaseUserHasCapability(db, actorId, capability))) {
    throw new ConfigurationWorkflowError("CAPABILITY_REQUIRED", "Pricing capability is required.", "AUTHORIZATION")
  }
}

async function audit(
  db: ConfigurationDbClient,
  input: {
    actorId: string
    action: string
    targetType: string
    targetId: string
    releaseId?: string
    before?: Prisma.InputJsonValue
    after?: Prisma.InputJsonValue
    metadata?: Prisma.InputJsonValue
  },
) {
  try {
    await db.auditEvent.create({
      data: {
        actorUserId: input.actorId,
        category: "PRICING",
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        configurationReleaseId: input.releaseId,
        beforeSummary: input.before,
        afterSummary: input.after,
        metadata: input.metadata,
      },
    })
  } catch {
    throw new ConfigurationWorkflowError("AUDIT_WRITE_FAILED", "Pricing audit could not be saved.", "OPERATIONAL")
  }
}

export class PrismaPricingAdminRepository implements PricingAdminRepository {
  constructor(readonly db: ConfigurationDbClient) {}

  async loadWorkspace(): Promise<PricingWorkspaceRecords> {
    const configurationRepository = new PrismaBusinessConfigurationRepository(this.db)
    const [activeRelease, draftRelease, pricingDraftRow, fleetDraftRow, vehicles, settings] = await Promise.all([
      configurationRepository.findActiveRelease(),
      configurationRepository.findLatestDraftRelease(),
      this.db.configurationVersion.findFirst({
        where: { domain: "PRICING_BILLING", status: { in: ["DRAFT", "VALIDATED"] } },
        include: pricingDraftInclude,
        orderBy: { updatedAt: "desc" },
      }),
      this.db.fleetRateSet.findFirst({
        where: { status: { in: ["DRAFT", "VALIDATED"] } },
        include: fleetDraftInclude,
        orderBy: { updatedAt: "desc" },
      }),
      this.db.car.findMany({
        where: { isDeleted: false },
        select: { id: true, slug: true, name: true, status: true, price: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      this.db.companySettings.findUnique({ where: { id: "company-settings" }, select: { currency: true } }),
    ])
    return {
      activeRelease,
      draftRelease,
      pricingDraft: pricingDraftRow ? mapPricingDraft(pricingDraftRow) : null,
      fleetDraft: fleetDraftRow ? mapFleetDraft(fleetDraftRow) : null,
      vehicles,
      companyCurrency: settings?.currency ?? "EUR",
    }
  }

  async createWorkspaceDrafts(input: {
    actorId: string
    source: "LIVE" | "LEGACY"
    changeSummary: string
    client: PrismaClient
  }) {
    return input.client.$transaction(async (tx) => {
      await requireDatabaseCapability(tx, input.actorId, CAPABILITIES.PRICING_MANAGE)
      const repository = new PrismaPricingAdminRepository(tx)
      const existing = await repository.loadWorkspace()
      if (existing.pricingDraft && existing.fleetDraft) return existing
      const sourceRelease = input.source === "LIVE" ? existing.activeRelease : null
      const nextPricingVersion = (await tx.configurationVersion.aggregate({
        where: { domain: "PRICING_BILLING" },
        _max: { versionNumber: true },
      }))._max.versionNumber ?? 0
      const nextFleetVersion = (await tx.fleetRateSet.aggregate({ _max: { versionNumber: true } }))._max.versionNumber ?? 0
      const defaultConfiguration: PricingBillingConfiguration = sourceRelease?.domains["pricing-billing"] ?? {
        weeklyPricingEnabled: false,
        monthlyPricingEnabled: false,
        mixedDurationStrategy: "DAILY_ONLY",
        rentalMonthDefinition: "FIXED_30_DAYS",
        billableDayRule: "STARTED_24_HOUR_PERIODS",
        gracePeriodMinutes: 0,
        preparationBufferMinutes: 120,
        minimumRentalMinutes: 1,
        minimumChargeDays: 1,
        pricesIncludeTax: false,
        taxRateBps: 0,
      }
      const pricingDraft = existing.pricingDraft ?? mapPricingDraft(await tx.configurationVersion.create({
        data: {
          domain: "PRICING_BILLING",
          versionNumber: nextPricingVersion + 1,
          changeSummary: input.changeSummary,
          createdById: input.actorId,
          updatedById: input.actorId,
          pricingBilling: { create: pricingData(defaultConfiguration) },
        },
        include: pricingDraftInclude,
      }))
      const vehicles = existing.vehicles
      const sourceRates = new Map(sourceRelease?.fleetRateSet.rates.map((rate) => [rate.vehicleId, rate]) ?? [])
      const currency = sourceRelease?.fleetRateSet.currency ?? sourceRelease?.domains["general-rental"]?.currency ?? existing.companyCurrency
      const fleetDraft = existing.fleetDraft ?? mapFleetDraft(await tx.fleetRateSet.create({
        data: {
          versionNumber: nextFleetVersion + 1,
          currency,
          changeSummary: input.changeSummary,
          createdById: input.actorId,
          updatedById: input.actorId,
          rates: {
            create: vehicles.map((vehicle) => {
              const source = sourceRates.get(vehicle.id)
              return {
                carId: vehicle.id,
                dailyRate: source?.dailyRate ?? vehicle.price,
                weeklyRate: source?.weeklyRate,
                monthlyRate: source?.monthlyRate,
                weeklyRateEnabled: source?.weeklyRateEnabled ?? false,
                monthlyRateEnabled: source?.monthlyRateEnabled ?? false,
              }
            }),
          },
        },
        include: fleetDraftInclude,
      }))
      await audit(tx, {
        actorId: input.actorId,
        action: "pricing.draft_created",
        targetType: "PricingWorkspace",
        targetId: pricingDraft.id,
        after: {
          source: input.source,
          pricingVersionNumber: pricingDraft.versionNumber,
          fleetRateSetVersionNumber: fleetDraft.versionNumber,
          affectedVehicleCount: fleetDraft.rates.length,
        },
      })
      return repository.loadWorkspace()
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async updateVehicleRate(input: {
    actorId: string
    fleetRateSetId: string
    expectedRevision: number
    vehicleId: string
    dailyRate: number
    weeklyRate?: number
    monthlyRate?: number
    weeklyRateEnabled: boolean
    monthlyRateEnabled: boolean
    client: PrismaClient
  }) {
    return input.client.$transaction(async (tx) => {
      await requireDatabaseCapability(tx, input.actorId, CAPABILITIES.PRICING_MANAGE)
      const current = await tx.vehicleRentalRate.findUnique({
        where: { fleetRateSetId_carId: { fleetRateSetId: input.fleetRateSetId, carId: input.vehicleId } },
      })
      const locked = await tx.fleetRateSet.updateMany({
        where: { id: input.fleetRateSetId, revision: input.expectedRevision, status: { in: ["DRAFT", "VALIDATED"] } },
        data: {
          revision: { increment: 1 },
          status: "DRAFT",
          validationStatus: "NOT_VALIDATED",
          validationSnapshot: Prisma.JsonNull,
          updatedById: input.actorId,
        },
      })
      if (locked.count !== 1) throw new ConfigurationWorkflowError("OPTIMISTIC_LOCK_FAILED", "Fleet rate draft changed.", "CONFLICT")
      const rate = await tx.vehicleRentalRate.upsert({
        where: { fleetRateSetId_carId: { fleetRateSetId: input.fleetRateSetId, carId: input.vehicleId } },
        create: {
          fleetRateSetId: input.fleetRateSetId,
          carId: input.vehicleId,
          dailyRate: input.dailyRate,
          weeklyRate: input.weeklyRateEnabled ? input.weeklyRate : null,
          monthlyRate: input.monthlyRateEnabled ? input.monthlyRate : null,
          weeklyRateEnabled: input.weeklyRateEnabled,
          monthlyRateEnabled: input.monthlyRateEnabled,
        },
        update: {
          dailyRate: input.dailyRate,
          weeklyRate: input.weeklyRateEnabled ? input.weeklyRate : null,
          monthlyRate: input.monthlyRateEnabled ? input.monthlyRate : null,
          weeklyRateEnabled: input.weeklyRateEnabled,
          monthlyRateEnabled: input.monthlyRateEnabled,
        },
      })
      const changedFields = [
        current?.dailyRate !== rate.dailyRate ? "dailyRate" : null,
        current?.weeklyRate !== rate.weeklyRate || current?.weeklyRateEnabled !== rate.weeklyRateEnabled ? "weeklyRate" : null,
        current?.monthlyRate !== rate.monthlyRate || current?.monthlyRateEnabled !== rate.monthlyRateEnabled ? "monthlyRate" : null,
      ].filter(Boolean)
      await audit(tx, {
        actorId: input.actorId,
        action: "pricing.vehicle_rate_changed",
        targetType: "VehicleRentalRate",
        targetId: rate.id,
        before: current ? { dailyRate: current.dailyRate, weeklyRate: current.weeklyRate, monthlyRate: current.monthlyRate, weeklyEnabled: current.weeklyRateEnabled, monthlyEnabled: current.monthlyRateEnabled } : { included: false },
        after: { dailyRate: rate.dailyRate, weeklyRate: rate.weeklyRate, monthlyRate: rate.monthlyRate, weeklyEnabled: rate.weeklyRateEnabled, monthlyEnabled: rate.monthlyRateEnabled },
        metadata: { changedFields, affectedVehicleCount: 1 },
      })
      return { revision: input.expectedRevision + 1 }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async updateRatesBulk(input: {
    actorId: string
    fleetRateSetId: string
    expectedRevision: number
    vehicleIds: string[]
    action: "COPY_LEGACY" | "COPY_LIVE" | "ENABLE_WEEKLY" | "DISABLE_WEEKLY" | "ENABLE_MONTHLY" | "DISABLE_MONTHLY"
    client: PrismaClient
  }) {
    return input.client.$transaction(async (tx) => {
      await requireDatabaseCapability(tx, input.actorId, CAPABILITIES.PRICING_MANAGE)
      const locked = await tx.fleetRateSet.updateMany({
        where: { id: input.fleetRateSetId, revision: input.expectedRevision, status: { in: ["DRAFT", "VALIDATED"] } },
        data: { revision: { increment: 1 }, status: "DRAFT", validationStatus: "NOT_VALIDATED", validationSnapshot: Prisma.JsonNull, updatedById: input.actorId },
      })
      if (locked.count !== 1) throw new ConfigurationWorkflowError("OPTIMISTIC_LOCK_FAILED", "Fleet rate draft changed.", "CONFLICT")
      const [cars, current, active] = await Promise.all([
        tx.car.findMany({ where: { id: { in: input.vehicleIds }, isDeleted: false }, select: { id: true, price: true } }),
        tx.vehicleRentalRate.findMany({ where: { fleetRateSetId: input.fleetRateSetId, carId: { in: input.vehicleIds } } }),
        new PrismaBusinessConfigurationRepository(tx).findActiveRelease(),
      ])
      if (cars.length !== input.vehicleIds.length) throw new ConfigurationWorkflowError("CONFIGURATION_NOT_FOUND", "A selected vehicle was not found.", "VALIDATION")
      const byCurrent = new Map(current.map((rate) => [rate.carId, rate]))
      const byLive = new Map(active?.fleetRateSet.rates.map((rate) => [rate.vehicleId, rate]) ?? [])
      if (input.action === "ENABLE_WEEKLY" && cars.some((car) => !byCurrent.get(car.id)?.weeklyRate)) {
        throw new ConfigurationWorkflowError("FLEET_RATE_SET_INCOMPLETE", "Enter weekly prices before enabling them in bulk.", "VALIDATION")
      }
      if (input.action === "ENABLE_MONTHLY" && cars.some((car) => !byCurrent.get(car.id)?.monthlyRate)) {
        throw new ConfigurationWorkflowError("FLEET_RATE_SET_INCOMPLETE", "Enter monthly prices before enabling them in bulk.", "VALIDATION")
      }
      let affectedVehicleCount = 0
      for (const car of cars) {
        const existing = byCurrent.get(car.id)
        if (input.action === "COPY_LEGACY" && existing) continue
        const live = byLive.get(car.id)
        const base = existing ?? {
          dailyRate: car.price,
          weeklyRate: null,
          monthlyRate: null,
          weeklyRateEnabled: false,
          monthlyRateEnabled: false,
        }
        let next: {
          dailyRate: number
          weeklyRate: number | null
          monthlyRate: number | null
          weeklyRateEnabled: boolean
          monthlyRateEnabled: boolean
        } = {
          dailyRate: base.dailyRate,
          weeklyRate: base.weeklyRate,
          monthlyRate: base.monthlyRate,
          weeklyRateEnabled: base.weeklyRateEnabled,
          monthlyRateEnabled: base.monthlyRateEnabled,
        }
        if (input.action === "COPY_LEGACY") next = { ...next, dailyRate: car.price }
        if (input.action === "COPY_LIVE") {
          if (!live) throw new ConfigurationWorkflowError("FLEET_RATE_SET_INCOMPLETE", "A selected vehicle has no live rate to copy.", "VALIDATION")
          next = { ...next, dailyRate: live.dailyRate, weeklyRate: live.weeklyRate ?? null, monthlyRate: live.monthlyRate ?? null, weeklyRateEnabled: live.weeklyRateEnabled, monthlyRateEnabled: live.monthlyRateEnabled }
        }
        if (input.action === "ENABLE_WEEKLY") next.weeklyRateEnabled = true
        if (input.action === "DISABLE_WEEKLY") next = { ...next, weeklyRateEnabled: false, weeklyRate: null }
        if (input.action === "ENABLE_MONTHLY") next.monthlyRateEnabled = true
        if (input.action === "DISABLE_MONTHLY") next = { ...next, monthlyRateEnabled: false, monthlyRate: null }
        await tx.vehicleRentalRate.upsert({
          where: { fleetRateSetId_carId: { fleetRateSetId: input.fleetRateSetId, carId: car.id } },
          create: { fleetRateSetId: input.fleetRateSetId, carId: car.id, dailyRate: next.dailyRate, weeklyRate: next.weeklyRate, monthlyRate: next.monthlyRate, weeklyRateEnabled: next.weeklyRateEnabled, monthlyRateEnabled: next.monthlyRateEnabled },
          update: { dailyRate: next.dailyRate, weeklyRate: next.weeklyRate, monthlyRate: next.monthlyRate, weeklyRateEnabled: next.weeklyRateEnabled, monthlyRateEnabled: next.monthlyRateEnabled },
        })
        affectedVehicleCount += 1
      }
      await audit(tx, {
        actorId: input.actorId,
        action: "pricing.bulk_rate_action",
        targetType: "FleetRateSet",
        targetId: input.fleetRateSetId,
        before: { revision: input.expectedRevision },
        after: { revision: input.expectedRevision + 1, action: input.action, affectedVehicleCount },
      })
      return { revision: input.expectedRevision + 1, affectedVehicleCount }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async updatePricingRules(input: {
    actorId: string
    pricingVersionId: string
    expectedRevision: number
    configuration: PricingBillingConfiguration
    changeSummary: string
    businessTimeZone?: string
    weeklyOpeningHours?: WeeklyOpeningHours
    openingHoursExceptions?: BusinessHoursException[]
    handoverPolicy?: HandoverPolicy
    client: PrismaClient
  }) {
    return input.client.$transaction(async (tx) => {
      await requireDatabaseCapability(tx, input.actorId, CAPABILITIES.PRICING_MANAGE)
      const current = await tx.configurationVersion.findUnique({
        where: { id: input.pricingVersionId },
        include: { pricingBilling: true },
      })
      if (!current?.pricingBilling) throw new ConfigurationWorkflowError("CONFIGURATION_NOT_FOUND", "Pricing draft not found.", "VALIDATION")
      const locked = await tx.configurationVersion.updateMany({
        where: { id: input.pricingVersionId, domain: "PRICING_BILLING", revision: input.expectedRevision, status: { in: ["DRAFT", "VALIDATED"] } },
        data: { revision: { increment: 1 }, status: "DRAFT", validationStatus: "NOT_VALIDATED", validationSnapshot: Prisma.JsonNull, changeSummary: input.changeSummary, updatedById: input.actorId },
      })
      if (locked.count !== 1) throw new ConfigurationWorkflowError("OPTIMISTIC_LOCK_FAILED", "Pricing rules changed.", "CONFLICT")
      await tx.pricingBillingConfigVersion.update({ where: { configurationVersionId: input.pricingVersionId }, data: pricingData(input.configuration) })

      const draftRelease = await tx.businessConfigurationRelease.findFirst({ where: { status: { in: ["DRAFT", "VALIDATED"] } }, include: { generalRentalConfig: { include: { version: true } } }, orderBy: { updatedAt: "desc" } })
      const activeGeneral = await tx.businessConfigurationRelease.findFirst({
          where: { status: "ACTIVE" },
          select: { generalRentalConfig: { select: {
            businessTimeZone: true,
            weeklyOpeningHours: true,
            openingHoursExceptions: true,
            handoverPolicy: true,
          } } },
        })
      const activeTimeZone = activeGeneral?.generalRentalConfig.businessTimeZone ?? "UTC"
      const activeOpeningHours = activeGeneral?.generalRentalConfig.weeklyOpeningHours
      const openingHoursChanged = input.weeklyOpeningHours !== undefined &&
        !weeklyOpeningHoursEqual(input.weeklyOpeningHours, activeOpeningHours)
      const exceptionsChanged = input.openingHoursExceptions !== undefined &&
        !openingHoursExceptionsEqual(input.openingHoursExceptions, activeGeneral?.generalRentalConfig.openingHoursExceptions)
      const handoverPolicyChanged = input.handoverPolicy !== undefined &&
        !handoverPoliciesEqual(input.handoverPolicy, activeGeneral?.generalRentalConfig.handoverPolicy)
      if (!draftRelease) {
        if ((input.businessTimeZone && input.businessTimeZone !== activeTimeZone) || openingHoursChanged || exceptionsChanged || handoverPolicyChanged) {
          throw new ConfigurationWorkflowError("RELEASE_INCOMPLETE", "Attach the pricing drafts to a release before changing its timezone or handover schedule.", "VALIDATION")
        }
      }
      const draftOpeningHoursChanged = input.weeklyOpeningHours !== undefined && draftRelease &&
        !weeklyOpeningHoursEqual(input.weeklyOpeningHours, draftRelease.generalRentalConfig.weeklyOpeningHours)
      const draftTimeZoneChanged = Boolean(input.businessTimeZone && draftRelease && input.businessTimeZone !== draftRelease.generalRentalConfig.businessTimeZone)
      const draftExceptionsChanged = input.openingHoursExceptions !== undefined && draftRelease &&
        !openingHoursExceptionsEqual(input.openingHoursExceptions, draftRelease.generalRentalConfig.openingHoursExceptions)
      const draftHandoverPolicyChanged = input.handoverPolicy !== undefined && draftRelease &&
        !handoverPoliciesEqual(input.handoverPolicy, draftRelease.generalRentalConfig.handoverPolicy)
      if (draftRelease && (draftTimeZoneChanged || draftOpeningHoursChanged || draftExceptionsChanged || draftHandoverPolicyChanged)) {
        let generalVersionId = draftRelease.generalRentalConfigVersionId
        if (["RELEASED", "ARCHIVED"].includes(draftRelease.generalRentalConfig.version.status)) {
          const next = (await tx.configurationVersion.aggregate({ where: { domain: "GENERAL_RENTAL" }, _max: { versionNumber: true } }))._max.versionNumber ?? 0
          const created = await tx.configurationVersion.create({
            data: {
              domain: "GENERAL_RENTAL",
              versionNumber: next + 1,
              changeSummary: "Business hours or timezone update",
              createdById: input.actorId,
              updatedById: input.actorId,
              generalRental: { create: {
                businessTimeZone: input.businessTimeZone ?? draftRelease.generalRentalConfig.businessTimeZone,
                currency: draftRelease.generalRentalConfig.currency,
                supportedLocales: draftRelease.generalRentalConfig.supportedLocales,
                weeklyOpeningHours: (input.weeklyOpeningHours ?? draftRelease.generalRentalConfig.weeklyOpeningHours) as unknown as Prisma.InputJsonValue,
                openingHoursExceptions: (input.openingHoursExceptions ?? draftRelease.generalRentalConfig.openingHoursExceptions) as unknown as Prisma.InputJsonValue,
                handoverPolicy: (input.handoverPolicy ?? draftRelease.generalRentalConfig.handoverPolicy) as unknown as Prisma.InputJsonValue,
              } },
            },
          })
          generalVersionId = created.id
        } else {
          await tx.generalRentalConfigVersion.update({
            where: { configurationVersionId: generalVersionId },
            data: {
              businessTimeZone: input.businessTimeZone,
              weeklyOpeningHours: input.weeklyOpeningHours as unknown as Prisma.InputJsonValue | undefined,
              openingHoursExceptions: input.openingHoursExceptions as unknown as Prisma.InputJsonValue | undefined,
              handoverPolicy: input.handoverPolicy as unknown as Prisma.InputJsonValue | undefined,
            },
          })
          await tx.configurationVersion.update({ where: { id: generalVersionId }, data: { revision: { increment: 1 }, status: "DRAFT", validationStatus: "NOT_VALIDATED", updatedById: input.actorId } })
        }
        await tx.businessConfigurationRelease.update({ where: { id: draftRelease.id }, data: { generalRentalConfigVersionId: generalVersionId, status: "DRAFT", validationStatus: "NOT_VALIDATED", validationSnapshot: Prisma.JsonNull, revision: { increment: 1 }, updatedById: input.actorId } })
      }
      const changedFields = Object.keys(pricingData(input.configuration)).filter((key) => {
        const before = current.pricingBilling as unknown as Record<string, unknown>
        const after = pricingData(input.configuration) as unknown as Record<string, unknown>
        return before[key] !== after[key]
      })
      await audit(tx, {
        actorId: input.actorId,
        action: changedFields.some((field) => ["billableDayMethod", "gracePeriodMinutes", "preparationBufferMinutes", "minimumRentalMinutes", "minimumChargeDays"].includes(field)) ? "pricing.billing_rules_changed" : "pricing.strategy_changed",
        targetType: "ConfigurationVersion",
        targetId: input.pricingVersionId,
        before: { revision: input.expectedRevision, strategy: current.pricingBilling.mixedDurationStrategy },
        after: {
          revision: input.expectedRevision + 1,
          strategy: input.configuration.mixedDurationStrategy,
          changedFields,
          businessTimeZoneChanged: draftTimeZoneChanged,
          weeklyOpeningHoursChanged: draftOpeningHoursChanged,
          openingHoursExceptionsChanged: draftExceptionsChanged,
          handoverPolicyChanged: draftHandoverPolicyChanged,
          changeSummary: input.changeSummary,
        },
      })
      return { revision: input.expectedRevision + 1 }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async attachDraftsToRelease(input: {
    actorId: string
    pricingVersionId: string
    fleetRateSetId: string
    expectedReleaseRevision?: number
    client: PrismaClient
  }) {
    return input.client.$transaction(async (tx) => {
      await requireDatabaseCapability(tx, input.actorId, CAPABILITIES.PRICING_MANAGE)
      const [pricing, fleet, active, draft] = await Promise.all([
        tx.configurationVersion.findFirst({ where: { id: input.pricingVersionId, domain: "PRICING_BILLING", status: { in: ["DRAFT", "VALIDATED"] } } }),
        tx.fleetRateSet.findFirst({ where: { id: input.fleetRateSetId, status: { in: ["DRAFT", "VALIDATED"] } } }),
        tx.businessConfigurationRelease.findFirst({ where: { status: "ACTIVE" } }),
        tx.businessConfigurationRelease.findFirst({ where: { status: { in: ["DRAFT", "VALIDATED"] } }, orderBy: { updatedAt: "desc" } }),
      ])
      if (!pricing || !fleet) throw new ConfigurationWorkflowError("CONFIGURATION_NOT_FOUND", "Pricing drafts not found.", "VALIDATION")
      let releaseId: string
      if (draft) {
        if (input.expectedReleaseRevision !== undefined && draft.revision !== input.expectedReleaseRevision) throw new ConfigurationWorkflowError("OPTIMISTIC_LOCK_FAILED", "Release draft changed.", "CONFLICT")
        const updated = await tx.businessConfigurationRelease.updateMany({
          where: { id: draft.id, revision: draft.revision, status: { in: ["DRAFT", "VALIDATED"] } },
          data: { pricingBillingConfigVersionId: pricing.id, fleetRateSetId: fleet.id, status: "DRAFT", validationStatus: "NOT_VALIDATED", validationSnapshot: Prisma.JsonNull, revision: { increment: 1 }, updatedById: input.actorId },
        })
        if (updated.count !== 1) throw new ConfigurationWorkflowError("OPTIMISTIC_LOCK_FAILED", "Release draft changed.", "CONFLICT")
        releaseId = draft.id
      } else {
        if (!active) throw new ConfigurationWorkflowError("RELEASE_INCOMPLETE", "A complete base release is required before pricing drafts can be attached.", "VALIDATION")
        const next = (await tx.businessConfigurationRelease.aggregate({ _max: { releaseNumber: true } }))._max.releaseNumber ?? 0
        const created = await tx.businessConfigurationRelease.create({
          data: {
            releaseNumber: next + 1,
            name: `Pricing update ${next + 1}`,
            changeSummary: "Pricing and billing draft",
            generalRentalConfigVersionId: active.generalRentalConfigVersionId,
            pricingBillingConfigVersionId: pricing.id,
            fleetRateSetId: fleet.id,
            insuranceConfigVersionId: active.insuranceConfigVersionId,
            customerDriverConfigVersionId: active.customerDriverConfigVersionId,
            bookingWorkflowConfigVersionId: active.bookingWorkflowConfigVersionId,
            documentPolicyConfigVersionId: active.documentPolicyConfigVersionId,
            paymentConfigVersionId: active.paymentConfigVersionId,
            confirmationConfigVersionId: active.confirmationConfigVersionId,
            legalAcceptanceConfigVersionId: active.legalAcceptanceConfigVersionId,
            supersedesReleaseId: active.id,
            createdById: input.actorId,
            updatedById: input.actorId,
          },
        })
        releaseId = created.id
      }
      await audit(tx, { actorId: input.actorId, action: "pricing.drafts_attached_to_release", targetType: "BusinessConfigurationRelease", targetId: releaseId, releaseId, after: { pricingVersionId: pricing.id, fleetRateSetId: fleet.id } })
      return { releaseId }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async persistValidation(input: {
    actorId: string
    pricingVersionId: string
    fleetRateSetId: string
    pricingRevision: number
    fleetRevision: number
    outcome: "VALID" | "WARNING" | "BLOCKED"
    issues: Array<{ code: string; severity: string; field?: string; affectedResource?: string; message: string }>
    client: PrismaClient
  }) {
    return input.client.$transaction(async (tx) => {
      await requireDatabaseCapability(tx, input.actorId, CAPABILITIES.CONFIGURATION_VALIDATE)
      const now = new Date()
      const snapshot = { outcome: input.outcome, issues: input.issues, validatedAt: now.toISOString() } as Prisma.InputJsonValue
      const pricing = await tx.configurationVersion.updateMany({ where: { id: input.pricingVersionId, revision: input.pricingRevision, status: { in: ["DRAFT", "VALIDATED"] } }, data: { revision: { increment: 1 }, status: input.outcome === "BLOCKED" ? "DRAFT" : "VALIDATED", validationStatus: input.outcome, validationSnapshot: snapshot, validatedById: input.actorId, validatedAt: now, updatedById: input.actorId } })
      const fleet = await tx.fleetRateSet.updateMany({ where: { id: input.fleetRateSetId, revision: input.fleetRevision, status: { in: ["DRAFT", "VALIDATED"] } }, data: { revision: { increment: 1 }, status: input.outcome === "BLOCKED" ? "DRAFT" : "VALIDATED", validationStatus: input.outcome, validationSnapshot: snapshot, validatedById: input.actorId, validatedAt: now, updatedById: input.actorId } })
      if (pricing.count !== 1 || fleet.count !== 1) throw new ConfigurationWorkflowError("OPTIMISTIC_LOCK_FAILED", "Pricing draft changed during validation.", "CONFLICT")
      await audit(tx, { actorId: input.actorId, action: "pricing.draft_validated", targetType: "PricingWorkspace", targetId: input.pricingVersionId, after: { outcome: input.outcome, blockerCount: input.issues.filter(({ severity }) => severity === "BLOCKER").length, warningCount: input.issues.filter(({ severity }) => severity === "WARNING").length } })
      return { outcome: input.outcome }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async discardDrafts(input: { actorId: string; pricingVersionId: string; fleetRateSetId: string; client: PrismaClient }) {
    return input.client.$transaction(async (tx) => {
      await requireDatabaseCapability(tx, input.actorId, CAPABILITIES.PRICING_MANAGE)
      const [pricing, fleet, active, draft] = await Promise.all([
        tx.configurationVersion.findUnique({ where: { id: input.pricingVersionId } }),
        tx.fleetRateSet.findUnique({ where: { id: input.fleetRateSetId } }),
        tx.businessConfigurationRelease.findFirst({ where: { status: "ACTIVE" } }),
        tx.businessConfigurationRelease.findFirst({ where: { status: { in: ["DRAFT", "VALIDATED"] }, OR: [{ pricingBillingConfigVersionId: input.pricingVersionId }, { fleetRateSetId: input.fleetRateSetId }] } }),
      ])
      if (!pricing || !fleet || !["DRAFT", "VALIDATED"].includes(pricing.status) || !["DRAFT", "VALIDATED"].includes(fleet.status)) throw new ConfigurationWorkflowError("CONFIGURATION_NOT_FOUND", "Editable pricing drafts not found.", "VALIDATION")
      if (draft) {
        if (!active) throw new ConfigurationWorkflowError("RELEASE_INCOMPLETE", "Detach these drafts from the release before discarding them.", "VALIDATION")
        await tx.businessConfigurationRelease.update({ where: { id: draft.id }, data: { pricingBillingConfigVersionId: active.pricingBillingConfigVersionId, fleetRateSetId: active.fleetRateSetId, status: "DRAFT", validationStatus: "NOT_VALIDATED", validationSnapshot: Prisma.JsonNull, revision: { increment: 1 }, updatedById: input.actorId } })
      }
      await tx.vehicleRentalRate.deleteMany({ where: { fleetRateSetId: fleet.id } })
      await tx.fleetRateSet.delete({ where: { id: fleet.id } })
      await tx.pricingBillingConfigVersion.delete({ where: { configurationVersionId: pricing.id } })
      await tx.configurationVersion.delete({ where: { id: pricing.id } })
      await audit(tx, { actorId: input.actorId, action: "pricing.draft_discarded", targetType: "PricingWorkspace", targetId: pricing.id, before: { pricingVersionNumber: pricing.versionNumber, fleetRateSetVersionNumber: fleet.versionNumber }, after: { discarded: true } })
      return { discarded: true }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async auditPreview(input: { actorId: string; vehicleId: string; hasLive: boolean; hasDraft: boolean }) {
    await audit(this.db, { actorId: input.actorId, action: "pricing.preview_generated", targetType: "Car", targetId: input.vehicleId, after: { liveCompared: input.hasLive, draftCompared: input.hasDraft } })
  }
}
