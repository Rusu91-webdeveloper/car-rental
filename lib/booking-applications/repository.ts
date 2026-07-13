import type { BookingCustomerDriverInput } from "@/lib/booking-configuration/types"
import type {
  ApplicationMutationInput,
  ApplicationPaymentMethod,
  ApplicationReadiness,
  BookingApplicationView,
  CreateBookingApplicationInput,
} from "./domain"

export interface BookingApplicationRepository {
  create(input: CreateBookingApplicationInput): Promise<BookingApplicationView>
  load(applicationId: string): Promise<BookingApplicationView | undefined>
  saveCustomerDriver(
    input: ApplicationMutationInput & { customer: BookingCustomerDriverInput },
  ): Promise<BookingApplicationView>
  saveInsurance(
    input: ApplicationMutationInput & { selected: boolean },
  ): Promise<BookingApplicationView>
  savePayment(
    input: ApplicationMutationInput & { paymentMethod: ApplicationPaymentMethod },
  ): Promise<BookingApplicationView>
  refreshQuote(
    input: ApplicationMutationInput & { confirm: boolean },
  ): Promise<BookingApplicationView>
  recordLegal(
    input: ApplicationMutationInput & {
      rentalTerms: boolean
      privacyNotice: boolean
    },
  ): Promise<BookingApplicationView>
  submitForReview(input: ApplicationMutationInput): Promise<BookingApplicationView>
  evaluateReadiness(applicationId: string): Promise<ApplicationReadiness>
  markCustomerActionRequired(
    input: ApplicationMutationInput & { reason: string },
  ): Promise<BookingApplicationView>
  expire(now: Date, limit: number): Promise<number>
  cancel(
    input: ApplicationMutationInput & { reason: string },
  ): Promise<BookingApplicationView>
  finalize(input: ApplicationMutationInput): Promise<BookingApplicationView>
}
