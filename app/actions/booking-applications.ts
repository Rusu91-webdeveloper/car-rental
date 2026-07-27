"use server"

import { z } from "zod"
import { requireAdmin, requireAuth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import {
  cancelBookingApplication,
  createBookingApplication,
  createOrRefreshApplicationQuote,
  evaluateBookingApplicationReadiness,
  finalizeBookingApplication,
  loadBookingApplication,
  recordApplicationLegalAcceptance,
  submitApplicationForDocumentReview,
  updateBookingApplicationCustomerDriver,
  updateBookingApplicationInsurance,
  updateBookingApplicationPaymentSelection,
} from "@/lib/booking-applications/service"
import { BookingApplicationError } from "@/lib/booking-applications/errors"
import { PrismaBookingApplicationRepository } from "@/lib/booking-applications/infrastructure/prisma-repository"
import { enforceRateLimit, PHASE8FB_RATE_LIMITS, RateLimitExceededError } from "@/lib/rate-limit"
import { dispatchPendingBookingNotificationsForBooking } from "@/lib/booking-notifications"
import { sendAdminBookingApplicationNotification, sendBookingApplicationCancelledEmail, sendBookingApplicationSubmittedEmail } from "@/lib/email"
import { config } from "@/lib/config"
import { logger } from "@/lib/logger"
import { formatCompanyPickupLocation } from "@/lib/company-pickup-location"
import {
  DEFAULT_VEHICLE_PREPARATION_BUFFER_MINUTES,
  LATE_RETURN_POLICY_VERSION,
  LATE_RETURN_SAFETY_BUFFER_MINUTES,
  totalOperationalBufferMinutes,
} from "@/lib/rental-timing"

const normalizeLocale = (locale: string): "de" | "en" => (locale === "de" ? "de" : "en")

const formatApplicationDate = (date: Date, locale: "de" | "en") =>
  new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date)

async function loadApplicationEmailContext(applicationId: string) {
  const [application, companySettings] = await Promise.all([
    prisma.bookingApplication.findUnique({
      where: { id: applicationId },
      include: {
        customer: { select: { email: true, name: true } },
        customerDriver: {
          select: { firstName: true, lastName: true, email: true },
        },
        car: { select: { name: true, nameDe: true } },
      },
    }),
    prisma.companySettings.findUnique({
      where: { id: "company-settings" },
      select: { adminEmail: true },
    }),
  ])
  if (!application) return undefined
  const locale = normalizeLocale(application.locale)
  const email = application.customerDriver?.email || application.customer.email
  const userName =
    [application.customerDriver?.firstName, application.customerDriver?.lastName].filter(Boolean).join(" ") ||
    application.customer.name ||
    email ||
    (locale === "de" ? "Kunde" : "Customer")
  const adminEmails = Array.from(new Set([...config.adminEmails, companySettings?.adminEmail].filter((value): value is string => Boolean(value))))
  return {
    applicationId: application.id,
    to: email,
    userName,
    carName: locale === "de" ? application.car.nameDe || application.car.name : application.car.name,
    pickupDate: formatApplicationDate(application.pickupAt, locale),
    returnDate: formatApplicationDate(application.returnAt, locale),
    location: application.pickupLocation,
    locale,
    adminEmails,
  }
}

async function notifyApplicationSubmitted(applicationId: string, revision: number) {
  try {
    const context = await loadApplicationEmailContext(applicationId)
    if (!context?.to) {
      logger.warn("booking_application.submission_email_skipped", {
        applicationId,
        reason: "missing_customer_email",
      })
      return
    }
    const deliveries = [
      sendBookingApplicationSubmittedEmail({
        ...context,
        to: context.to,
        idempotencyKey: `application-submitted-customer-${applicationId}-${revision}`,
      }),
    ]
    if (context.adminEmails.length) {
      deliveries.push(
        sendAdminBookingApplicationNotification({
          ...context,
          to: context.adminEmails,
          customerEmail: context.to,
          idempotencyKey: `application-submitted-admin-${applicationId}-${revision}`,
        }),
      )
    }
    const results = await Promise.all(deliveries)
    if (results.some((result) => "error" in result)) {
      logger.error("booking_application.submission_email_failed", {
        applicationId,
        revision,
      })
    }
  } catch (error) {
    logger.error("booking_application.submission_email_failed", {
      applicationId,
      revision,
      error: error instanceof Error ? error.message : "unknown",
    })
  }
}

async function notifyApplicationCancelled(applicationId: string, revision: number, reason: string) {
  try {
    const context = await loadApplicationEmailContext(applicationId)
    if (!context?.to) return
    const delivery = await sendBookingApplicationCancelledEmail({
      ...context,
      to: context.to,
      reason,
      idempotencyKey: `application-cancelled-${applicationId}-${revision}`,
    })
    if ("error" in delivery) {
      logger.error("booking_application.cancellation_email_failed", {
        applicationId,
        revision,
      })
    }
  } catch (error) {
    logger.error("booking_application.cancellation_email_failed", {
      applicationId,
      revision,
      error: error instanceof Error ? error.message : "unknown",
    })
  }
}

const customerSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  country: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  nationality: z.string().optional(),
  licenceNumber: z.string().optional(),
  licenceIssueDate: z.string().optional(),
  licenceExpiryDate: z.string().optional(),
  licenceIssuingCountry: z.string().optional(),
})

const beginSchema = z
  .object({
    carId: z.string().min(1),
    pickupAt: z.string().datetime(),
    returnAt: z.string().datetime(),
    locale: z.enum(["de", "en"]),
    paymentMethod: z.enum(["TRANSFER", "PAY_AT_PICKUP"]),
    insuranceSelected: z.boolean(),
    customer: customerSchema,
    legalAcknowledgements: z.object({
      rentalTerms: z.boolean(),
      privacyNotice: z.boolean(),
      lateReturnPolicy: z.literal(true, {
        message: "The return-time and late-use rules must be acknowledged.",
      }),
    }),
    idempotencyKey: z.string().min(16).max(128),
  })
  .refine((value) => new Date(value.returnAt) > new Date(value.pickupAt), {
    path: ["returnAt"],
    message: "Return must be after pick-up.",
  })

function publicError(error: unknown) {
  if (error instanceof BookingApplicationError) return { error: error.message, code: error.code }
  if (error instanceof RateLimitExceededError)
    return {
      error: error.message,
      code: "RATE_LIMITED",
      retryAfterSeconds: error.retryAfterSeconds,
    }
  if (error instanceof z.ZodError)
    return {
      error: error.issues[0]?.message ?? "Invalid application request.",
      code: "INVALID_REQUEST",
    }
  console.error("[BOOKING_APPLICATION_ERROR]", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    code: typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined,
  })
  return {
    error: "The application could not be saved.",
    code: "APPLICATION_FAILED",
  }
}

export async function beginBookingApplication(input: unknown) {
  try {
    const user = await requireAuth()
    await enforceRateLimit("application:create", user.id, PHASE8FB_RATE_LIMITS.applicationCreate)
    const value = beginSchema.parse(input)
    const [companySettings, activeRelease] = await Promise.all([
      prisma.companySettings.findUnique({
        where: { id: "company-settings" },
        select: {
          companyAddress: true,
          companyCity: true,
          companyState: true,
          companyZipCode: true,
          companyCountry: true,
        },
      }),
      prisma.businessConfigurationRelease.findFirst({
        where: { status: "ACTIVE" },
        select: { pricingBillingConfig: { select: { preparationBufferMinutes: true } } },
      }),
    ])
    const preparationBufferMinutes =
      activeRelease?.pricingBillingConfig.preparationBufferMinutes ?? DEFAULT_VEHICLE_PREPARATION_BUFFER_MINUTES
    const pickupLocation = formatCompanyPickupLocation(companySettings)
    if (!pickupLocation)
      throw new BookingApplicationError(
        "APPLICATION_CONFIGURATION_UNAVAILABLE",
        "The rental company pickup address is not configured.",
      )
    const repository = new PrismaBookingApplicationRepository(prisma)
    let application = await createBookingApplication(repository, {
      customerUserId: user.id,
      carId: value.carId,
      locale: value.locale,
      pickupAt: new Date(value.pickupAt),
      returnAt: new Date(value.returnAt),
      pickupLocation,
      returnLocation: pickupLocation,
      paymentMethod: value.paymentMethod,
      idempotencyKey: value.idempotencyKey,
    })
    application = await updateBookingApplicationCustomerDriver(repository, {
      applicationId: application.id,
      customerUserId: user.id,
      expectedRevision: application.revision,
      customer: value.customer,
    })
    application = await updateBookingApplicationInsurance(repository, {
      applicationId: application.id,
      customerUserId: user.id,
      expectedRevision: application.revision,
      selected: value.insuranceSelected,
    })
    application = await createOrRefreshApplicationQuote(repository, {
      applicationId: application.id,
      customerUserId: user.id,
      expectedRevision: application.revision,
      confirm: false,
    })
    application = await updateBookingApplicationPaymentSelection(repository, {
      applicationId: application.id,
      customerUserId: user.id,
      expectedRevision: application.revision,
      paymentMethod: value.paymentMethod,
    })
    application = await createOrRefreshApplicationQuote(repository, {
      applicationId: application.id,
      customerUserId: user.id,
      expectedRevision: application.revision,
      confirm: true,
    })
    application = await recordApplicationLegalAcceptance(repository, {
      applicationId: application.id,
      customerUserId: user.id,
      expectedRevision: application.revision,
      ...value.legalAcknowledgements,
    })
    await prisma.auditEvent.create({
      data: {
        category: "BOOKING",
        action: "booking_application.late_return_policy_acknowledged",
        actorUserId: user.id,
        targetType: "BookingApplication",
        targetId: application.id,
        metadata: {
          policyVersion: LATE_RETURN_POLICY_VERSION,
          lateReturnSafetyBufferMinutes: LATE_RETURN_SAFETY_BUFFER_MINUTES,
          preparationBufferMinutes,
          totalOperationalBufferMinutes: totalOperationalBufferMinutes(preparationBufferMinutes),
          locale: value.locale,
        },
      },
    })
    return { applicationId: application.id, revision: application.revision }
  } catch (error) {
    return publicError(error)
  }
}

const applicationMutationSchema = z.object({
  applicationId: z.string().min(1),
  expectedRevision: z.number().int().positive(),
})

export async function getBookingApplication(applicationId: string) {
  try {
    const user = await requireAuth()
    const repository = new PrismaBookingApplicationRepository(prisma)
    await loadBookingApplication(repository, {
      applicationId,
      customerUserId: user.id,
    })
    const readiness = await evaluateBookingApplicationReadiness(repository, applicationId)
    return { application: await repository.load(applicationId), readiness }
  } catch (error) {
    return publicError(error)
  }
}

export async function submitBookingApplicationForReview(input: unknown) {
  try {
    const user = await requireAuth()
    await enforceRateLimit("application:update", user.id, PHASE8FB_RATE_LIMITS.applicationUpdate)
    const value = applicationMutationSchema.parse(input)
    const repository = new PrismaBookingApplicationRepository(prisma)
    const application = await submitApplicationForDocumentReview(repository, {
      ...value,
      customerUserId: user.id,
    })
    await notifyApplicationSubmitted(application.id, application.revision)
    return {
      applicationId: application.id,
      revision: application.revision,
      submittedForReview: true,
    }
  } catch (error) {
    return publicError(error)
  }
}

export async function confirmRenewedApplicationTerms(input: unknown) {
  try {
    const user = await requireAuth()
    await enforceRateLimit("application:update", user.id, PHASE8FB_RATE_LIMITS.applicationUpdate)
    const value = applicationMutationSchema.extend({ rentalTerms: z.boolean(), privacyNotice: z.boolean() }).parse(input)
    const repository = new PrismaBookingApplicationRepository(prisma)
    let application = await createOrRefreshApplicationQuote(repository, {
      ...value,
      customerUserId: user.id,
      confirm: true,
    })
    application = await recordApplicationLegalAcceptance(repository, {
      applicationId: application.id,
      customerUserId: user.id,
      expectedRevision: application.revision,
      rentalTerms: value.rentalTerms,
      privacyNotice: value.privacyNotice,
    })
    const readiness = await evaluateBookingApplicationReadiness(repository, application.id)
    return { application: await repository.load(application.id), readiness }
  } catch (error) {
    return publicError(error)
  }
}

export async function finalizeSavedBookingApplication(input: unknown) {
  try {
    const user = await requireAuth()
    await enforceRateLimit("application:finalize", user.id, PHASE8FB_RATE_LIMITS.finalization)
    const value = applicationMutationSchema.parse(input)
    const repository = new PrismaBookingApplicationRepository(prisma)
    const application = await finalizeBookingApplication(repository, {
      ...value,
      customerUserId: user.id,
    })
    const deliveries = application.bookingId
      ? await dispatchPendingBookingNotificationsForBooking(application.bookingId)
      : undefined
    return {
      applicationId: application.id,
      bookingId: application.bookingId,
      revision: application.revision,
      confirmationEmailSent: deliveries ? deliveries.some((delivery) => "sent" in delivery) : undefined,
    }
  } catch (error) {
    return publicError(error)
  }
}

export async function cancelSavedBookingApplication(input: unknown) {
  try {
    const user = await requireAuth()
    await enforceRateLimit("application:update", user.id, PHASE8FB_RATE_LIMITS.applicationUpdate)
    const value = applicationMutationSchema.parse(input)
    const repository = new PrismaBookingApplicationRepository(prisma)
    const application = await cancelBookingApplication(repository, {
      ...value,
      customerUserId: user.id,
      reason: "Cancelled by customer.",
    })
    await notifyApplicationCancelled(application.id, application.revision, "Cancelled by customer.")
    return { applicationId: application.id, revision: application.revision }
  } catch (error) {
    return publicError(error)
  }
}

const adminCancelApplicationSchema = z.object({
  applicationId: z.string().min(1),
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500).default("Cancelled by administrator."),
})

export async function cancelBookingApplicationAsAdmin(input: unknown) {
  try {
    const admin = await requireAdmin()
    const value = adminCancelApplicationSchema.parse(input)
    const current = await prisma.bookingApplication.findUnique({
      where: { id: value.applicationId },
      select: { customerUserId: true, status: true, revision: true },
    })
    if (!current) return { error: "Booking application not found." }

    const repository = new PrismaBookingApplicationRepository(prisma)
    const application = await cancelBookingApplication(repository, {
      applicationId: value.applicationId,
      customerUserId: current.customerUserId,
      expectedRevision: value.expectedRevision,
      reason: value.reason,
    })

    await notifyApplicationCancelled(application.id, application.revision, value.reason)

    await prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: "BOOKING_CANCELLED",
        targetType: "booking_application",
        targetId: application.id,
        oldValue: { status: current.status, revision: current.revision },
        newValue: {
          status: application.status,
          revision: application.revision,
        },
        reason: value.reason,
      },
    })

    revalidatePath("/admin")
    revalidatePath("/bookings")
    return {
      applicationId: application.id,
      status: application.status,
      revision: application.revision,
    }
  } catch (error) {
    return publicError(error)
  }
}
