import { applicationError } from "./errors"

export function assertSharedRentalLocation(input: {
  pickupLocation: string
  returnLocation: string
}) {
  const pickup = input.pickupLocation.trim()
  const dropoff = input.returnLocation.trim()
  if (!pickup || !dropoff || pickup !== dropoff)
    applicationError(
      "APPLICATION_LOCATION_MISMATCH",
      "Pick-up and return must use the same location for this rental.",
    )
  return pickup
}

export function mapApplicationLocationToBooking(input: {
  pickupLocation: string
  returnLocation: string
}) {
  return assertSharedRentalLocation(input)
}

export const BOOKING_APPLICATION_TO_BOOKING_MAPPING = {
  vehicle: "BookingApplication.carId -> Booking.carId",
  dates: "pickupAt/returnAt -> pickupDate/dropoffDate",
  location:
    "pickupLocation must equal returnLocation; shared value -> Booking.location",
  price: "confirmed current quote -> Booking pricing fields and pricing snapshot",
  currency: "current quote currency -> pricing/insurance snapshots",
  payment: "payment selection -> Booking.paymentMethod and deposit amount",
  customer: "validated customer/driver evidence -> customer/driver snapshot",
  insurance: "exact selection -> insurance snapshot",
  configuration: "release-bound identifiers -> immutable snapshots",
  legal: "current acceptance round -> BookingLegalAcceptance rows",
  documents: "current approved documents -> Booking and consumed upload session",
} as const
