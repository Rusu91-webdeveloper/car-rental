export const FALLBACK_BUSINESS_TIME_ZONE = "UTC"

export function normalizeBusinessTimeZone(value: string | null | undefined): string {
  if (!value?.trim()) return FALLBACK_BUSINESS_TIME_ZONE
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value }).format(new Date(0))
    return value
  } catch {
    return FALLBACK_BUSINESS_TIME_ZONE
  }
}

export function formatBookingDateTime(
  value: Date | string,
  locale: string,
  businessTimeZone: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    ...options,
    timeZone: normalizeBusinessTimeZone(businessTimeZone),
  }).format(new Date(value))
}
