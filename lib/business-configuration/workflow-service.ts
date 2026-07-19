import { Prisma, type PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/db"
import { calculatePricing } from "@/lib/pricing/engine"
import { money } from "@/lib/pricing/money"
import {
  CONFIGURATION_DOMAIN_IDS,
  configurationValidationResult,
  type ConfigurationDomainId,
  type ConfigurationValidationIssue,
} from "./types"
import { evaluateConfigurationHealth, type ConfigurationHealthFinding } from "./health"
import { validateBusinessConfigurationRelease, validateConfigurationDomain } from "./validation"
import { CONFIGURATION_DOMAIN_METADATA } from "./domain-metadata"
import { PrismaBusinessConfigurationRepository, type ConfigurationDbClient } from "./prisma-repository"
import type { ReleaseAggregate } from "./repositories"
import { ConfigurationWorkflowError } from "./workflow-errors"
import { CAPABILITIES } from "@/lib/authorization/capabilities"
import { databaseUserHasCapability } from "@/lib/authorization/database-capabilities"
import { resolveEffectiveBookingFields } from "@/lib/booking-configuration/field-resolver"
import { validateBookingWorkflow } from "@/lib/booking-configuration/workflow"
import { loadPhase6ConfigurationPage } from "@/lib/phase6-admin/service"

const IMPLEMENTED_PAYMENT_METHODS = ["BOOKING_REQUEST", "BANK_TRANSFER", "CASH_ON_PICKUP"] as const

export interface FleetCoverageSummary {
  totalVehicles: number
  dailyRates: number
  missingDailyRates: number
  missingWeeklyRates: number
  missingMonthlyRates: number
  missingAllReleaseRates: number
}

export interface DomainStatusView {
  domain: ConfigurationDomainId
  label: string
  route: string
  liveVersion?: number
  draftVersion?: number
  configured: boolean
  validationStatus: string
  warningCount: number
  blockerCount: number
  status: string
}

export interface ConfigurationOverview {
  overallStatus: string
  activeRelease: ReleaseAggregate | null
  draftRelease: ReleaseAggregate | null
  changedDomains: ConfigurationDomainId[]
  domainStatuses: DomainStatusView[]
  blockers: ConfigurationHealthFinding[]
  warnings: ConfigurationHealthFinding[]
  notices: ConfigurationHealthFinding[]
  fleetCoverage: FleetCoverageSummary
  legalHealth: {
    requiredTypes: string[]
    publishedLanguages: string[]
    missingTranslations: string[]
    unpublishedDrafts: number
    configured: boolean
  }
  recentAuditEvents: Awaited<ReturnType<PrismaBusinessConfigurationRepository["listRecentConfigurationEvents"]>>
}

function routeFor(domain: ConfigurationDomainId) {
  return CONFIGURATION_DOMAIN_METADATA[domain].route
}

function issueWithRoute(issue: ConfigurationValidationIssue): ConfigurationValidationIssue {
  return { ...issue }
}

function fleetIssues(
  release: ReleaseAggregate,
  vehicles: Array<{ id: string; name: string }>,
): ConfigurationValidationIssue[] {
  const pricing = release.domains["pricing-billing"]
  const byVehicle = new Map(release.fleetRateSet.rates.map((rate) => [rate.vehicleId, rate]))
  const issues: ConfigurationValidationIssue[] = []
  if (pricing?.rentalMonthDefinition === "CALENDAR_MONTH") {
    issues.push({
      code: "pricing.calendar_month_unsupported",
      domain: "pricing-billing",
      severity: "BLOCKER",
      adminMessage: "Calendar-month pricing is not supported by the current pricing engine.",
      remediation: "Choose a fixed 28-day or fixed 30-day month.",
    })
  }
  if (
    pricing &&
    pricing.mixedDurationStrategy !== "DAILY_ONLY" &&
    !pricing.weeklyPricingEnabled &&
    !pricing.monthlyPricingEnabled
  ) {
    issues.push({
      code: "pricing.strategy_period_rate_disabled",
      domain: "pricing-billing",
      severity: "BLOCKER",
      adminMessage: "The selected pricing strategy has no longer-period rates enabled.",
      remediation: "Enable weekly or monthly pricing, or charge every day separately.",
    })
  }
  for (const vehicle of vehicles) {
    const rate = byVehicle.get(vehicle.id)
    if (!rate || rate.dailyRate <= 0) {
      issues.push({
        code: "fleet.daily_rate_missing",
        domain: "pricing-billing",
        severity: "BLOCKER",
        affectedResource: vehicle.name,
        adminMessage: "A bookable vehicle has no valid daily rate in this release.",
        remediation: "Add a positive daily rate before activation.",
      })
    }
    if (pricing?.weeklyPricingEnabled && (!rate?.weeklyRateEnabled || !rate.weeklyRate || rate.weeklyRate <= 0)) {
      issues.push({
        code: "fleet.weekly_rate_missing",
        domain: "pricing-billing",
        severity: "BLOCKER",
        affectedResource: vehicle.name,
        adminMessage: "Weekly pricing is enabled, but this vehicle has no valid weekly rate.",
        remediation: "Add a weekly rate or disable weekly pricing in the draft.",
      })
    }
    if (pricing?.monthlyPricingEnabled && (!rate?.monthlyRateEnabled || !rate.monthlyRate || rate.monthlyRate <= 0)) {
      issues.push({
        code: "fleet.monthly_rate_missing",
        domain: "pricing-billing",
        severity: "BLOCKER",
        affectedResource: vehicle.name,
        adminMessage: "Monthly pricing is enabled, but this vehicle has no valid monthly rate.",
        remediation: "Add a monthly rate or disable monthly pricing in the draft.",
      })
    }
    if (rate?.weeklyRateEnabled && rate.weeklyRate && rate.weeklyRate >= rate.dailyRate * 7) {
      issues.push({
        code: "rates.no_weekly_saving",
        domain: "pricing-billing",
        severity: "WARNING",
        affectedResource: vehicle.name,
        adminMessage: "The weekly price is not lower than seven daily prices.",
        remediation: "Confirm this intentional price structure before activation.",
      })
    }
    const monthDays = pricing?.rentalMonthDefinition === "FIXED_28_DAYS" ? 28 : 30
    if (rate?.monthlyRateEnabled && rate.monthlyRate && rate.monthlyRate >= rate.dailyRate * monthDays) {
      issues.push({
        code: "rates.no_monthly_saving",
        domain: "pricing-billing",
        severity: "WARNING",
        affectedResource: vehicle.name,
        adminMessage: "The monthly price is not lower than the comparable daily price.",
        remediation: "Confirm this intentional price structure before activation.",
      })
    }
  }
  if (release.fleetRateSet.currency !== release.domains["general-rental"]?.currency) {
    issues.push({
      code: "fleet.currency_mismatch",
      domain: "pricing-billing",
      severity: "BLOCKER",
      adminMessage: "The fleet rate currency does not match the release currency.",
      remediation: "Use one currency for the release and every vehicle rate.",
    })
  }
  return issues
}

function staleIssues(release: ReleaseAggregate, active: ReleaseAggregate | null): ConfigurationValidationIssue[] {
  const issues: ConfigurationValidationIssue[] = []
  if ((active && release.supersedesReleaseId !== active.id) || (!active && release.supersedesReleaseId)) {
    issues.push({
      code: "release.stale_base_release",
      domain: "general-rental",
      severity: "BLOCKER",
      adminMessage: "This draft was prepared against a different live release.",
      remediation: "Refresh the draft from the current live release before activation.",
    })
  }
  if (!active) return issues
  issues.push(
    ...CONFIGURATION_DOMAIN_IDS.flatMap((domain) =>
      release.versions[domain].versionNumber < active.versions[domain].versionNumber
        ? [
            {
              code: "release.stale_domain_version",
              domain,
              severity: "BLOCKER" as const,
              affectedResource: CONFIGURATION_DOMAIN_METADATA[domain].label,
              adminMessage: "This draft references an older version than the live configuration.",
              remediation: "Refresh the draft with the latest live version before activation.",
            },
          ]
        : [],
    ),
  )
  return issues
}

export function validateReleaseAggregate(
  release: ReleaseAggregate,
  active: ReleaseAggregate | null,
  vehicles: Array<{ id: string; name: string }>,
) {
  const base = validateBusinessConfigurationRelease({
    domains: release.domains,
    bookableVehicleIds: vehicles.map(({ id }) => id),
    fleetRates: release.fleetRateSet.rates.map((rate) => ({
      vehicleId: rate.vehicleId,
      dailyRate: rate.dailyRate,
      weeklyRate: rate.weeklyRate,
      monthlyRate: rate.monthlyRate,
      weeklyRateEnabled: rate.weeklyRateEnabled,
      monthlyRateEnabled: rate.monthlyRateEnabled,
    })),
    implementedPaymentMethods: [...IMPLEMENTED_PAYMENT_METHODS],
  })
  const insurance = release.domains.insurance
  const customerDriver = release.domains["customer-driver-requirements"]
  const workflow = release.domains["booking-workflow"]
  const legal = release.domains["legal-acceptance"]
  const phase6WorkflowIssues =
    insurance && customerDriver && workflow
      ? validateBookingWorkflow({
          workflow,
          insurance,
          legal,
          fields: resolveEffectiveBookingFields(customerDriver),
        })
      : []
  return configurationValidationResult([
    ...base.issues.map(issueWithRoute),
    ...phase6WorkflowIssues,
    ...fleetIssues(release, vehicles),
    ...staleIssues(release, active),
  ])
}

function changedDomains(active: ReleaseAggregate | null, draft: ReleaseAggregate | null) {
  if (!draft) return []
  if (!active) return [...CONFIGURATION_DOMAIN_IDS]
  return CONFIGURATION_DOMAIN_IDS.filter((domain) => active.versions[domain].id !== draft.versions[domain].id)
}

function coverage(
  release: ReleaseAggregate | null,
  vehicles: Array<{ id: string; name: string }>,
): FleetCoverageSummary {
  const rates = new Map(release?.fleetRateSet.rates.map((rate) => [rate.vehicleId, rate]) ?? [])
  const pricing = release?.domains["pricing-billing"]
  return {
    totalVehicles: vehicles.length,
    dailyRates: vehicles.filter(({ id }) => (rates.get(id)?.dailyRate ?? 0) > 0).length,
    missingDailyRates: vehicles.filter(({ id }) => (rates.get(id)?.dailyRate ?? 0) <= 0).length,
    missingWeeklyRates: pricing?.weeklyPricingEnabled
      ? vehicles.filter(({ id }) => !rates.get(id)?.weeklyRateEnabled || (rates.get(id)?.weeklyRate ?? 0) <= 0).length
      : 0,
    missingMonthlyRates: pricing?.monthlyPricingEnabled
      ? vehicles.filter(({ id }) => !rates.get(id)?.monthlyRateEnabled || (rates.get(id)?.monthlyRate ?? 0) <= 0).length
      : 0,
    missingAllReleaseRates: vehicles.filter(({ id }) => !rates.has(id)).length,
  }
}

export async function loadConfigurationOverview(options?: {
  db?: ConfigurationDbClient
  includeAudit?: boolean
}): Promise<ConfigurationOverview> {
  const repository = new PrismaBusinessConfigurationRepository(options?.db ?? prisma)
  // Keep each read batch below the production Prisma pool limit. This overview is
  // rendered alongside the admin layout, so an unbounded fan-out can otherwise
  // starve authentication and step-specific queries on serverless instances.
  const [activeRelease, draftRelease, vehicles] = await Promise.all([
    repository.findActiveRelease(),
    repository.findLatestDraftRelease(),
    repository.listBookableVehicles(),
  ])
  const [legalEvidence, recentAuditEvents, pricingDraftEvidence] = await Promise.all([
    repository.listPublishedLegalEvidence(),
    options?.includeAudit === false ? [] : repository.listRecentConfigurationEvents(20),
    repository.findLatestPricingDraftEvidence(),
  ])
  const phase6DraftEvidence = await loadPhase6ConfigurationPage(options?.db ?? prisma, {
    activeRelease,
    draftRelease,
    bookableVehicles: vehicles,
  })
  const changed = changedDomains(activeRelease, draftRelease)
  const pricingDraftIsIndependent = Boolean(
    pricingDraftEvidence && pricingDraftEvidence.pricingVersionId !== draftRelease?.versions["pricing-billing"].id,
  )
  if (pricingDraftIsIndependent && !changed.includes("pricing-billing")) changed.push("pricing-billing")
  const phase6DraftByDomain = {
    insurance: phase6DraftEvidence.draftInsurance,
    "customer-driver-requirements": phase6DraftEvidence.draftCustomerDriver,
    "booking-workflow": phase6DraftEvidence.draftWorkflow,
  } as const
  for (const domain of ["insurance", "customer-driver-requirements", "booking-workflow"] as const) {
    const independent =
      phase6DraftByDomain[domain] && phase6DraftByDomain[domain]?.id !== draftRelease?.versions[domain].id
    if (independent && !changed.includes(domain)) changed.push(domain)
  }
  const candidate = draftRelease ?? activeRelease
  const validation = candidate
    ? validateReleaseAggregate(candidate, draftRelease ? activeRelease : null, vehicles)
    : undefined
  const pricingEvidenceRelease = pricingDraftEvidence
    ? ({
        ...(candidate ?? {}),
        domains: {
          ...(candidate?.domains ?? {}),
          "pricing-billing": pricingDraftEvidence.configuration,
          "general-rental": candidate?.domains["general-rental"] ?? {
            businessTimeZone: "UTC",
            currency: pricingDraftEvidence.fleetRateSet.currency,
            supportedLocales: ["en"],
          },
        },
        fleetRateSet: pricingDraftEvidence.fleetRateSet,
      } as ReleaseAggregate)
    : null
  const pricingEvidenceValidation = pricingEvidenceRelease
    ? configurationValidationResult([
        ...validateConfigurationDomain("pricing-billing", pricingDraftEvidence!.configuration).issues,
        ...fleetIssues(pricingEvidenceRelease, vehicles),
      ])
    : undefined
  const validationForDomain = (domain: ConfigurationDomainId) => {
    const releaseIssues = validation?.issues.filter((issue) => issue.domain === domain) ?? []
    const evidenceIssues = domain === "pricing-billing"
      ? (pricingEvidenceValidation?.issues ?? [])
      : domain in phase6DraftByDomain && phase6DraftByDomain[domain as keyof typeof phase6DraftByDomain]
        ? phase6DraftEvidence.issues.filter((issue) => issue.domain === domain)
        : []
    if (!validation && evidenceIssues.length === 0) return undefined

    const unique = new Map(
      [...releaseIssues, ...evidenceIssues].map((issue) => [
        `${issue.domain}:${issue.code}:${issue.field ?? ""}:${issue.affectedResource ?? ""}`,
        issue,
      ]),
    )
    return configurationValidationResult([...unique.values()])
  }
  const health = evaluateConfigurationHealth(
    CONFIGURATION_DOMAIN_IDS.map((domain) => ({
      domain,
      configured:
        domain === "pricing-billing"
          ? Boolean(activeRelease?.versions[domain] || draftRelease?.versions[domain] || pricingDraftEvidence)
          : domain in phase6DraftByDomain
            ? Boolean(
                activeRelease?.versions[domain] ||
                draftRelease?.versions[domain] ||
                phase6DraftByDomain[domain as keyof typeof phase6DraftByDomain],
              )
            : Boolean(activeRelease?.versions[domain] || draftRelease?.versions[domain]),
      hasDraftChanges: changed.includes(domain),
      validation: validationForDomain(domain),
      adminRoute: routeFor(domain),
    })),
  )
  const published = legalEvidence.filter(({ status }) => status === "PUBLISHED")
  const requiredTypes = ["RENTAL_TERMS", "PRIVACY_NOTICE"]
  const supportedLocales = candidate?.domains["general-rental"]?.supportedLocales ?? []
  const missingTranslations = requiredTypes.flatMap((type) => {
    const document = published.find((item) => item.type === type)
    return supportedLocales
      .filter((locale) => !document?.locales.includes(locale))
      .map((locale) => `${type === "RENTAL_TERMS" ? "Rental terms" : "Privacy notice"}: ${locale}`)
  })
  return {
    overallStatus: health.status,
    activeRelease,
    draftRelease,
    changedDomains: changed,
    domainStatuses: health.domains.map((domainHealth) => ({
      domain: domainHealth.domain,
      label: CONFIGURATION_DOMAIN_METADATA[domainHealth.domain].label,
      route: routeFor(domainHealth.domain),
      liveVersion: activeRelease?.versions[domainHealth.domain].versionNumber,
      draftVersion:
        domainHealth.domain === "pricing-billing"
          ? (pricingDraftEvidence?.pricingVersionNumber ?? draftRelease?.versions[domainHealth.domain].versionNumber)
          : domainHealth.domain in phase6DraftByDomain
            ? (phase6DraftByDomain[domainHealth.domain as keyof typeof phase6DraftByDomain]?.versionNumber ??
              draftRelease?.versions[domainHealth.domain].versionNumber)
            : draftRelease?.versions[domainHealth.domain].versionNumber,
      configured: Boolean(
        activeRelease?.versions[domainHealth.domain] ||
        draftRelease?.versions[domainHealth.domain] ||
        (domainHealth.domain in phase6DraftByDomain &&
          phase6DraftByDomain[domainHealth.domain as keyof typeof phase6DraftByDomain]),
      ),
      validationStatus:
        domainHealth.domain === "pricing-billing"
          ? (pricingDraftEvidence?.pricingValidationStatus ??
            draftRelease?.versions[domainHealth.domain].validationStatus ??
            activeRelease?.versions[domainHealth.domain].validationStatus ??
            "NOT_VALIDATED")
          : domainHealth.domain in phase6DraftByDomain
            ? (phase6DraftByDomain[domainHealth.domain as keyof typeof phase6DraftByDomain]?.validationStatus ??
              draftRelease?.versions[domainHealth.domain].validationStatus ??
              activeRelease?.versions[domainHealth.domain].validationStatus ??
              "NOT_VALIDATED")
            : (draftRelease?.versions[domainHealth.domain].validationStatus ??
              activeRelease?.versions[domainHealth.domain].validationStatus ??
              "NOT_VALIDATED"),
      warningCount: domainHealth.warnings.length,
      blockerCount: domainHealth.blockers.length,
      status: domainHealth.status,
    })),
    blockers: health.blockers,
    warnings: health.warnings,
    notices: health.notices,
    fleetCoverage: coverage(pricingEvidenceRelease ?? candidate, vehicles),
    legalHealth: {
      requiredTypes,
      publishedLanguages: [...new Set(published.flatMap(({ locales }) => locales))].sort(),
      missingTranslations,
      unpublishedDrafts: legalEvidence.filter(({ status }) => status === "DRAFT").length,
      configured: requiredTypes.every((type) => published.some((document) => document.type === type)),
    },
    recentAuditEvents,
  }
}

function validationSnapshot(result: ReturnType<typeof validateReleaseAggregate>) {
  return {
    outcome: result.outcome,
    issueCount: result.issues.length,
    issues: result.issues.map(({ code, severity, domain, affectedResource, adminMessage, remediation }) => ({
      code,
      severity,
      domain,
      affectedResource,
      message: adminMessage,
      suggestedAction: remediation,
      adminRoute: routeFor(domain),
    })),
    validatedAt: new Date().toISOString(),
  }
}

function statusFromOutcome(outcome: "VALID" | "WARNING" | "BLOCKED") {
  return outcome
}

export async function validateDraftRelease(releaseId: string, actorId: string, db: PrismaClient = prisma) {
  return db.$transaction(
    async (tx) => {
      if (!(await databaseUserHasCapability(tx, actorId, CAPABILITIES.CONFIGURATION_VALIDATE))) {
        throw new ConfigurationWorkflowError(
          "CAPABILITY_REQUIRED",
          "Validation capability is required.",
          "AUTHORIZATION",
        )
      }
      await tx.$queryRaw`SELECT id FROM "BusinessConfigurationRelease" WHERE id = ${releaseId} FOR UPDATE`
      const repository = new PrismaBusinessConfigurationRepository(tx)
      const [release, active, vehicles] = await Promise.all([
        repository.findReleaseAggregate(releaseId),
        repository.findActiveRelease(),
        repository.listBookableVehicles(),
      ])
      if (!release) throw new ConfigurationWorkflowError("RELEASE_NOT_FOUND", "Draft release not found.", "VALIDATION")
      if (release.status === "ACTIVE")
        throw new ConfigurationWorkflowError("RELEASE_ALREADY_ACTIVE", "Release is already active.", "CONFLICT")
      if (!(["DRAFT", "VALIDATED"] as const).includes(release.status as "DRAFT" | "VALIDATED")) {
        throw new ConfigurationWorkflowError("RELEASE_INVALID", "Only a current draft can be validated.", "VALIDATION")
      }
      const result = validateReleaseAggregate(release, active, vehicles)
      const snapshot = validationSnapshot(result)
      const now = new Date()

      for (const domain of CONFIGURATION_DOMAIN_IDS) {
        const domainResult = validateConfigurationDomain(domain, release.domains[domain])
        if (release.versions[domain].status === "RELEASED") continue
        await tx.configurationVersion.update({
          where: { id: release.versions[domain].id },
          data: {
            status: domainResult.outcome === "BLOCKED" ? "DRAFT" : "VALIDATED",
            validationStatus: statusFromOutcome(domainResult.outcome),
            validationSnapshot: validationSnapshot(domainResult) as unknown as Prisma.InputJsonValue,
            validatedById: actorId,
            validatedAt: now,
            updatedById: actorId,
            revision: { increment: 1 },
          },
        })
      }

      const fleetBlockers = result.issues.filter(({ code }) => code.startsWith("fleet."))
      if (release.fleetRateSet.status !== "RELEASED") {
        await tx.fleetRateSet.update({
          where: { id: release.fleetRateSet.id },
          data: {
            status: fleetBlockers.length ? "DRAFT" : "VALIDATED",
            validationStatus: fleetBlockers.length ? "BLOCKED" : "VALID",
            validationSnapshot: {
              issues: fleetBlockers,
            } as unknown as Prisma.InputJsonValue,
            validatedById: actorId,
            validatedAt: now,
            updatedById: actorId,
            revision: { increment: 1 },
          },
        })
      }

      const updated = await tx.businessConfigurationRelease.update({
        where: { id: release.id },
        data: {
          status: result.outcome === "BLOCKED" ? "DRAFT" : "VALIDATED",
          validationStatus: statusFromOutcome(result.outcome),
          validationSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          validatedById: actorId,
          validatedAt: now,
          updatedById: actorId,
          revision: { increment: 1 },
        },
        select: {
          id: true,
          revision: true,
          status: true,
          validationStatus: true,
        },
      })
      try {
        await tx.auditEvent.create({
          data: {
            actorUserId: actorId,
            category: "CONFIGURATION",
            action: "configuration.release_validated",
            targetType: "BusinessConfigurationRelease",
            targetId: release.id,
            configurationReleaseId: release.id,
            beforeSummary: {
              status: release.status,
              validationStatus: release.validationStatus,
            },
            afterSummary: {
              status: updated.status,
              validationStatus: updated.validationStatus,
              changeSummary: release.changeSummary,
              blockerCount: result.issues.filter(({ severity }) => severity === "BLOCKER").length,
              warningCount: result.issues.filter(({ severity }) => severity === "WARNING").length,
            },
          },
        })
      } catch {
        throw new ConfigurationWorkflowError(
          "AUDIT_WRITE_FAILED",
          "Validation audit could not be written.",
          "OPERATIONAL",
        )
      }
      return { release: updated, result, snapshot }
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    },
  )
}

export interface ReleasePreview {
  liveRelease?: { number: number; name: string }
  draftRelease: { id: string; number: number; name: string; revision: number }
  changedDomains: Array<{
    domain: ConfigurationDomainId
    label: string
    liveVersion?: number
    proposedVersion: number
    impact: string
  }>
  warnings: ConfigurationValidationIssue[]
  blockers: ConfigurationValidationIssue[]
  fleetCoverage: FleetCoverageSummary
  legalChanges: string[]
  pricingExamples: Array<{ days: number; total: number; currency: string }>
}

function impactFor(domain: ConfigurationDomainId) {
  const impacts: Record<ConfigurationDomainId, string> = {
    "general-rental": "May change timezone, currency, or customer language behavior for future bookings.",
    "pricing-billing": "May change rental duration or price calculation for future bookings.",
    insurance: "Insurance is not active in the Phase 4 customer flow.",
    "customer-driver-requirements": "Customer and driver forms are planned for a later phase.",
    "booking-workflow": "Configurable booking steps are planned for a later phase.",
    "document-policy": "Document collection is planned for a later phase.",
    payments: "Changes the offline payment instructions selected for future booking confirmations; no payment processing is performed.",
    confirmations: "Changes the localized content and sections shown in future booking-confirmation emails.",
    "legal-acceptance": "Changes require already-published legal documents; no legal content is shown here.",
  }
  return impacts[domain]
}

function pricingExamples(release: ReleaseAggregate) {
  const rate = release.fleetRateSet.rates[0]
  const config = release.domains["pricing-billing"]
  const general = release.domains["general-rental"]
  if (!rate || !config || !general || config.rentalMonthDefinition === "CALENDAR_MONTH") return []
  const strategy =
    config.mixedDurationStrategy === "LONGEST_BLOCKS_THEN_DAYS"
      ? "ORDERED_PERIODS"
      : config.mixedDurationStrategy === "LOWEST_VALID_TOTAL"
        ? "LOWEST_VALID_PRICE"
        : "DAILY_ONLY"
  return [1, 7, 10, 30].map((days) => {
    const pickupAt = new Date("2030-01-01T10:00:00.000Z")
    const returnAt = new Date(pickupAt.getTime() + days * 86_400_000)
    const quote = calculatePricing({
      vehicleId: rate.vehicleId,
      pickupAt,
      returnAt,
      businessTimeZone: general.businessTimeZone,
      rates: {
        daily: money(rate.dailyRate, general.currency),
        weekly: rate.weeklyRate == null ? undefined : money(rate.weeklyRate, general.currency),
        monthly: rate.monthlyRate == null ? undefined : money(rate.monthlyRate, general.currency),
        weeklyEnabled: config.weeklyPricingEnabled && rate.weeklyRateEnabled,
        monthlyEnabled: config.monthlyPricingEnabled && rate.monthlyRateEnabled,
      },
      strategy,
      persistentStrategy: config.mixedDurationStrategy,
      monthDefinition: config.rentalMonthDefinition,
      billableDayMethod: config.billableDayRule,
      minimumRentalMinutes: config.minimumRentalMinutes,
      minimumChargeDays: config.minimumChargeDays,
      gracePeriodMinutes: config.gracePeriodMinutes,
      taxTreatment: config.pricesIncludeTax ? "TAX_INCLUDED" : "TAX_EXCLUDED",
      taxRateBps: config.taxRateBps,
      source: {
        vehicleId: rate.vehicleId,
        rateSourceType: "FLEET_RATE_SET",
        rateSourceReference: rate.id,
      },
      compatibilityMode: "ACTIVE_RELEASE",
      calculatedAt: new Date("2030-01-01T00:00:00.000Z"),
    })
    return { days, total: quote.grandTotal, currency: quote.currency }
  })
}

export async function generateReleasePreview(
  releaseId: string,
  db: ConfigurationDbClient = prisma,
): Promise<ReleasePreview> {
  const repository = new PrismaBusinessConfigurationRepository(db)
  const [draft, active, vehicles] = await Promise.all([
    repository.findReleaseAggregate(releaseId),
    repository.findActiveRelease(),
    repository.listBookableVehicles(),
  ])
  if (!draft) throw new ConfigurationWorkflowError("RELEASE_NOT_FOUND", "Draft release not found.", "VALIDATION")
  return buildReleasePreview(draft, active, vehicles)
}

export function buildReleasePreview(
  draft: ReleaseAggregate,
  active: ReleaseAggregate | null,
  vehicles: Array<{ id: string; name: string }>,
): ReleasePreview {
  const validation = validateReleaseAggregate(draft, active, vehicles)
  const changes = changedDomains(active, draft)
  return {
    liveRelease: active ? { number: active.releaseNumber, name: active.name } : undefined,
    draftRelease: {
      id: draft.id,
      number: draft.releaseNumber,
      name: draft.name,
      revision: draft.revision,
    },
    changedDomains: changes.map((domain) => ({
      domain,
      label: CONFIGURATION_DOMAIN_METADATA[domain].label,
      liveVersion: active?.versions[domain].versionNumber,
      proposedVersion: draft.versions[domain].versionNumber,
      impact: impactFor(domain),
    })),
    warnings: validation.issues.filter(({ severity }) => severity === "WARNING"),
    blockers: validation.issues.filter(({ severity }) => severity === "BLOCKER"),
    fleetCoverage: coverage(draft, vehicles),
    legalChanges: changes.includes("legal-acceptance")
      ? ["The selected terms or privacy publication changes for future bookings."]
      : [],
    pricingExamples: changes.includes("pricing-billing") ? pricingExamples(draft) : [],
  }
}

export async function activateDraftRelease(input: {
  releaseId: string
  expectedRevision: number
  actorId: string
  warningsAcknowledged: boolean
  db?: PrismaClient
}) {
  const db = input.db ?? prisma
  try {
    return await db.$transaction(
      async (tx) => {
        if (!(await databaseUserHasCapability(tx, input.actorId, CAPABILITIES.CONFIGURATION_ACTIVATE))) {
          throw new ConfigurationWorkflowError(
            "CAPABILITY_REQUIRED",
            "Activation capability is required.",
            "AUTHORIZATION",
          )
        }
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('business-configuration-activation'))::text AS locked`
        await tx.$queryRaw`SELECT id FROM "BusinessConfigurationRelease" WHERE id = ${input.releaseId} FOR UPDATE`
        const repository = new PrismaBusinessConfigurationRepository(tx)
        const [draft, active, vehicles] = await Promise.all([
          repository.findReleaseAggregate(input.releaseId),
          repository.findActiveRelease(),
          repository.listBookableVehicles(),
        ])
        if (!draft) throw new ConfigurationWorkflowError("RELEASE_NOT_FOUND", "Draft release not found.", "VALIDATION")
        if (draft.status === "ACTIVE")
          throw new ConfigurationWorkflowError("RELEASE_ALREADY_ACTIVE", "Release is already active.", "CONFLICT")
        if (!(["DRAFT", "VALIDATED"] as const).includes(draft.status as "DRAFT" | "VALIDATED")) {
          throw new ConfigurationWorkflowError(
            "RELEASE_INVALID",
            "Only a current draft can be activated.",
            "VALIDATION",
          )
        }
        if (draft.revision !== input.expectedRevision) {
          throw new ConfigurationWorkflowError("OPTIMISTIC_LOCK_FAILED", "Draft revision changed.", "CONFLICT")
        }
        if ((active && draft.supersedesReleaseId !== active.id) || (!active && draft.supersedesReleaseId)) {
          throw new ConfigurationWorkflowError(
            "RELEASE_STALE",
            "Draft was based on a different active release.",
            "CONFLICT",
          )
        }
        const result = validateReleaseAggregate(draft, active, vehicles)
        const blockers = result.issues.filter(({ severity }) => severity === "BLOCKER")
        const warnings = result.issues.filter(({ severity }) => severity === "WARNING")
        if (blockers.length)
          throw new ConfigurationWorkflowError("RELEASE_INVALID", "Release has blockers.", "VALIDATION")
        if (warnings.length && !input.warningsAcknowledged) {
          throw new ConfigurationWorkflowError(
            "RELEASE_INVALID",
            "Warnings require explicit acknowledgement.",
            "VALIDATION",
          )
        }

        const now = new Date()
        const versionIds = CONFIGURATION_DOMAIN_IDS.map((domain) => draft.versions[domain].id)
        await tx.configurationVersion.updateMany({
          where: {
            id: { in: versionIds },
            status: { in: ["DRAFT", "VALIDATED"] },
          },
          data: {
            status: "RELEASED",
            validationStatus: result.outcome === "WARNING" ? "WARNING" : "VALID",
            validatedById: input.actorId,
            validatedAt: now,
            activatedAt: now,
            updatedById: input.actorId,
          },
        })
        if (draft.fleetRateSet.status !== "RELEASED") {
          await tx.fleetRateSet.update({
            where: { id: draft.fleetRateSet.id },
            data: {
              status: "RELEASED",
              validationStatus: "VALID",
              validatedById: input.actorId,
              activatedById: input.actorId,
              validatedAt: now,
              activatedAt: now,
              updatedById: input.actorId,
            },
          })
        }
        if (active && active.id !== draft.id) {
          await tx.businessConfigurationRelease.update({
            where: { id: active.id },
            data: { status: "SUPERSEDED", archivedAt: now },
          })
        }
        const updated = await tx.businessConfigurationRelease.updateMany({
          where: {
            id: draft.id,
            revision: input.expectedRevision,
            status: { in: ["DRAFT", "VALIDATED"] },
          },
          data: {
            status: "ACTIVE",
            validationStatus: result.outcome === "WARNING" ? "WARNING" : "VALID",
            validationSnapshot: validationSnapshot(result) as unknown as Prisma.InputJsonValue,
            supersedesReleaseId: active?.id,
            validatedById: input.actorId,
            activatedById: input.actorId,
            validatedAt: now,
            activatedAt: now,
            updatedById: input.actorId,
            revision: { increment: 1 },
          },
        })
        if (updated.count !== 1) {
          throw new ConfigurationWorkflowError("OPTIMISTIC_LOCK_FAILED", "Draft revision changed.", "CONFLICT")
        }
        try {
          await tx.auditEvent.create({
            data: {
              actorUserId: input.actorId,
              category: "CONFIGURATION",
              action: "configuration.release_activated",
              targetType: "BusinessConfigurationRelease",
              targetId: draft.id,
              configurationReleaseId: draft.id,
              beforeSummary: {
                status: draft.status,
                activeReleaseNumber: active?.releaseNumber,
              },
              afterSummary: {
                status: "ACTIVE",
                releaseNumber: draft.releaseNumber,
                changeSummary: draft.changeSummary,
                futureBookingsOnly: true,
                warningCount: warnings.length,
              },
            },
          })
        } catch {
          throw new ConfigurationWorkflowError(
            "AUDIT_WRITE_FAILED",
            "Activation audit could not be written.",
            "OPERATIONAL",
          )
        }
        return {
          releaseId: draft.id,
          releaseNumber: draft.releaseNumber,
          status: "ACTIVE" as const,
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    )
  } catch (error) {
    if (error instanceof ConfigurationWorkflowError) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      throw new ConfigurationWorkflowError("ACTIVATION_CONFLICT", "Another activation won the race.", "CONFLICT")
    }
    throw new ConfigurationWorkflowError(
      "ACTIVATION_CONFLICT",
      "Activation could not be completed safely.",
      "OPERATIONAL",
    )
  }
}
