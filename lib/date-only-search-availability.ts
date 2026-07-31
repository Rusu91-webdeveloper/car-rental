import type { PublicBookingConfiguration } from "@/lib/booking-configuration/types"
import {
  businessLocalDateTimeToInstant,
  handoverSlotHasCapacity,
  handoverTimeOptions,
  hasMinimumPickupLeadTime,
  openingHoursForDate,
  type HandoverEvent,
} from "@/lib/business-hours"
import { parseDateOnlyLocal } from "@/lib/business-date"

export interface SearchHandoverWindow {
  pickupAt: Date
  returnAt: Date
}

export function dateOnlySearchHandoverWindows(input: {
  pickupDate: string
  returnDate: string
  configuration: Pick<
    PublicBookingConfiguration,
    | "businessTimeZone"
    | "weeklyOpeningHours"
    | "openingHoursExceptions"
    | "handoverPolicy"
    | "minimumRentalMinutes"
  >
  handoverEvents: HandoverEvent[]
  now?: Date
}): SearchHandoverWindow[] {
  const pickupDay = parseDateOnlyLocal(input.pickupDate)
  const returnDay = parseDateOnlyLocal(input.returnDate)
  if (!pickupDay || !returnDay || pickupDay >= returnDay) return []

  const { configuration } = input
  const pickupTimes = handoverTimeOptions(
    openingHoursForDate(pickupDay, configuration.weeklyOpeningHours, configuration.openingHoursExceptions),
    "PICKUP",
    configuration.handoverPolicy.slotIntervalMinutes,
  )
  const returnTimes = handoverTimeOptions(
    openingHoursForDate(returnDay, configuration.weeklyOpeningHours, configuration.openingHoursExceptions),
    "RETURN",
    configuration.handoverPolicy.slotIntervalMinutes,
  )
  const now = input.now ?? new Date()
  const pickupInstants = pickupTimes.flatMap((time) => {
    const instant = businessLocalDateTimeToInstant(
      `${input.pickupDate}T${time}`,
      configuration.businessTimeZone,
    )
    return instant &&
      hasMinimumPickupLeadTime(instant, configuration.handoverPolicy, now) &&
      handoverSlotHasCapacity(instant, "PICKUP", input.handoverEvents, configuration.handoverPolicy)
      ? [instant]
      : []
  })
  const returnInstants = returnTimes.flatMap((time) => {
    const instant = businessLocalDateTimeToInstant(
      `${input.returnDate}T${time}`,
      configuration.businessTimeZone,
    )
    return instant &&
      handoverSlotHasCapacity(instant, "RETURN", input.handoverEvents, configuration.handoverPolicy)
      ? [instant]
      : []
  })
  const minimumDurationMs = configuration.minimumRentalMinutes * 60_000
  return pickupInstants.flatMap((pickupAt) =>
    returnInstants.flatMap((returnAt) =>
      returnAt.getTime() - pickupAt.getTime() >= minimumDurationMs
        ? [{ pickupAt, returnAt }]
        : [],
    ),
  )
}

export function hasAvailableSearchWindow(
  windows: SearchHandoverWindow[],
  unavailableRanges: Array<{ start: Date; end: Date }>,
): boolean {
  return windows.some(({ pickupAt, returnAt }) =>
    unavailableRanges.every((range) => pickupAt >= range.end || returnAt <= range.start),
  )
}
