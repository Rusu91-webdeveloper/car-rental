import { describe, expect, it } from "vitest"
import type { BookingApplicationRepository } from "@/lib/booking-applications/repository"
import type { ApplicationMutationInput, BookingApplicationView, CreateBookingApplicationInput } from "@/lib/booking-applications/domain"
import {
  bookingApplicationExpiresAt,
  isApplicationFinalizationTimeValid,
  isCarLifecycleBookable,
} from "@/lib/booking-applications/domain"
import {
  cancelBookingApplication,
  createBookingApplication,
  finalizeBookingApplication,
  loadBookingApplication,
  updateBookingApplicationInsurance,
} from "@/lib/booking-applications/service"
import { BOOKING_APPLICATION_TO_BOOKING_MAPPING, mapApplicationLocationToBooking } from "@/lib/booking-applications/mapping"

const now = new Date("2026-07-13T12:00:00.000Z")

function view(overrides: Partial<BookingApplicationView> = {}): BookingApplicationView {
  return {
    id: "application-opaque-1",
    customerUserId: "customer-1",
    carId: "car-1",
    locale: "en",
    pickupAt: new Date("2026-07-14T10:00:00.000Z"),
    returnAt: new Date("2026-07-16T10:00:00.000Z"),
    businessTimeZone: "Europe/Berlin",
    pickupLocation: "Airport desk",
    returnLocation: "Airport desk",
    status: "AWAITING_DOCUMENT_UPLOAD",
    revision: 2,
    paymentMethod: "TRANSFER",
    expiresAt: new Date("2026-07-15T12:00:00.000Z"),
    documents: [],
    requirements: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

class MemoryRepository implements BookingApplicationRepository {
  application = view()
  private finalization?: Promise<BookingApplicationView>
  async create(input: CreateBookingApplicationInput) {
    this.application = view({
      customerUserId: input.customerUserId,
      pickupLocation: input.pickupLocation,
      returnLocation: input.returnLocation,
    })
    return this.application
  }
  async load(id: string) { return id === this.application.id ? this.application : undefined }
  async saveCustomerDriver(input: ApplicationMutationInput) { return this.mutate(input) }
  async saveInsurance(input: ApplicationMutationInput & { selected: boolean }) {
    this.application.insuranceSelected = input.selected
    return this.mutate(input)
  }
  async savePayment(input: ApplicationMutationInput) { return this.mutate(input) }
  async refreshQuote(input: ApplicationMutationInput) { return this.mutate(input) }
  async recordLegal(input: ApplicationMutationInput) { return this.mutate(input) }
  async submitForReview(input: ApplicationMutationInput) {
    return this.mutate(input, { status: "AWAITING_DOCUMENT_REVIEW" })
  }
  async reconcileConfirmedQuoteAfterReview() { return "VALID" as const }
  async evaluateReadiness() { return { ready: false, blockers: [{ code: "DOCUMENT_APPROVAL_REQUIRED", message: "Document approval required." }] } }
  async markCustomerActionRequired(input: ApplicationMutationInput) {
    return this.mutate(input, { status: "CUSTOMER_ACTION_REQUIRED", actionRequiredReason: "PRICE_CHANGED" })
  }
  async expire() { this.application = view({ ...this.application, status: "EXPIRED", terminalReason: "Expired", revision: this.application.revision + 1 }); return 1 }
  async cancel(input: ApplicationMutationInput) { return this.mutate(input, { status: "CANCELLED", terminalReason: "Cancelled" }) }
  async finalize(input: ApplicationMutationInput) {
    if (this.application.status === "FINALIZED") return this.application
    this.finalization ??= Promise.resolve().then(() => {
      if (this.application.status !== "FINALIZED") this.application = view({ ...this.application, status: "FINALIZED", bookingId: "booking-1", revision: input.expectedRevision + 3 })
      return this.application
    })
    return this.finalization
  }
  private async mutate(input: ApplicationMutationInput, changes: Partial<BookingApplicationView> = {}) {
    if (input.expectedRevision !== this.application.revision) throw new Error("stale")
    this.application = view({ ...this.application, ...changes, revision: this.application.revision + 1 })
    return this.application
  }
}

const createInput: CreateBookingApplicationInput = {
  customerUserId: "customer-1",
  carId: "car-1",
  locale: "en",
  pickupAt: new Date("2026-07-14T10:00:00.000Z"),
  returnAt: new Date("2026-07-16T10:00:00.000Z"),
  pickupLocation: "Airport desk",
  returnLocation: "Airport desk",
  paymentMethod: "TRANSFER",
  idempotencyKey: "opaque-idempotency-key",
}

describe("Phase 8F-B BookingApplication services", () => {
  it("caps the application hold at pickup and rejects stale finalization", () => {
    const createdAt = new Date("2026-07-13T12:00:00.000Z")
    const pickupAt = new Date("2026-07-13T12:30:00.000Z")

    expect(bookingApplicationExpiresAt({ now: createdAt, pickupAt })).toEqual(pickupAt)
    expect(
      isApplicationFinalizationTimeValid(
        { expiresAt: pickupAt, pickupAt },
        new Date("2026-07-13T12:30:00.000Z"),
      ),
    ).toBe(false)
  })

  it("allows only live bookable vehicle lifecycle states", () => {
    expect(isCarLifecycleBookable({ isDeleted: false, status: "AVAILABLE" })).toBe(true)
    expect(isCarLifecycleBookable({ isDeleted: false, status: "LOW_STOCK" })).toBe(true)
    expect(isCarLifecycleBookable({ isDeleted: false, status: "MAINTENANCE" })).toBe(false)
    expect(isCarLifecycleBookable({ isDeleted: false, status: "RENTED" })).toBe(false)
    expect(isCarLifecycleBookable({ isDeleted: true, status: "AVAILABLE" })).toBe(false)
  })

  it("preserves the exact single-location business rule and mapping", async () => {
    const repository = new MemoryRepository()
    expect((await createBookingApplication(repository, createInput)).pickupLocation).toBe("Airport desk")
    expect(mapApplicationLocationToBooking(createInput)).toBe("Airport desk")
    expect(BOOKING_APPLICATION_TO_BOOKING_MAPPING.location).toContain("must equal")
    await expect(createBookingApplication(repository, { ...createInput, returnLocation: "City desk" })).rejects.toMatchObject({ code: "APPLICATION_LOCATION_MISMATCH" })
  })

  it("rejects cross-owner resume without leaking application state", async () => {
    const repository = new MemoryRepository()
    await expect(loadBookingApplication(repository, { applicationId: repository.application.id, customerUserId: "other-user" })).rejects.toMatchObject({ code: "APPLICATION_ACCESS_DENIED" })
  })

  it("uses optimistic revision for updates and preserves refresh recovery", async () => {
    const repository = new MemoryRepository()
    const updated = await updateBookingApplicationInsurance(repository, { applicationId: repository.application.id, customerUserId: "customer-1", expectedRevision: 2, selected: true })
    expect(updated).toMatchObject({ revision: 3, insuranceSelected: true })
    expect(await loadBookingApplication(repository, { applicationId: updated.id, customerUserId: "customer-1" })).toMatchObject({ revision: 3, insuranceSelected: true })
    await expect(updateBookingApplicationInsurance(repository, { applicationId: updated.id, customerUserId: "customer-1", expectedRevision: 2, selected: false })).rejects.toThrow("stale")
  })

  it("renders cancellation as terminal evidence", async () => {
    const repository = new MemoryRepository()
    const cancelled = await cancelBookingApplication(repository, { applicationId: repository.application.id, customerUserId: "customer-1", expectedRevision: 2, reason: "Cancelled" })
    expect(cancelled).toMatchObject({ status: "CANCELLED", terminalReason: "Cancelled" })
  })

  it("makes concurrent finalization converge on exactly one Booking", async () => {
    const repository = new MemoryRepository()
    repository.application = view({ status: "READY_TO_FINALIZE", revision: 9 })
    const [first, second] = await Promise.all([
      finalizeBookingApplication(repository, { applicationId: repository.application.id, customerUserId: "customer-1", expectedRevision: 9 }),
      finalizeBookingApplication(repository, { applicationId: repository.application.id, customerUserId: "customer-1", expectedRevision: 9 }),
    ])
    expect(first.bookingId).toBe("booking-1")
    expect(second.bookingId).toBe("booking-1")
  })
})
