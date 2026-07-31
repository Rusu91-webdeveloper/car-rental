import { randomBytes } from "node:crypto"
import { Prisma, type PrismaClient } from "@prisma/client"
import { isCarAvailable } from "@/lib/availability"
import {
  normalizeAndValidateBookingFields,
} from "@/lib/booking-configuration/field-resolver"
import { evaluateDriverEligibility } from "@/lib/booking-configuration/driver-eligibility"
import { PrismaBookingConfigurationRepository } from "@/lib/booking-configuration/prisma-repository"
import { quoteConfiguredVehicleRental } from "@/lib/booking-configuration/quote-service"
import { PrismaPricingContextRepository } from "@/lib/pricing/prisma-repository"
import { BOOKING_PAYMENT_WINDOW_MS } from "@/lib/constants"
import { enqueueInitialBookingNotifications } from "@/lib/booking-notifications"
import {
  hasMinimumPickupLeadTime,
  isHandoverTimeAllowed,
  normalizeHandoverPolicy,
  normalizeOpeningHoursExceptions,
  normalizeWeeklyOpeningHours,
} from "@/lib/business-hours"
import { isRentalDurationTooShort } from "@/lib/booking-configuration/minimum-rental"
import { evaluateRentalHandoverCapacity } from "@/lib/handover-capacity"
import { calculateConfiguredDeposit, resolveBookingPaymentPolicy } from "@/lib/booking-payment-policy"
import type { BookingPricingQuote } from "@/lib/pricing/types"
import type {
  ApplicationMutationInput,
  ApplicationReadiness,
  BookingApplicationView,
  CreateBookingApplicationInput,
} from "../domain"
import {
  bookingApplicationExpiresAt,
  isApplicationFinalizationTimeValid,
  isCarLifecycleBookable,
} from "../domain"
import { applicationError, BookingApplicationError } from "../errors"
import { mapApplicationLocationToBooking } from "../mapping"
import { selectLatestDocumentAttempts } from "../document-view"
import type { BookingApplicationRepository } from "../repository"

type Db = PrismaClient | Prisma.TransactionClient
const ACTIVE = [
  "DRAFT",
  "AWAITING_DOCUMENT_UPLOAD",
  "AWAITING_DOCUMENT_REVIEW",
  "CUSTOMER_ACTION_REQUIRED",
  "READY_TO_FINALIZE",
] as const

const applicationInclude = {
  customerDriver: true,
  insuranceSelection: true,
  paymentSelection: true,
  pricingQuotes: { where: { isCurrent: true }, take: 1 },
  documentPolicyConfig: {
    include: {
      requirements: {
        include: { documentType: true, translations: true },
        orderBy: { documentTypeId: "asc" as const },
      },
    },
  },
  documentUploadSession: {
    include: {
      customerDocuments: {
        where: { deletionStatus: { not: "DELETED" as const } },
        include: { documentType: true },
        orderBy: [
          { documentTypeId: "asc" as const },
          { slotNumber: "asc" as const },
          { side: "asc" as const },
          { attemptNumber: "desc" as const },
        ],
      },
    },
  },
} satisfies Prisma.BookingApplicationInclude

type LoadedApplication = Prisma.BookingApplicationGetPayload<{
  include: typeof applicationInclude
}>

function dateInput(value: string | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null
}

function dateOutput(value: Date | null) {
  return value?.toISOString().slice(0, 10)
}

function mapView(row: LoadedApplication): BookingApplicationView {
  const quote = row.pricingQuotes[0]
  const trace = quote?.calculationTrace as
    | { payment?: { depositAmount?: number; guaranteeAmount?: number } }
    | null
  return {
    id: row.id,
    customerUserId: row.customerUserId,
    carId: row.carId,
    locale: row.locale,
    pickupAt: row.pickupAt,
    returnAt: row.returnAt,
    businessTimeZone: row.businessTimeZone,
    pickupLocation: row.pickupLocation,
    returnLocation: row.returnLocation,
    status: row.status,
    revision: row.revision,
    paymentMethod: row.paymentMethod,
    expiresAt: row.expiresAt,
    actionRequiredReason: row.actionRequiredReason ?? undefined,
    terminalReason: row.terminalReason ?? undefined,
    bookingId: row.bookingId ?? undefined,
    uploadSessionId: row.documentUploadSession?.id,
    customerDriver: row.customerDriver
      ? {
          firstName: row.customerDriver.firstName ?? undefined,
          lastName: row.customerDriver.lastName ?? undefined,
          email: row.customerDriver.email ?? undefined,
          phone: row.customerDriver.phone ?? undefined,
          dateOfBirth: dateOutput(row.customerDriver.dateOfBirth),
          country: row.customerDriver.country ?? undefined,
          address: row.customerDriver.address ?? undefined,
          city: row.customerDriver.city ?? undefined,
          postalCode: row.customerDriver.postalCode ?? undefined,
          nationality: row.customerDriver.nationality ?? undefined,
          licenceNumber: row.customerDriver.licenceNumber ?? undefined,
          licenceIssueDate: dateOutput(row.customerDriver.licenceIssueDate),
          licenceExpiryDate: dateOutput(row.customerDriver.licenceExpiryDate),
          licenceIssuingCountry:
            row.customerDriver.licenceIssuingCountry ?? undefined,
        }
      : undefined,
    insuranceSelected: row.insuranceSelection?.selected,
    quote: quote
      ? {
          id: quote.id,
          version: quote.quoteVersion,
          currency: quote.currency,
          grandTotal: quote.grandTotal,
          depositAmount:
            row.paymentSelection?.quotedDepositAmount ??
            trace?.payment?.depositAmount ??
            0,
          guaranteeAmount: trace?.payment?.guaranteeAmount ?? 0,
          expiresAt: quote.expiresAt,
          confirmedAt: quote.confirmedAt ?? undefined,
        }
      : undefined,
    documents:
      selectLatestDocumentAttempts(row.documentUploadSession?.customerDocuments ?? []).map((document) => ({
        id: document.id,
        documentTypeId: document.documentTypeId,
        documentTypeKey: document.documentType.key,
        side: document.side,
        slotNumber: document.slotNumber ?? 0,
        attemptNumber: document.attemptNumber ?? 0,
        uploadStatus: document.uploadStatus,
        scanStatus: document.scanStatus,
        manualReviewStatus: document.manualReviewStatus,
        reviewRevision: document.reviewRevision,
        reviewReasonCode: document.reviewReasonCode ?? undefined,
        replacesDocumentId: document.replacesDocumentId ?? undefined,
      })) ?? [],
    requirements: row.documentPolicyConfig.requirements.map((rule) => ({
      documentTypeId: rule.documentTypeId,
      documentTypeKey: rule.documentType.key,
      name: rule.documentType.name,
      mode: rule.mode,
      fileCount: rule.fileCount,
      sides: rule.sides,
      instructions:
        rule.translations.find((value) => value.locale === row.locale)
          ?.instructions ?? rule.translations[0]?.instructions,
    })),
    identityDocumentChoice: row.documentPolicyConfig.identityDocumentChoice,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function load(db: Db, id: string) {
  return db.bookingApplication.findUnique({
    where: { id },
    include: applicationInclude,
  })
}

function assertMutable(
  row: { customerUserId: string; expiresAt: Date; status: string },
  userId: string,
  now = new Date(),
) {
  if (row.customerUserId !== userId)
    applicationError("APPLICATION_ACCESS_DENIED", "Application belongs to another customer.")
  if (row.expiresAt <= now)
    applicationError("APPLICATION_EXPIRED", "This application has expired.")
  if (!ACTIVE.includes(row.status as (typeof ACTIVE)[number]))
    applicationError("APPLICATION_TERMINAL", "This application can no longer be changed.")
}

async function touch(
  db: Db,
  input: ApplicationMutationInput,
  extra: Prisma.BookingApplicationUpdateManyMutationInput = {},
) {
  const result = await db.bookingApplication.updateMany({
    where: {
      id: input.applicationId,
      customerUserId: input.customerUserId,
      revision: input.expectedRevision,
      status: { in: [...ACTIVE] },
      expiresAt: { gt: new Date() },
    },
    data: { ...extra, revision: { increment: 1 } },
  })
  if (result.count !== 1)
    applicationError(
      "APPLICATION_REVISION_CONFLICT",
      "This application changed in another tab. Reload and try again.",
    )
}

function configuredPaymentMethod(method: "TRANSFER" | "PAY_AT_PICKUP") {
  return method === "TRANSFER"
    ? (["BANK_TRANSFER"] as const)
    : (["CASH_ON_PICKUP"] as const)
}

async function authoritativeQuote(db: Db, row: LoadedApplication) {
  return quoteConfiguredVehicleRental({
    db,
    pricingRepository: new PrismaPricingContextRepository(db),
    locale: row.locale,
    insuranceSelected: row.insuranceSelection?.selected ?? false,
    request: {
      vehicleId: row.carId,
      pickupAt: row.pickupAt,
      returnAt: row.returnAt,
      paymentMethod: row.paymentMethod,
    },
  })
}

function quoteData(
  row: LoadedApplication,
  quote: BookingPricingQuote,
  version: number,
  previousId: string | undefined,
  confirm: boolean,
) {
  if (
    quote.compatibilityMode !== "ACTIVE_RELEASE" ||
    !quote.source.configurationReleaseId ||
    !quote.source.pricingConfigVersionId ||
    !quote.source.fleetRateSetId ||
    !quote.source.vehicleRentalRateId ||
    !quote.source.releaseNumber ||
    !quote.source.pricingVersionNumber ||
    !quote.source.fleetRateSetVersionNumber
  )
    applicationError(
      "APPLICATION_CONFIGURATION_UNAVAILABLE",
      "An active release-backed price is required.",
    )
  return {
    bookingApplicationId: row.id,
    quoteVersion: version,
    isCurrent: true,
    supersedesPricingQuoteId: previousId,
    configurationReleaseId: quote.source.configurationReleaseId,
    pricingConfigVersionId: quote.source.pricingConfigVersionId,
    fleetRateSetId: quote.source.fleetRateSetId,
    vehicleRentalRateId: quote.source.vehicleRentalRateId,
    snapshotSchemaVersion: 1,
    releaseNumber: quote.source.releaseNumber,
    pricingVersionNumber: quote.source.pricingVersionNumber,
    fleetRateSetVersionNumber: quote.source.fleetRateSetVersionNumber,
    pricingEngineVersion: quote.pricingEngineVersion,
    compatibilityMode: false,
    rateSourceType: quote.source.rateSourceType,
    rateSourceReference: quote.source.rateSourceReference,
    mixedDurationStrategy: quote.persistentStrategy,
    currency: quote.currency,
    chargeableDurationMinutes: quote.chargeableDuration.chargeableDurationMinutes,
    chargeableDays: quote.chargeableDuration.chargeableDays,
    billableDayMethod: quote.durationStrategy,
    rentalMonthDefinition: quote.monthDefinition,
    dailyUnits: quote.units.daily,
    weeklyUnits: quote.units.weekly,
    monthlyUnits: quote.units.monthly,
    sourceDailyRate: quote.sourceDailyRate,
    sourceWeeklyRate: quote.sourceWeeklyRate,
    sourceMonthlyRate: quote.sourceMonthlyRate,
    baseSubtotal: quote.baseSubtotal,
    insuranceSubtotal: quote.insuranceSubtotal,
    adjustmentTotal: quote.adjustmentTotal,
    taxTotal: quote.taxSubtotal,
    grandTotal: quote.grandTotal,
    calculatedAt: new Date(quote.calculatedAt),
    expiresAt: new Date(Date.now() + 30 * 60_000),
    calculationTrace: {
      warnings: quote.warnings,
      adjustments: quote.adjustments,
      payment: quote.payment,
      trace: quote.trace,
    } as unknown as Prisma.InputJsonValue,
    requiresCustomerConfirmation: true,
    confirmedAt: confirm ? new Date() : null,
    confirmedByUserId: confirm ? row.customerUserId : null,
  }
}

async function refreshPaymentDeposit(
  db: Db,
  row: LoadedApplication,
  quote: BookingPricingQuote,
) {
  if (!row.paymentSelection) return
  const selection = row.paymentSelection
  const amount = calculateConfiguredDeposit(quote.grandTotal, selection.depositType, selection.depositValue)
  await db.bookingApplicationPaymentSelection.update({
    where: { bookingApplicationId: row.id },
    data: {
      quotedDepositAmount: amount,
      revision: { increment: 1 },
      selectedAt: new Date(),
    },
  })
}

export class PrismaBookingApplicationRepository
  implements BookingApplicationRepository
{
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateBookingApplicationInput) {
    const sharedLocation = mapApplicationLocationToBooking(input)
    return this.db.$transaction(
      async (tx) => {
        const existing = await tx.bookingApplication.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: applicationInclude,
        })
        if (existing) {
          if (
            existing.customerUserId !== input.customerUserId ||
            existing.carId !== input.carId ||
            existing.pickupAt.getTime() !== input.pickupAt.getTime() ||
            existing.returnAt.getTime() !== input.returnAt.getTime() ||
            existing.pickupLocation !== sharedLocation
          )
            applicationError(
              "APPLICATION_REVISION_CONFLICT",
              "The application key was reused for different rental facts.",
            )
          return mapView(existing)
        }
        const release = await tx.businessConfigurationRelease.findFirst({
          where: { status: "ACTIVE" },
          include: {
            generalRentalConfig: true,
            pricingBillingConfig: true,
            paymentConfig: { include: { methods: true } },
          },
        })
        if (!release)
          applicationError(
            "APPLICATION_CONFIGURATION_UNAVAILABLE",
            "No active booking configuration is available.",
          )
        const weeklyOpeningHours = normalizeWeeklyOpeningHours(
          release.generalRentalConfig.weeklyOpeningHours,
        )
        const openingHoursExceptions = normalizeOpeningHoursExceptions(
          release.generalRentalConfig.openingHoursExceptions,
        )
        const handoverPolicy = normalizeHandoverPolicy(release.generalRentalConfig.handoverPolicy)
        if (!isHandoverTimeAllowed(input.pickupAt, release.generalRentalConfig.businessTimeZone, weeklyOpeningHours, openingHoursExceptions, handoverPolicy, "PICKUP"))
          applicationError(
            "APPLICATION_OUTSIDE_OPENING_HOURS",
            "Pick-up must be during the rental company's opening hours.",
          )
        if (!isHandoverTimeAllowed(input.returnAt, release.generalRentalConfig.businessTimeZone, weeklyOpeningHours, openingHoursExceptions, handoverPolicy, "RETURN"))
          applicationError(
            "APPLICATION_OUTSIDE_OPENING_HOURS",
            "Return must be during the rental company's opening hours.",
          )
        if (!hasMinimumPickupLeadTime(input.pickupAt, handoverPolicy))
          applicationError(
            "APPLICATION_INSUFFICIENT_LEAD_TIME",
            "Pick-up does not meet the rental company's minimum advance-booking time.",
          )
        if (isRentalDurationTooShort(input.pickupAt, input.returnAt, release.pricingBillingConfig.minimumRentalMinutes))
          applicationError(
            "APPLICATION_NOT_READY",
            "The selected rental is shorter than the configured minimum rental period.",
          )
        await tx.$queryRaw`SELECT id FROM "Car" WHERE id = ${input.carId} FOR UPDATE`
        const car = await tx.car.findUnique({
          where: { id: input.carId },
          select: { isDeleted: true, status: true },
        })
        if (!car || !isCarLifecycleBookable(car))
          applicationError(
            "APPLICATION_VEHICLE_UNAVAILABLE",
            "The vehicle is not currently available for booking.",
          )
        if (!(await isCarAvailable(input.carId, input.pickupAt, input.returnAt, { db: tx })))
          applicationError(
            "APPLICATION_VEHICLE_UNAVAILABLE",
            "The vehicle is no longer available for the selected period.",
          )
        // Capacity is shared across the fleet, so serialize the final check for
        // concurrent applications involving different cars.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(2026072821)`
        const capacity = await evaluateRentalHandoverCapacity({
          db: tx,
          pickupAt: input.pickupAt,
          returnAt: input.returnAt,
          policy: handoverPolicy,
        })
        if (!capacity.pickupAvailable)
          applicationError(
            "APPLICATION_HANDOVER_CAPACITY_REACHED",
            "The selected pick-up slot has reached its handover capacity.",
          )
        if (!capacity.returnAvailable)
          applicationError(
            "APPLICATION_HANDOVER_CAPACITY_REACHED",
            "The selected return slot has reached its handover capacity.",
          )
        const requiredMode = input.paymentMethod === "TRANSFER" ? "BANK_TRANSFER" : "CASH_ON_PICKUP"
        if (!release.paymentConfig.methods.some((method) => method.method === requiredMode && method.enabled))
          applicationError("APPLICATION_PAYMENT_INVALID", "Selected payment method is unavailable.")
        const expiresAt = bookingApplicationExpiresAt({
          now: new Date(),
          pickupAt: input.pickupAt,
          requestedLifetimeMs: input.expiresInMs,
        })
        const created = await tx.bookingApplication.create({
          data: {
            customerUserId: input.customerUserId,
            carId: input.carId,
            locale: input.locale,
            pickupAt: input.pickupAt,
            returnAt: input.returnAt,
            pickupLocation: sharedLocation,
            returnLocation: sharedLocation,
            businessTimeZone: release.generalRentalConfig.businessTimeZone,
            idempotencyKey: input.idempotencyKey,
            configurationReleaseId: release.id,
            generalRentalConfigVersionId: release.generalRentalConfigVersionId,
            pricingBillingConfigVersionId: release.pricingBillingConfigVersionId,
            fleetRateSetId: release.fleetRateSetId,
            insuranceConfigVersionId: release.insuranceConfigVersionId,
            customerDriverConfigVersionId: release.customerDriverConfigVersionId,
            bookingWorkflowConfigVersionId:
              release.bookingWorkflowConfigVersionId,
            documentPolicyConfigVersionId: release.documentPolicyConfigVersionId,
            paymentConfigVersionId: release.paymentConfigVersionId,
            confirmationConfigVersionId: release.confirmationConfigVersionId,
            legalAcceptanceConfigVersionId:
              release.legalAcceptanceConfigVersionId,
            paymentMethod: input.paymentMethod,
            expiresAt,
          },
        })
        await tx.documentUploadSession.create({
          data: {
            customerUserId: input.customerUserId,
            carId: input.carId,
            pickupAt: input.pickupAt,
            returnAt: input.returnAt,
            locale: input.locale,
            configurationReleaseId: release.id,
            documentPolicyConfigVersionId: release.documentPolicyConfigVersionId,
            bookingApplicationId: created.id,
            expiresAt,
          },
        })
        await tx.bookingApplication.update({
          where: { id: created.id },
          data: { status: "AWAITING_DOCUMENT_UPLOAD", revision: 2 },
        })
        await tx.auditEvent.create({
          data: {
            category: "BOOKING",
            action: "booking_application.created",
            actorUserId: input.customerUserId,
            targetType: "BookingApplication",
            targetId: created.id,
            configurationReleaseId: release.id,
          },
        })
        const result = await load(tx, created.id)
        if (!result) applicationError("APPLICATION_NOT_FOUND", "Application was not persisted.")
        return mapView(result)
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }

  async load(applicationId: string) {
    const row = await load(this.db, applicationId)
    return row ? mapView(row) : undefined
  }

  async saveCustomerDriver(
    input: ApplicationMutationInput & {
      customer: import("@/lib/booking-configuration/types").BookingCustomerDriverInput
    },
  ) {
    return this.db.$transaction(async (tx) => {
      const row = await load(tx, input.applicationId)
      if (!row) applicationError("APPLICATION_NOT_FOUND", "Application not found.")
      assertMutable(row, input.customerUserId)
      if (row.revision !== input.expectedRevision)
        applicationError("APPLICATION_REVISION_CONFLICT", "Application revision is stale.")
      const active = await new PrismaBookingConfigurationRepository(
        tx,
      ).findActiveConfiguration(row.carId, row.locale)
      if (!active || active.releaseId !== row.configurationReleaseId)
        applicationError(
          "APPLICATION_CONFIGURATION_UNAVAILABLE",
          "The application configuration is no longer active.",
        )
      const fields = normalizeAndValidateBookingFields(
        (await authoritativeQuote(tx, row)).configuration.fields,
        input.customer,
      )
      if (fields.issues.length)
        applicationError(
          "APPLICATION_CUSTOMER_INVALID",
          fields.issues[0]?.message ?? "Customer details are invalid.",
        )
      const eligibility = evaluateDriverEligibility({
        rules: active.customerDriver,
        customer: fields.normalized,
        pickupAt: row.pickupAt,
        returnAt: row.returnAt,
        businessTimeZone: row.businessTimeZone,
      })
      if (!eligibility.eligible)
        applicationError(
          "APPLICATION_CUSTOMER_INVALID",
          eligibility.issues[0]?.message ?? "Driver is not eligible.",
        )
      const existingRevision = row.customerDriver?.revision ?? 0
      await tx.bookingApplicationCustomerDriver.upsert({
        where: { bookingApplicationId: row.id },
        create: {
          bookingApplicationId: row.id,
          customerDriverConfigVersionId: row.customerDriverConfigVersionId,
          ...fields.normalized,
          dateOfBirth: dateInput(fields.normalized.dateOfBirth),
          licenceIssueDate: dateInput(fields.normalized.licenceIssueDate),
          licenceExpiryDate: dateInput(fields.normalized.licenceExpiryDate),
          licenceHeldSinceDate: dateInput(fields.normalized.licenceIssueDate),
          validationStatus: "VALID",
          validatorVersion: "booking-application-v1",
          validatedAt: new Date(eligibility.evaluatedAt),
        },
        update: {
          ...fields.normalized,
          dateOfBirth: dateInput(fields.normalized.dateOfBirth),
          licenceIssueDate: dateInput(fields.normalized.licenceIssueDate),
          licenceExpiryDate: dateInput(fields.normalized.licenceExpiryDate),
          licenceHeldSinceDate: dateInput(fields.normalized.licenceIssueDate),
          validationStatus: "VALID",
          validatorVersion: "booking-application-v1",
          validatedAt: new Date(eligibility.evaluatedAt),
          capturedAt: new Date(),
          revision: existingRevision + 1,
        },
      })
      await touch(tx, input)
      return mapView((await load(tx, row.id))!)
    })
  }

  async saveInsurance(
    input: ApplicationMutationInput & { selected: boolean },
  ) {
    return this.db.$transaction(async (tx) => {
      const row = await load(tx, input.applicationId)
      if (!row) applicationError("APPLICATION_NOT_FOUND", "Application not found.")
      assertMutable(row, input.customerUserId)
      if (row.revision !== input.expectedRevision)
        applicationError("APPLICATION_REVISION_CONFLICT", "Application revision is stale.")
      const configured = await quoteConfiguredVehicleRental({
        db: tx,
        pricingRepository: new PrismaPricingContextRepository(tx),
        locale: row.locale,
        insuranceSelected: input.selected,
        request: {
          vehicleId: row.carId,
          pickupAt: row.pickupAt,
          returnAt: row.returnAt,
          paymentMethod: row.paymentMethod,
        },
      })
      const insurance = configured.insurance
      if (!insurance)
        applicationError("APPLICATION_INSURANCE_INVALID", "Insurance configuration is unavailable.")
      const revision = row.insuranceSelection?.revision ?? 0
      await tx.bookingApplicationInsuranceSelection.upsert({
        where: { bookingApplicationId: row.id },
        create: {
          bookingApplicationId: row.id,
          insuranceConfigVersionId: row.insuranceConfigVersionId,
          availabilityVehicleId: insurance.availabilityVehicleId,
          selected: insurance.selected,
          requirementMode: insurance.requirementMode,
          customerFacingName: insurance.customerFacingName,
          description: insurance.description,
          unitPrice: insurance.unitPrice,
          billableDays: insurance.billableDays,
          quotedSubtotal: insurance.subtotal,
          currency: insurance.currency,
          taxTreatment: insurance.taxTreatment,
          availabilityScope: insurance.availabilityScope,
          customerSelectionShown: insurance.showCustomerSelection,
          preselected: insurance.preselectedByDefault,
          showInConfirmation: insurance.showInConfirmation,
          selectedAt: new Date(),
        },
        update: {
          selected: insurance.selected,
          availabilityVehicleId: insurance.availabilityVehicleId,
          unitPrice: insurance.unitPrice,
          billableDays: insurance.billableDays,
          quotedSubtotal: insurance.subtotal,
          selectedAt: new Date(),
          revision: revision + 1,
        },
      })
      await touch(tx, input)
      return mapView((await load(tx, row.id))!)
    })
  }

  async savePayment(
    input: ApplicationMutationInput & { paymentMethod: "TRANSFER" | "PAY_AT_PICKUP" },
  ) {
    return this.db.$transaction(async (tx) => {
      const row = await load(tx, input.applicationId)
      if (!row) applicationError("APPLICATION_NOT_FOUND", "Application not found.")
      assertMutable(row, input.customerUserId)
      if (row.revision !== input.expectedRevision)
        applicationError("APPLICATION_REVISION_CONFLICT", "Application revision is stale.")
      if (row.paymentMethod !== input.paymentMethod)
        applicationError(
          "APPLICATION_PAYMENT_INVALID",
          "Changing the payment method requires restarting the application.",
        )
      const config = await tx.paymentConfigVersion.findUnique({
        where: { configurationVersionId: row.paymentConfigVersionId },
        include: { methods: true, instructions: true },
      })
      const supportedMethods = configuredPaymentMethod(input.paymentMethod)
      const enabledMethods = config?.methods.filter(
        (value) => value.enabled && supportedMethods.includes(value.method as never),
      )
      const method =
        enabledMethods?.find((value) => value.method === config?.defaultMethod) ??
        enabledMethods?.find((value) => value.method === supportedMethods[0]) ??
        enabledMethods?.[0]
      if (!config || !method)
        applicationError("APPLICATION_PAYMENT_INVALID", "Selected payment method is unavailable.")
      const total = row.pricingQuotes[0]?.grandTotal ?? 0
      const deposit = calculateConfiguredDeposit(total, config.depositType, config.depositValue)
      const methodInstructions = config.instructions.filter(
        (value) => value.method === method.method,
      )
      const instruction =
        methodInstructions.find((value) => value.locale === row.locale) ??
        methodInstructions.find((value) => value.locale === "en") ??
        methodInstructions[0]
      const revision = row.paymentSelection?.revision ?? 0
      await tx.bookingApplicationPaymentSelection.upsert({
        where: { bookingApplicationId: row.id },
        create: {
          bookingApplicationId: row.id,
          paymentConfigVersionId: row.paymentConfigVersionId,
          paymentInstructionTranslationId: instruction?.id,
          bookingPaymentMethod: input.paymentMethod,
          configuredPaymentMode: method.method,
          depositType: config.depositType,
          depositValue: config.depositValue,
          quotedDepositAmount: deposit,
          quotedDepositRateBps:
            config.depositType === "PERCENTAGE_BPS" ? config.depositValue : null,
          remainingBalanceRule: config.remainingBalanceRule,
          instructionLocale: instruction?.locale,
          instructionText: instruction?.instructions,
          currency: row.pricingQuotes[0]?.currency ?? "EUR",
          selectedAt: new Date(),
        },
        update: {
          paymentInstructionTranslationId: instruction?.id,
          configuredPaymentMode: method.method,
          depositType: config.depositType,
          depositValue: config.depositValue,
          quotedDepositAmount: deposit,
          quotedDepositRateBps:
            config.depositType === "PERCENTAGE_BPS" ? config.depositValue : null,
          remainingBalanceRule: config.remainingBalanceRule,
          instructionLocale: instruction?.locale,
          instructionText: instruction?.instructions,
          currency: row.pricingQuotes[0]?.currency ?? "EUR",
          selectedAt: new Date(),
          revision: revision + 1,
        },
      })
      await touch(tx, input)
      return mapView((await load(tx, row.id))!)
    })
  }

  async refreshQuote(
    input: ApplicationMutationInput & { confirm: boolean },
  ) {
    return this.db.$transaction(async (tx) => {
      const row = await load(tx, input.applicationId)
      if (!row) applicationError("APPLICATION_NOT_FOUND", "Application not found.")
      assertMutable(row, input.customerUserId)
      if (row.revision !== input.expectedRevision)
        applicationError("APPLICATION_REVISION_CONFLICT", "Application revision is stale.")
      const configured = await authoritativeQuote(tx, row)
      const current = row.pricingQuotes[0]
      const same =
        current &&
        current.grandTotal === configured.quote.grandTotal &&
        current.configurationReleaseId === configured.quote.source.configurationReleaseId &&
        current.expiresAt > new Date()
      if (same) {
        if (input.confirm && !current.confirmedAt)
          await tx.bookingApplicationPricingQuote.update({
            where: { id: current.id },
            data: { confirmedAt: new Date(), confirmedByUserId: row.customerUserId },
          })
      } else {
        if (current)
          await tx.bookingApplicationPricingQuote.update({
            where: { id: current.id },
            data: { isCurrent: false },
          })
        await tx.bookingApplicationPricingQuote.create({
          data: quoteData(
            row,
            configured.quote,
            (current?.quoteVersion ?? 0) + 1,
            current?.id,
            input.confirm,
          ),
        })
      }
      await refreshPaymentDeposit(tx, row, configured.quote)
      await touch(tx, input)
      return mapView((await load(tx, row.id))!)
    })
  }

  async recordLegal(
    input: ApplicationMutationInput & {
      rentalTerms: boolean
      privacyNotice: boolean
    },
  ) {
    return this.db.$transaction(async (tx) => {
      const row = await load(tx, input.applicationId)
      if (!row) applicationError("APPLICATION_NOT_FOUND", "Application not found.")
      assertMutable(row, input.customerUserId)
      if (row.revision !== input.expectedRevision)
        applicationError("APPLICATION_REVISION_CONFLICT", "Application revision is stale.")
      const configured = await authoritativeQuote(tx, row)
      const legal = configured.configuration.legal
      if (legal) {
        for (const document of legal.documents) {
          const accepted =
            document.type === "RENTAL_TERMS"
              ? input.rentalTerms
              : input.privacyNotice
          if (document.requirement === "REQUIRED" && !accepted)
            applicationError(
              "APPLICATION_LEGAL_ACCEPTANCE_REQUIRED",
              `You must acknowledge ${document.title}.`,
            )
          if (!accepted) continue
          await tx.bookingApplicationLegalAcceptance.upsert({
            where: {
              bookingApplicationId_documentType_acceptanceRound: {
                bookingApplicationId: row.id,
                documentType: document.type,
                acceptanceRound: row.legalAcceptanceRound,
              },
            },
            create: {
              bookingApplicationId: row.id,
              legalDocumentVersionId: document.legalDocumentVersionId,
              legalDocumentTranslationId: document.legalDocumentTranslationId,
              customerUserId: row.customerUserId,
              configurationReleaseId: row.configurationReleaseId,
              legalAcceptanceConfigVersionId:
                row.legalAcceptanceConfigVersionId,
              documentType: document.type,
              documentVersionNumber: document.versionNumber,
              locale: document.locale,
              contentHash: document.contentHash,
              accepted: true,
              source: "CUSTOMER_CHECKBOX",
              contentSnapshot: legal.retainContentSnapshot
                ? document.canonicalContent
                : null,
              acceptanceRound: row.legalAcceptanceRound,
            },
            update: {},
          })
        }
      }
      await touch(tx, input)
      return mapView((await load(tx, row.id))!)
    })
  }

  async submitForReview(input: ApplicationMutationInput) {
    return this.db.$transaction(async (tx) => {
      const row = await load(tx, input.applicationId)
      if (!row) applicationError("APPLICATION_NOT_FOUND", "Application not found.")
      assertMutable(row, input.customerUserId)
      if (row.revision !== input.expectedRevision)
        applicationError("APPLICATION_REVISION_CONFLICT", "Application revision is stale.")
      const hasPending = row.documentUploadSession?.customerDocuments.some(
        (document) =>
          document.deletionStatus === "RETAINED" &&
          (document.manualReviewStatus === "PENDING_REVIEW" ||
            (document.isCurrent && document.manualReviewStatus === "APPROVED")),
      )
      if (!hasPending)
        applicationError(
          "APPLICATION_DOCUMENTS_INCOMPLETE",
          "Upload and verify the required files before submitting.",
        )
      await touch(tx, input, { status: "AWAITING_DOCUMENT_REVIEW" })
      return mapView((await load(tx, row.id))!)
    })
  }

  async reconcileConfirmedQuoteAfterReview(applicationId: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "BookingApplication" WHERE id = ${applicationId} FOR UPDATE`
      const row = await load(tx, applicationId)
      if (!row)
        applicationError("APPLICATION_NOT_FOUND", "Application not found.")
      if (row.status !== "AWAITING_DOCUMENT_REVIEW")
        return "NOT_APPLICABLE" as const

      const current = row.pricingQuotes[0]
      const now = new Date()
      if (row.expiresAt <= now)
        return "NOT_APPLICABLE" as const
      if (current?.expiresAt && current.expiresAt > now)
        return "VALID" as const
      if (
        !current?.confirmedAt ||
        current.confirmedByUserId !== row.customerUserId
      )
        return "NOT_APPLICABLE" as const

      const activeRelease = await tx.businessConfigurationRelease.findFirst({
        where: { status: "ACTIVE" },
        select: { id: true },
      })
      if (activeRelease?.id !== row.configurationReleaseId) {
        await tx.bookingApplication.update({
          where: { id: row.id },
          data: {
            status: "CUSTOMER_ACTION_REQUIRED",
            actionRequiredReason: "CONFIGURATION_CHANGED",
            actionRequiredAt: now,
            revision: { increment: 1 },
          },
        })
        await tx.auditEvent.create({
          data: {
            category: "BOOKING",
            action: "booking_application.review_quote_configuration_changed",
            targetType: "BookingApplication",
            targetId: row.id,
            configurationReleaseId: row.configurationReleaseId,
          },
        })
        return "CUSTOMER_ACTION_REQUIRED" as const
      }

      const configured = await authoritativeQuote(tx, row)
      const priceUnchanged =
        current.grandTotal === configured.quote.grandTotal &&
        current.configurationReleaseId ===
          configured.quote.source.configurationReleaseId

      await tx.bookingApplicationPricingQuote.update({
        where: { id: current.id },
        data: { isCurrent: false },
      })
      const renewed = await tx.bookingApplicationPricingQuote.create({
        data: quoteData(
          row,
          configured.quote,
          current.quoteVersion + 1,
          current.id,
          priceUnchanged,
        ),
      })
      await refreshPaymentDeposit(tx, row, configured.quote)

      if (!priceUnchanged) {
        await tx.bookingApplication.update({
          where: { id: row.id },
          data: {
            status: "CUSTOMER_ACTION_REQUIRED",
            actionRequiredReason: "PRICE_CHANGED",
            actionRequiredAt: now,
            revision: { increment: 1 },
          },
        })
        await tx.auditEvent.create({
          data: {
            category: "BOOKING",
            action: "booking_application.review_quote_price_changed",
            targetType: "BookingApplication",
            targetId: row.id,
            configurationReleaseId: row.configurationReleaseId,
            metadata: {
              previousQuoteVersion: current.quoteVersion,
              renewedQuoteVersion: renewed.quoteVersion,
            },
          },
        })
        return "CUSTOMER_ACTION_REQUIRED" as const
      }

      await tx.auditEvent.create({
        data: {
          category: "BOOKING",
          action: "booking_application.confirmed_quote_renewed_after_review",
          targetType: "BookingApplication",
          targetId: row.id,
          configurationReleaseId: row.configurationReleaseId,
          metadata: {
            previousQuoteVersion: current.quoteVersion,
            renewedQuoteVersion: renewed.quoteVersion,
            grandTotalUnchanged: true,
          },
        },
      })
      return "RENEWED" as const
    })
  }

  async evaluateReadiness(applicationId: string): Promise<ApplicationReadiness> {
    const row = await load(this.db, applicationId)
    if (!row)
      return {
        ready: false,
        blockers: [{ code: "APPLICATION_NOT_FOUND", message: "Application not found." }],
      }
    const blockers: ApplicationReadiness["blockers"] = []
    if (row.expiresAt <= new Date())
      blockers.push({ code: "APPLICATION_EXPIRED", message: "The application has expired." })
    if (!row.customerDriver || !["VALID", "WARNING"].includes(row.customerDriver.validationStatus))
      blockers.push({ code: "CUSTOMER_DATA_INVALID", message: "Complete valid customer and driver details." })
    if (!row.insuranceSelection)
      blockers.push({ code: "INSURANCE_SELECTION_MISSING", message: "Choose an insurance option." })
    if (!row.paymentSelection)
      blockers.push({ code: "PAYMENT_SELECTION_MISSING", message: "Choose a payment method." })
    const quote = row.pricingQuotes[0]
    if (!quote || quote.expiresAt <= new Date())
      blockers.push({ code: "QUOTE_EXPIRED", message: "Refresh the rental price." })
    else if (!quote.confirmedAt || quote.confirmedByUserId !== row.customerUserId)
      blockers.push({ code: "QUOTE_CONFIRMATION_REQUIRED", message: "Confirm the current rental price." })
    const legal = await this.db.legalAcceptanceConfigVersion.findUnique({
      where: { configurationVersionId: row.legalAcceptanceConfigVersionId },
    })
    const evidence = await this.db.bookingApplicationLegalAcceptance.findMany({
      where: { bookingApplicationId: row.id, acceptanceRound: row.legalAcceptanceRound },
    })
    if (legal?.termsAcceptance === "REQUIRED" && !evidence.some((value) => value.documentType === "RENTAL_TERMS"))
      blockers.push({ code: "LEGAL_TERMS_REQUIRED", message: "Accept the current rental terms." })
    if (legal?.privacyAcknowledgment === "REQUIRED" && !evidence.some((value) => value.documentType === "PRIVACY_NOTICE"))
      blockers.push({ code: "LEGAL_PRIVACY_REQUIRED", message: "Acknowledge the current privacy notice." })
    const approved = (typeId: string, slot: number, side: string) =>
      row.documentUploadSession?.customerDocuments.some(
        (document) =>
          document.documentTypeId === typeId &&
          document.slotNumber === slot &&
          document.side === side &&
          document.isCurrent &&
          document.uploadStatus === "TECHNICALLY_VALID" &&
          document.scanStatus === "NOT_AVAILABLE" &&
          document.scanAttemptCount === 0 &&
          document.manualReviewStatus === "APPROVED" &&
          document.deletionStatus === "RETAINED" &&
          document.retentionUntil > new Date(),
      )
    const identityIds = row.documentPolicyConfig.requirements
      .filter((rule) => ["IDENTITY_CARD", "PASSPORT"].includes(rule.documentType.key))
      .map((rule) => rule.documentTypeId)
    for (const rule of row.documentPolicyConfig.requirements.filter((value) => value.mode === "REQUIRED")) {
      if (
        row.documentPolicyConfig.identityDocumentChoice === "EITHER_IDENTITY_CARD_OR_PASSPORT" &&
        identityIds.includes(rule.documentTypeId)
      )
        continue
      for (let slot = 1; slot <= rule.fileCount; slot += 1)
        for (const side of rule.sides === "FRONT_AND_BACK" ? ["FRONT", "BACK"] : ["SINGLE"])
          if (!approved(rule.documentTypeId, slot, side))
            blockers.push({ code: "DOCUMENT_APPROVAL_REQUIRED", message: `${rule.documentType.name} is awaiting approval.` })
    }
    if (
      row.documentPolicyConfig.identityDocumentChoice === "EITHER_IDENTITY_CARD_OR_PASSPORT" &&
      !row.documentUploadSession?.customerDocuments.some(
        (document) =>
          identityIds.includes(document.documentTypeId) &&
          document.isCurrent &&
          document.uploadStatus === "TECHNICALLY_VALID" &&
          document.scanStatus === "NOT_AVAILABLE" &&
          document.scanAttemptCount === 0 &&
          document.manualReviewStatus === "APPROVED",
      )
    )
      blockers.push({ code: "IDENTITY_DOCUMENT_APPROVAL_REQUIRED", message: "An ID card or passport must be approved." })
    const ready = blockers.length === 0
    if (ready && ["AWAITING_DOCUMENT_REVIEW", "CUSTOMER_ACTION_REQUIRED"].includes(row.status))
      await this.db.bookingApplication.update({
        where: { id: row.id },
        data: {
          status: "READY_TO_FINALIZE",
          actionRequiredReason: null,
          actionRequiredAt: null,
          revision: { increment: 1 },
        },
      })
    return { ready, blockers }
  }

  async markCustomerActionRequired(
    input: ApplicationMutationInput & { reason: string },
  ) {
    const reason = input.reason as Prisma.BookingApplicationUpdateManyMutationInput["actionRequiredReason"]
    await touch(this.db, input, {
      status: input.reason === "DOCUMENT_REPLACEMENT_REQUIRED" ? "AWAITING_DOCUMENT_UPLOAD" : "CUSTOMER_ACTION_REQUIRED",
      actionRequiredReason: reason,
      actionRequiredAt: new Date(),
    })
    return mapView((await load(this.db, input.applicationId))!)
  }

  async expire(now: Date, limit: number) {
    const rows = await this.db.bookingApplication.findMany({
      where: { status: { in: [...ACTIVE] }, expiresAt: { lte: now } },
      select: { id: true, revision: true },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: limit,
    })
    let completed = 0
    for (const row of rows) {
      const result = await this.db.bookingApplication.updateMany({
        where: { id: row.id, revision: row.revision },
        data: {
          status: "EXPIRED",
          terminalReason: "Application expired before finalization.",
          revision: { increment: 1 },
        },
      })
      completed += result.count
    }
    return completed
  }

  async cancel(input: ApplicationMutationInput & { reason: string }) {
    await touch(this.db, input, {
      status: "CANCELLED",
      terminalReason: input.reason.trim().slice(0, 500) || "Cancelled by customer.",
    })
    return mapView((await load(this.db, input.applicationId))!)
  }

  async finalize(input: ApplicationMutationInput) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "BookingApplication" WHERE id = ${input.applicationId} FOR UPDATE`
          let row = await load(tx, input.applicationId)
          if (!row) applicationError("APPLICATION_NOT_FOUND", "Application not found.")
          if (row.customerUserId !== input.customerUserId)
            applicationError("APPLICATION_ACCESS_DENIED", "Application belongs to another customer.")
          if (row.status === "FINALIZED") return mapView(row)
          if (!isApplicationFinalizationTimeValid(row))
            applicationError(
              "APPLICATION_EXPIRED",
              "This application expired before the rental could be finalized.",
            )
          if (row.revision !== input.expectedRevision || row.status !== "READY_TO_FINALIZE")
            applicationError("APPLICATION_REVISION_CONFLICT", "Application is not at the expected ready revision.")
          await tx.$queryRaw`SELECT id FROM "Car" WHERE id = ${row.carId} FOR UPDATE`
          const car = await tx.car.findUnique({
            where: { id: row.carId },
            select: { isDeleted: true, status: true },
          })
          if (!car || !isCarLifecycleBookable(car))
            applicationError(
              "APPLICATION_VEHICLE_UNAVAILABLE",
              "The vehicle is not currently available for booking.",
            )
          if (!(await isCarAvailable(row.carId, row.pickupAt, row.returnAt, {
            excludeBookingApplicationId: row.id,
            db: tx,
          })))
            applicationError("APPLICATION_VEHICLE_UNAVAILABLE", "The vehicle is no longer available.")
          const activeRelease = await tx.businessConfigurationRelease.findFirst({
            where: { status: "ACTIVE" },
            select: {
              id: true,
              generalRentalConfig: {
                select: {
                  businessTimeZone: true,
                  weeklyOpeningHours: true,
                  openingHoursExceptions: true,
                  handoverPolicy: true,
                },
              },
            },
          })
          if (activeRelease?.id !== row.configurationReleaseId) {
            await tx.bookingApplication.update({
              where: { id: row.id },
              data: {
                status: "CUSTOMER_ACTION_REQUIRED",
                actionRequiredReason: "CONFIGURATION_CHANGED",
                actionRequiredAt: new Date(),
                revision: { increment: 1 },
              },
            })
            return mapView((await load(tx, row.id))!)
          }
          const weeklyOpeningHours = normalizeWeeklyOpeningHours(
            activeRelease.generalRentalConfig.weeklyOpeningHours,
          )
          const openingHoursExceptions = normalizeOpeningHoursExceptions(
            activeRelease.generalRentalConfig.openingHoursExceptions,
          )
          const handoverPolicy = normalizeHandoverPolicy(
            activeRelease.generalRentalConfig.handoverPolicy,
          )
          if (
            !isHandoverTimeAllowed(
              row.pickupAt,
              activeRelease.generalRentalConfig.businessTimeZone,
              weeklyOpeningHours,
              openingHoursExceptions,
              handoverPolicy,
              "PICKUP",
            ) ||
            !isHandoverTimeAllowed(
              row.returnAt,
              activeRelease.generalRentalConfig.businessTimeZone,
              weeklyOpeningHours,
              openingHoursExceptions,
              handoverPolicy,
              "RETURN",
            ) ||
            !hasMinimumPickupLeadTime(row.pickupAt, handoverPolicy)
          )
            applicationError(
              "APPLICATION_EXPIRED",
              "The rental timing is no longer valid. Start a new booking application.",
            )
          const calculated = await authoritativeQuote(tx, row)
          const accepted = row.pricingQuotes[0]
          if (!accepted || accepted.grandTotal !== calculated.quote.grandTotal) {
            await tx.bookingApplication.update({
              where: { id: row.id },
              data: {
                status: "CUSTOMER_ACTION_REQUIRED",
                actionRequiredReason: "PRICE_CHANGED",
                actionRequiredAt: new Date(),
                revision: { increment: 1 },
              },
            })
            if (accepted)
              await tx.bookingApplicationPricingQuote.update({ where: { id: accepted.id }, data: { isCurrent: false } })
            row = (await load(tx, row.id))!
            await tx.bookingApplicationPricingQuote.create({
              data: quoteData(row, calculated.quote, (accepted?.quoteVersion ?? 0) + 1, accepted?.id, false),
            })
            return mapView((await load(tx, row.id))!)
          }
          await tx.bookingApplication.update({
            where: { id: row.id },
            data: { status: "FINALIZING", revision: { increment: 1 } },
          })
          row = (await load(tx, row.id))!
          const customer = row.customerDriver
          const insurance = row.insuranceSelection
          const payment = row.paymentSelection
          if (!customer?.firstName || !customer.lastName || !customer.email || !insurance || !payment)
            applicationError("APPLICATION_NOT_READY", "Application evidence is incomplete.")
          const policy = resolveBookingPaymentPolicy({
            total: calculated.quote.grandTotal,
            paymentMethod: row.paymentMethod,
            depositType: payment.depositType,
            depositValue: payment.depositValue,
          })
          const { depositAmount, advancePaymentAmount, requiresAdvance, remainingBalanceRule } = policy
          const company = await tx.companySettings.findUnique({ where: { id: "company-settings" } })
          if (requiresAdvance && (!company?.accountName.trim() || !company.iban?.trim()))
            applicationError(
              "APPLICATION_PAYMENT_INVALID",
              "The owner must configure an account holder and IBAN before advance payments can be accepted.",
            )
          if (
            !company?.companyName.trim() ||
            !company.companyEmail.trim() ||
            !company.companyPhone?.trim() ||
            !company.companyAddress?.trim() ||
            !company.companyZipCode?.trim() ||
            !company.companyCity?.trim() ||
            !company.companyCountry?.trim()
          ) applicationError(
            "APPLICATION_PAYMENT_INVALID",
            "The owner must complete the company contact and pickup address before bookings can be confirmed.",
          )
          const booking = await tx.booking.create({
            data: {
              userId: row.customerUserId,
              carId: row.carId,
              locale: row.locale,
              pickupDate: row.pickupAt,
              dropoffDate: row.returnAt,
              businessTimeZone: row.businessTimeZone,
              location: mapApplicationLocationToBooking(row),
              pricePerDay: calculated.quote.sourceDailyRate,
              totalDays: calculated.quote.chargeableDuration.chargeableDays,
              totalPrice: calculated.quote.grandTotal,
              depositAmount,
              advancePaymentAmount,
              guaranteeAmount: calculated.quote.payment.guaranteeAmount,
              transferCode: randomBytes(4).toString("hex").toUpperCase(),
              bookingNumber: `BK${Date.now().toString().slice(-8)}${randomBytes(2).toString("hex").toUpperCase()}`,
              status: requiresAdvance ? "PENDING" : "CONFIRMED",
              paymentStatus: "PENDING",
              paymentMethod: row.paymentMethod,
              confirmedAt: requiresAdvance ? null : new Date(),
              paymentDueAt: requiresAdvance ? new Date(Date.now() + BOOKING_PAYMENT_WINDOW_MS) : null,
            },
          })
          await tx.bookingPaymentPolicySnapshot.create({
            data: {
              bookingId: booking.id,
              paymentConfigVersionId: payment.paymentConfigVersionId,
              configuredPaymentMode: payment.configuredPaymentMode,
              bookingPaymentMethod: payment.bookingPaymentMethod,
              depositType: payment.depositType,
              depositValue: payment.depositValue,
              depositRateBps: payment.quotedDepositRateBps,
              depositAmount,
              advancePaymentAmount,
              remainingBalanceRule,
              instructionLocale: payment.instructionLocale ?? row.locale,
              instructionText: payment.instructionText,
              accountName: company?.accountName,
              iban: company?.iban,
              bic: company?.swiftCode,
              bankName: company?.bankName,
              companyName: company?.companyName,
              companyEmail: company?.companyEmail,
              companyPhone: company?.companyPhone,
              companyAddress: company?.companyAddress,
              companyPostalCode: company?.companyZipCode,
              companyCity: company?.companyCity,
              companyCountry: company?.companyCountry,
            },
          })
          await enqueueInitialBookingNotifications(
            tx,
            booking.id,
            booking.bookingNumber,
            booking.paymentMethod,
            requiresAdvance,
          )
          await tx.bookingPricingSnapshot.create({
            data: {
              bookingId: booking.id,
              configurationReleaseId: accepted.configurationReleaseId,
              pricingConfigVersionId: accepted.pricingConfigVersionId,
              fleetRateSetId: accepted.fleetRateSetId,
              vehicleRentalRateId: accepted.vehicleRentalRateId,
              snapshotSchemaVersion: accepted.snapshotSchemaVersion,
              releaseNumber: accepted.releaseNumber,
              pricingVersionNumber: accepted.pricingVersionNumber,
              fleetRateSetVersionNumber: accepted.fleetRateSetVersionNumber,
              pricingEngineVersion: accepted.pricingEngineVersion,
              compatibilityMode: false,
              rateSourceType: accepted.rateSourceType,
              rateSourceReference: accepted.rateSourceReference,
              mixedDurationStrategy: accepted.mixedDurationStrategy,
              currency: accepted.currency,
              chargeableDurationMinutes: accepted.chargeableDurationMinutes,
              chargeableDays: accepted.chargeableDays,
              billableDayMethod: accepted.billableDayMethod,
              rentalMonthDefinition: accepted.rentalMonthDefinition,
              dailyUnits: accepted.dailyUnits,
              weeklyUnits: accepted.weeklyUnits,
              monthlyUnits: accepted.monthlyUnits,
              sourceDailyRate: accepted.sourceDailyRate,
              sourceWeeklyRate: accepted.sourceWeeklyRate,
              sourceMonthlyRate: accepted.sourceMonthlyRate,
              baseSubtotal: accepted.baseSubtotal,
              insuranceSubtotal: accepted.insuranceSubtotal,
              adjustmentTotal: accepted.adjustmentTotal,
              taxTotal: accepted.taxTotal,
              grandTotal: accepted.grandTotal,
              calculatedAt: accepted.calculatedAt,
              calculationTrace: accepted.calculationTrace ?? Prisma.JsonNull,
            },
          })
          await tx.bookingCustomerDriverSnapshot.create({
            data: {
              bookingId: booking.id,
              customerDriverConfigVersionId: row.customerDriverConfigVersionId,
              firstName: customer.firstName,
              lastName: customer.lastName,
              email: customer.email,
              phone: customer.phone,
              dateOfBirth: customer.dateOfBirth,
              country: customer.country,
              address: customer.address,
              city: customer.city,
              postalCode: customer.postalCode,
              nationality: customer.nationality,
              licenceNumber: customer.licenceNumber,
              licenceIssueDate: customer.licenceIssueDate,
              licenceExpiryDate: customer.licenceExpiryDate,
              licenceIssuingCountry: customer.licenceIssuingCountry,
              licenceHeldSinceDate: customer.licenceHeldSinceDate,
              capturedAt: customer.capturedAt,
              validatedAt: customer.validatedAt,
            },
          })
          await tx.bookingInsuranceSnapshot.create({
            data: {
              bookingId: booking.id,
              insuranceConfigVersionId: insurance.insuranceConfigVersionId,
              availabilityVehicleId: insurance.availabilityVehicleId,
              selected: insurance.selected,
              requirementMode: insurance.requirementMode,
              customerFacingName: insurance.customerFacingName,
              description: insurance.description,
              unitPrice: insurance.unitPrice,
              billableDays: insurance.billableDays,
              subtotal: insurance.quotedSubtotal,
              currency: insurance.currency,
              taxTreatment: insurance.taxTreatment,
              availabilityScope: insurance.availabilityScope,
              customerSelectionShown: insurance.customerSelectionShown,
              preselected: insurance.preselected,
              showInConfirmation: insurance.showInConfirmation,
              capturedAt: insurance.selectedAt,
            },
          })
          const legal = await tx.bookingApplicationLegalAcceptance.findMany({
            where: { bookingApplicationId: row.id, acceptanceRound: row.legalAcceptanceRound },
          })
          if (legal.length)
            await tx.bookingLegalAcceptance.createMany({
              data: legal.map((evidence) => ({
                bookingId: booking.id,
                legalDocumentTranslationId: evidence.legalDocumentTranslationId,
                customerUserId: evidence.customerUserId,
                configurationReleaseId: evidence.configurationReleaseId,
                legalAcceptanceConfigVersionId: evidence.legalAcceptanceConfigVersionId,
                documentType: evidence.documentType,
                documentVersionNumber: evidence.documentVersionNumber,
                locale: evidence.locale,
                contentHash: evidence.contentHash,
                accepted: evidence.accepted,
                acceptedAt: evidence.acceptedAt,
                source: evidence.source,
                contentSnapshot: evidence.contentSnapshot,
              })),
            })
          await tx.bookingApplication.update({
            where: { id: row.id },
            data: { bookingId: booking.id, revision: { increment: 1 } },
          })
          await tx.customerDocument.updateMany({
            where: {
              uploadSessionId: row.documentUploadSession!.id,
              isCurrent: true,
              manualReviewStatus: "APPROVED",
            },
            data: { bookingId: booking.id },
          })
          await tx.documentUploadSession.update({
            where: { id: row.documentUploadSession!.id },
            data: {
              bookingId: booking.id,
              status: "CONSUMED",
              consumedAt: new Date(),
              revision: { increment: 1 },
            },
          })
          await tx.bookingApplication.update({
            where: { id: row.id },
            data: { status: "FINALIZED", revision: { increment: 1 } },
          })
          return mapView((await load(tx, row.id))!)
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        },
      )
    } catch (error) {
      if (error instanceof BookingApplicationError) throw error
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
        applicationError(
          "APPLICATION_FINALIZATION_CONFLICT",
          "Finalization conflicted with another request. Reload to see the result.",
        )
      throw error
    }
  }
}
