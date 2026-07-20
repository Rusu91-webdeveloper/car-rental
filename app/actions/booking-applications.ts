"use server"

import { z } from "zod"
import { requireAuth } from "@/lib/auth"
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
    sharedLocation: z.string().trim().min(1).max(200),
    locale: z.enum(["de", "en"]),
    paymentMethod: z.enum(["TRANSFER", "PAY_AT_PICKUP"]),
    insuranceSelected: z.boolean(),
    customer: customerSchema,
    legalAcknowledgements: z.object({
      rentalTerms: z.boolean(),
      privacyNotice: z.boolean(),
    }),
    idempotencyKey: z.string().min(16).max(128),
  })
  .refine((value) => new Date(value.returnAt) > new Date(value.pickupAt), {
    path: ["returnAt"],
    message: "Return must be after pick-up.",
  })

function publicError(error: unknown) {
  if (error instanceof BookingApplicationError)
    return { error: error.message, code: error.code }
  if (error instanceof RateLimitExceededError)
    return {
      error: error.message,
      code: "RATE_LIMITED",
      retryAfterSeconds: error.retryAfterSeconds,
    }
  if (error instanceof z.ZodError)
    return { error: error.issues[0]?.message ?? "Invalid application request.", code: "INVALID_REQUEST" }
  console.error("[BOOKING_APPLICATION_ERROR]", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    code:
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : undefined,
  })
  return { error: "The application could not be saved.", code: "APPLICATION_FAILED" }
}

export async function beginBookingApplication(input: unknown) {
  try {
    const user = await requireAuth()
    await enforceRateLimit("application:create", user.id, PHASE8FB_RATE_LIMITS.applicationCreate)
    const value = beginSchema.parse(input)
    const repository = new PrismaBookingApplicationRepository(prisma)
    let application = await createBookingApplication(repository, {
      customerUserId: user.id,
      carId: value.carId,
      locale: value.locale,
      pickupAt: new Date(value.pickupAt),
      returnAt: new Date(value.returnAt),
      pickupLocation: value.sharedLocation,
      returnLocation: value.sharedLocation,
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
    return { applicationId: application.id, revision: application.revision }
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
    return { applicationId: application.id, bookingId: application.bookingId, revision: application.revision }
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
    return { applicationId: application.id, revision: application.revision }
  } catch (error) {
    return publicError(error)
  }
}
