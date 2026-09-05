export const LATE_RETURN_SAFETY_BUFFER_MINUTES = 60
export const DEFAULT_VEHICLE_PREPARATION_BUFFER_MINUTES = 120
export const LATE_RETURN_POLICY_VERSION = "2026-07-27"

const MINUTE_MILLISECONDS = 60_000

export function totalOperationalBufferMinutes(preparationBufferMinutes: number): number {
  return LATE_RETURN_SAFETY_BUFFER_MINUTES + preparationBufferMinutes
}

export function addOperationalBuffer(
  date: Date,
  preparationBufferMinutes = DEFAULT_VEHICLE_PREPARATION_BUFFER_MINUTES,
): Date {
  return new Date(date.getTime() + totalOperationalBufferMinutes(preparationBufferMinutes) * MINUTE_MILLISECONDS)
}

export function subtractOperationalBuffer(
  date: Date,
  preparationBufferMinutes = DEFAULT_VEHICLE_PREPARATION_BUFFER_MINUTES,
): Date {
  return new Date(date.getTime() - totalOperationalBufferMinutes(preparationBufferMinutes) * MINUTE_MILLISECONDS)
}
