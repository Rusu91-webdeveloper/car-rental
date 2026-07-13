import type { BookingCustomerDriverInput } from "@/lib/booking-configuration/types"

export const BOOKING_APPLICATION_ACTIVE_STATUSES = [
  "DRAFT",
  "AWAITING_DOCUMENT_UPLOAD",
  "AWAITING_DOCUMENT_REVIEW",
  "CUSTOMER_ACTION_REQUIRED",
  "READY_TO_FINALIZE",
] as const

export type BookingApplicationStatus =
  | (typeof BOOKING_APPLICATION_ACTIVE_STATUSES)[number]
  | "FINALIZING"
  | "FINALIZED"
  | "EXPIRED"
  | "CANCELLED"
  | "REJECTED"

export type ApplicationPaymentMethod = "TRANSFER" | "PAY_AT_PICKUP"

export interface CreateBookingApplicationInput {
  customerUserId: string
  carId: string
  locale: "de" | "en"
  pickupAt: Date
  returnAt: Date
  pickupLocation: string
  returnLocation: string
  paymentMethod: ApplicationPaymentMethod
  idempotencyKey: string
  expiresInMs?: number
}

export interface ApplicationMutationInput {
  applicationId: string
  customerUserId: string
  expectedRevision: number
}

export interface BookingApplicationView {
  id: string
  customerUserId: string
  carId: string
  locale: string
  pickupAt: Date
  returnAt: Date
  pickupLocation: string
  returnLocation: string
  status: BookingApplicationStatus
  revision: number
  paymentMethod: ApplicationPaymentMethod
  expiresAt: Date
  actionRequiredReason?: string
  terminalReason?: string
  bookingId?: string
  uploadSessionId?: string
  customerDriver?: BookingCustomerDriverInput
  insuranceSelected?: boolean
  quote?: {
    id: string
    version: number
    currency: string
    grandTotal: number
    depositAmount: number
    guaranteeAmount: number
    expiresAt: Date
    confirmedAt?: Date
  }
  documents: Array<{
    id: string
    documentTypeId: string
    documentTypeKey: string
    side: "SINGLE" | "FRONT" | "BACK"
    slotNumber: number
    attemptNumber: number
    uploadStatus: string
    scanStatus: string
    manualReviewStatus: string
    reviewRevision: number
    reviewReasonCode?: string
    replacesDocumentId?: string
  }>
  requirements: Array<{
    documentTypeId: string
    documentTypeKey: string
    name: string
    mode: "REQUIRED" | "OPTIONAL" | "DISABLED"
    fileCount: number
    sides: "SINGLE_FILE" | "FRONT_AND_BACK"
    instructions?: string
  }>
  identityDocumentChoice?: string
  createdAt: Date
  updatedAt: Date
}

export interface ApplicationReadinessBlocker {
  code: string
  message: string
}

export interface ApplicationReadiness {
  ready: boolean
  blockers: ApplicationReadinessBlocker[]
}
