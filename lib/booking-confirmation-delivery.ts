import "server-only"

import { prisma } from "@/lib/db"
import { sendBookingConfirmationEmail } from "@/lib/email"
import { loadBookingConfirmationConfiguration } from "@/lib/booking-confirmation-configuration"
import { bookingTotalFromSnapshot } from "@/lib/pricing/snapshot"

function normalizeLocale(locale: string | null | undefined): "de" | "en" {
  return locale === "de" ? "de" : "en"
}

function formatDate(date: Date, locale: "de" | "en") {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date)
}

type BookingConfirmationDeliveryResult = {
  success?: boolean
  id?: string
  error?: string
  bookingNumber?: string
  customerEmail?: string
}

export async function deliverBookingConfirmation(
  bookingId: string,
  options: { manualResend?: boolean } = {},
): Promise<BookingConfirmationDeliveryResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: true,
      car: true,
      pricingSnapshot: true,
      customerDriverSnapshot: true,
      legalAcceptances: {
        select: {
          documentType: true,
          documentVersionNumber: true,
          acceptedAt: true,
        },
      },
    },
  })

  if (!booking) return { error: "Booking not found" }

  const locale = normalizeLocale(booking.locale)
  const customerEmail = booking.customerDriverSnapshot?.email || booking.user.email
  if (!customerEmail) return { error: "Customer email is missing" }

  const confirmation = await loadBookingConfirmationConfiguration(booking.id)
  const result = await sendBookingConfirmationEmail({
    to: customerEmail,
    userName:
      [booking.customerDriverSnapshot?.firstName, booking.customerDriverSnapshot?.lastName]
        .filter(Boolean)
        .join(" ") || booking.user.name || customerEmail,
    carName: locale === "de" ? booking.car.nameDe || booking.car.name : booking.car.name,
    pickupDate: formatDate(booking.pickupDate, locale),
    dropoffDate: formatDate(booking.dropoffDate, locale),
    location: booking.location,
    totalPrice: bookingTotalFromSnapshot(booking),
    currency: booking.pricingSnapshot?.currency,
    guaranteeAmount: booking.guaranteeAmount,
    transferCode: booking.paymentMethod === "TRANSFER" ? booking.transferCode : undefined,
    paymentMethod: booking.paymentMethod,
    bookingNumber: booking.bookingNumber,
    locale,
    legalReferences: booking.legalAcceptances.map((acceptance) => ({
      type: acceptance.documentType,
      versionNumber: acceptance.documentVersionNumber,
      acceptedAt: acceptance.acceptedAt,
    })),
    confirmationHeading: confirmation.heading,
    confirmationContent: confirmation.content,
    paymentMode: confirmation.paymentMode,
    paymentInstructions: confirmation.paymentInstructions,
    showPaymentInstructions: confirmation.showPaymentInstructions,
    idempotencyKey: options.manualResend
      ? `booking-confirmation-${booking.bookingNumber}-manual-${Date.now()}`
      : undefined,
  })

  return {
    ...result,
    bookingNumber: booking.bookingNumber,
    customerEmail,
  }
}
