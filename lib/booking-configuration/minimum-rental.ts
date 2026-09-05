const MINUTES_PER_DAY = 1_440
const MILLISECONDS_PER_MINUTE = 60_000

export function effectiveMinimumRentalMinutes(
  minimumRentalMinutes: number,
  minimumChargeDays: number,
): number {
  // Older settings saved the charge floor as an identical minimum-duration
  // rule. Preserve genuinely separate duration rules while uncoupling records
  // created by that legacy UI.
  return minimumRentalMinutes === minimumChargeDays * MINUTES_PER_DAY
    ? 1
    : minimumRentalMinutes
}

export function minimumRentalDays(minimumRentalMinutes: number): number {
  return Math.max(1, Math.ceil(minimumRentalMinutes / MINUTES_PER_DAY))
}

export function minimumReturnAt(pickupAt: Date, minimumRentalMinutes: number): Date {
  return new Date(pickupAt.getTime() + minimumRentalMinutes * MILLISECONDS_PER_MINUTE)
}

export function isRentalDurationTooShort(
  pickupAt: Date,
  returnAt: Date,
  minimumRentalMinutes: number,
): boolean {
  return returnAt.getTime() < minimumReturnAt(pickupAt, minimumRentalMinutes).getTime()
}

export function minimumRentalPeriodMessage(locale: string, minimumRentalMinutes: number): string {
  const days = minimumRentalDays(minimumRentalMinutes)
  if (locale === "de") {
    return `Die Mindestmietdauer beträgt ${days} ${days === 1 ? "Tag" : "Tage"}. Wählen Sie eine spätere Rückgabe.`
  }
  return `The minimum rental period is ${days} ${days === 1 ? "day" : "days"}. Choose a later drop-off.`
}
