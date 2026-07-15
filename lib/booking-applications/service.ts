import type { BookingCustomerDriverInput } from "@/lib/booking-configuration/types"
import type {
  ApplicationMutationInput,
  ApplicationPaymentMethod,
  CreateBookingApplicationInput,
} from "./domain"
import { applicationError } from "./errors"
import { assertSharedRentalLocation } from "./mapping"
import type { BookingApplicationRepository } from "./repository"

function validMutation(input: ApplicationMutationInput) {
  if (!input.applicationId || !input.customerUserId || input.expectedRevision < 1)
    applicationError("APPLICATION_REVISION_CONFLICT", "Application revision is invalid.")
}

export async function createBookingApplication(
  repository: BookingApplicationRepository,
  input: CreateBookingApplicationInput,
) {
  assertSharedRentalLocation(input)
  if (input.pickupAt >= input.returnAt)
    applicationError("APPLICATION_NOT_READY", "Return must be after pick-up.")
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 128)
    applicationError("APPLICATION_REVISION_CONFLICT", "Application key is invalid.")
  return repository.create(input)
}

export async function loadBookingApplication(
  repository: BookingApplicationRepository,
  input: { applicationId: string; customerUserId: string },
) {
  const application = await repository.load(input.applicationId)
  if (!application) applicationError("APPLICATION_NOT_FOUND", "Application not found.")
  if (application.customerUserId !== input.customerUserId)
    applicationError("APPLICATION_ACCESS_DENIED", "Application belongs to another customer.")
  return application
}

export const resumeBookingApplication = loadBookingApplication

export async function updateBookingApplicationCustomerDriver(
  repository: BookingApplicationRepository,
  input: ApplicationMutationInput & { customer: BookingCustomerDriverInput },
) {
  validMutation(input)
  return repository.saveCustomerDriver(input)
}

export async function updateBookingApplicationInsurance(
  repository: BookingApplicationRepository,
  input: ApplicationMutationInput & { selected: boolean },
) {
  validMutation(input)
  return repository.saveInsurance(input)
}

export async function updateBookingApplicationPaymentSelection(
  repository: BookingApplicationRepository,
  input: ApplicationMutationInput & { paymentMethod: ApplicationPaymentMethod },
) {
  validMutation(input)
  return repository.savePayment(input)
}

export async function createOrRefreshApplicationQuote(
  repository: BookingApplicationRepository,
  input: ApplicationMutationInput & { confirm: boolean },
) {
  validMutation(input)
  return repository.refreshQuote(input)
}

export async function recordApplicationLegalAcceptance(
  repository: BookingApplicationRepository,
  input: ApplicationMutationInput & { rentalTerms: boolean; privacyNotice: boolean },
) {
  validMutation(input)
  return repository.recordLegal(input)
}

export async function submitApplicationForDocumentReview(
  repository: BookingApplicationRepository,
  input: ApplicationMutationInput,
) {
  validMutation(input)
  return repository.submitForReview(input)
}

export function evaluateBookingApplicationReadiness(
  repository: BookingApplicationRepository,
  applicationId: string,
) {
  return repository.evaluateReadiness(applicationId)
}

export function markApplicationCustomerActionRequired(
  repository: BookingApplicationRepository,
  input: ApplicationMutationInput & { reason: string },
) {
  validMutation(input)
  return repository.markCustomerActionRequired(input)
}

export function expireBookingApplications(
  repository: BookingApplicationRepository,
  now = new Date(),
  limit = 100,
) {
  return repository.expire(now, Math.min(500, Math.max(1, limit)))
}

export function cancelBookingApplication(
  repository: BookingApplicationRepository,
  input: ApplicationMutationInput & { reason: string },
) {
  validMutation(input)
  return repository.cancel(input)
}

export function finalizeBookingApplication(
  repository: BookingApplicationRepository,
  input: ApplicationMutationInput,
) {
  validMutation(input)
  return repository.finalize(input)
}
