import "server-only"

import { prisma } from "@/lib/db"

export type OfflinePaymentInstructionMode =
  | "BOOKING_REQUEST"
  | "BANK_TRANSFER"
  | "CASH_ON_PICKUP"

export interface BookingConfirmationConfiguration {
  heading?: string
  content?: string
  showPaymentInstructions: boolean
  paymentMode?: OfflinePaymentInstructionMode
  paymentInstructions?: string
}

function localized<T extends { locale: string }>(values: T[], locale: string) {
  return (
    values.find((value) => value.locale === locale) ??
    values.find((value) => value.locale === "en") ??
    values[0]
  )
}

/**
 * Resolve the immutable payment/confirmation snapshot captured by the booking
 * application. Legacy bookings without a source application keep the existing
 * confirmation-email fallback.
 */
export async function loadBookingConfirmationConfiguration(
  bookingId: string,
): Promise<BookingConfirmationConfiguration> {
  const application = await prisma.bookingApplication.findFirst({
    where: { bookingId },
    select: {
      locale: true,
      paymentSelection: {
        select: {
          configuredPaymentMode: true,
          paymentInstruction: {
            select: { method: true, locale: true, instructions: true },
          },
        },
      },
      confirmationConfig: {
        select: {
          sections: {
            select: {
              enabled: true,
              sectionDefinition: { select: { key: true } },
            },
          },
          translations: {
            select: { locale: true, heading: true, safeContent: true },
          },
        },
      },
    },
  })

  if (!application) return { showPaymentInstructions: false }

  const content = localized(application.confirmationConfig.translations, application.locale)
  const paymentSection = application.confirmationConfig.sections.find(
    ({ sectionDefinition }) => sectionDefinition.key === "PAYMENT",
  )
  const selected = application.paymentSelection
  const supportedMode = selected?.configuredPaymentMode
  const paymentMode =
    supportedMode === "BOOKING_REQUEST" ||
    supportedMode === "BANK_TRANSFER" ||
    supportedMode === "CASH_ON_PICKUP"
      ? supportedMode
      : undefined
  const instruction = selected?.paymentInstruction
  const instructionMatchesSelection = instruction?.method === paymentMode
  const paymentInstructions = instructionMatchesSelection ? instruction?.instructions : undefined

  return {
    heading: content?.heading ?? undefined,
    content: content?.safeContent ?? undefined,
    showPaymentInstructions: Boolean(
      paymentSection?.enabled && paymentMode && paymentInstructions,
    ),
    paymentMode,
    paymentInstructions,
  }
}
