"use client"

import { useRouter, usePathname } from "@/navigation"
import { useState, useTransition, useEffect, useMemo, useCallback } from "react"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import { getBookingQuote } from "@/app/actions/bookings"
import { beginBookingApplication } from "@/app/actions/booking-applications"
import { getCarAvailability } from "@/app/actions/cars"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatCents } from "@/lib/money"
import { CalendarIcon, MapPin } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import type { BookingCustomerDriverInput, PublicBookingConfiguration } from "@/lib/booking-configuration/types"
import type { BusinessHoursException, HandoverPolicy, WeeklyOpeningHours } from "@/lib/business-configuration/domains"
import { LegalContent } from "@/components/legal/legal-content"
import {
  isRentalDurationTooShort,
  minimumRentalPeriodMessage,
  minimumReturnAt,
} from "@/lib/booking-configuration/minimum-rental"
import {
  totalOperationalBufferMinutes,
} from "@/lib/rental-timing"
import {
  businessLocalDateTimeToInstant,
  handoverSlotHasCapacity,
  handoverTimeOptions,
  hasMinimumPickupLeadTime,
  instantToBusinessDateTimeLocal,
  openingHoursForDate,
  timeOfDayMinutes,
  type HandoverEvent,
  type HandoverKind,
} from "@/lib/business-hours"
import { businessDayOverlapsRanges, businessTodayLocalDate } from "@/lib/business-date"
import { checkoutDateTimeLocal, checkoutTimeParam } from "@/lib/checkout-date-time"
import { BANK_TRANSFER_MINIMUM_LEAD_HOURS } from "@/lib/constants"
import { hasBankTransferLeadTime, requiresAdvanceBankTransfer } from "@/lib/booking-payment-timing"

const formatDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const formatDatetimeLocal = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const alignToNextOpenTime = (
  seed: Date,
  weeklyOpeningHours: WeeklyOpeningHours,
  exceptions: BusinessHoursException[],
  policy: HandoverPolicy,
  kind: HandoverKind,
  businessTimeZone: string,
) => {
  const candidate = new Date(seed)
  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const hours = openingHoursForDate(candidate, weeklyOpeningHours, exceptions)
    const options = handoverTimeOptions(hours, kind, policy.slotIntervalMinutes)
    if (options.length > 0) {
      const currentMinutes = candidate.getHours() * 60 + candidate.getMinutes()
      const selected = options.find((time) => {
        if (dayOffset === 0 && timeOfDayMinutes(time) < currentMinutes) return false
        if (kind !== "PICKUP") return true
        const local = new Date(candidate)
        const [hour, minute] = time.split(":").map(Number)
        local.setHours(hour, minute, 0, 0)
        const instant = businessLocalDateTimeToInstant(formatDatetimeLocal(local), businessTimeZone)
        return Boolean(instant && hasMinimumPickupLeadTime(instant, policy))
      })
      if (selected) {
        const [hour, minute] = selected.split(":").map(Number)
        candidate.setHours(hour, minute, 0, 0)
        return candidate
      }
    }
    candidate.setDate(candidate.getDate() + 1)
    candidate.setHours(0, 0, 0, 0)
  }
  return seed
}

export function CheckoutClient({
  locale,
  car,
  signInUrl,
  bookingConfiguration,
  pickupLocation,
  checkoutOpenedAt,
  initialCustomer,
}: {
  locale: string
  car: {
    id: string
    name: string
    subtitle?: string | null
    image: string
    rating: number
    reviews: number
  }
  signInUrl: string
  paymentDetails: {
    bankName: string
    accountName: string
    accountNumber: string
    swiftCode: string
    iban?: string | null
  }
  bookingConfiguration: PublicBookingConfiguration
  pickupLocation: string | null
  checkoutOpenedAt: string
  initialCustomer: BookingCustomerDriverInput
}) {
  const copy = useCallback((english: string, german: string) => (locale === "de" ? german : english), [locale])
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const parseBookingInstant = (value: string) =>
    businessLocalDateTimeToInstant(value, bookingConfiguration.businessTimeZone)
  const wallDateToBookingInstant = (value: Date) =>
    parseBookingInstant(formatDatetimeLocal(value))

  // Get dates from URL params or use defaults
  const getInitialDates = () => {
    const pickupDateParam = searchParams.get("pickupDate")
    const dropoffDateParam = searchParams.get("dropoffDate")
    const pickupTimeParam = searchParams.get("pickupTime")
    const dropoffTimeParam = searchParams.get("dropoffTime")

    if (pickupDateParam && dropoffDateParam) {
      // Date-only search links still default to 10:00. Once the customer chooses
      // a time, it is kept in the URL so route synchronization cannot reset it.
      const pickup = formatDatetimeLocal(alignToNextOpenTime(new Date(checkoutDateTimeLocal(pickupDateParam, pickupTimeParam)), bookingConfiguration.weeklyOpeningHours, bookingConfiguration.openingHoursExceptions, bookingConfiguration.handoverPolicy, "PICKUP", bookingConfiguration.businessTimeZone))
      const dropoff = formatDatetimeLocal(alignToNextOpenTime(new Date(checkoutDateTimeLocal(dropoffDateParam, dropoffTimeParam)), bookingConfiguration.weeklyOpeningHours, bookingConfiguration.openingHoursExceptions, bookingConfiguration.handoverPolicy, "RETURN", bookingConfiguration.businessTimeZone))
      return { pickup, dropoff }
    }

    // Default dates: tomorrow and 3 days later
    const businessNow = instantToBusinessDateTimeLocal(new Date(), bookingConfiguration.businessTimeZone)
    const tomorrow = new Date(businessNow ?? formatDatetimeLocal(new Date()))
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(10, 0, 0, 0)
    const openPickup = alignToNextOpenTime(tomorrow, bookingConfiguration.weeklyOpeningHours, bookingConfiguration.openingHoursExceptions, bookingConfiguration.handoverPolicy, "PICKUP", bookingConfiguration.businessTimeZone)

    const threeDaysLater = new Date(openPickup)
    threeDaysLater.setDate(threeDaysLater.getDate() + 3)
    const openDropoff = alignToNextOpenTime(threeDaysLater, bookingConfiguration.weeklyOpeningHours, bookingConfiguration.openingHoursExceptions, bookingConfiguration.handoverPolicy, "RETURN", bookingConfiguration.businessTimeZone)

    return {
      pickup: formatDatetimeLocal(openPickup),
      dropoff: formatDatetimeLocal(openDropoff),
    }
  }

  const initialDates = getInitialDates()
  const [pickupDate, setPickupDate] = useState(initialDates.pickup)
  const [dropoffDate, setDropoffDate] = useState(initialDates.dropoff)

  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(true)
  const [unavailableRanges, setUnavailableRanges] = useState<{ start: Date; end: Date }[]>([])
  const [handoverEvents, setHandoverEvents] = useState<HandoverEvent[]>([])
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)

  const isDateInPast = (date: Date) => {
    const today = businessTodayLocalDate(bookingConfiguration.businessTimeZone)
    const dateCopy = new Date(date)
    dateCopy.setHours(0, 0, 0, 0)
    return dateCopy < today
  }

  const hasUnavailableTime = useCallback(
    (date: Date) => businessDayOverlapsRanges(
      date,
      bookingConfiguration.businessTimeZone,
      unavailableRanges,
    ),
    [bookingConfiguration.businessTimeZone, unavailableRanges],
  )
  const isTimeUnavailable = (date: Date) =>
    unavailableRanges.some((range) => date >= range.start && date < range.end)
  const rangeOverlapsUnavailableTime = (start: Date, end: Date) =>
    unavailableRanges.some((range) => start < range.end && end > range.start)

  // Update dates when URL params change.
  /* eslint-disable react-hooks/set-state-in-effect -- URL parameters intentionally synchronize controlled form state. */
  useEffect(() => {
    const pickupDateParam = searchParams.get("pickupDate")
    const dropoffDateParam = searchParams.get("dropoffDate")
    const pickupTimeParam = searchParams.get("pickupTime")
    const dropoffTimeParam = searchParams.get("dropoffTime")
    if (pickupDateParam && dropoffDateParam) {
      setPickupDate(formatDatetimeLocal(alignToNextOpenTime(new Date(checkoutDateTimeLocal(pickupDateParam, pickupTimeParam)), bookingConfiguration.weeklyOpeningHours, bookingConfiguration.openingHoursExceptions, bookingConfiguration.handoverPolicy, "PICKUP", bookingConfiguration.businessTimeZone)))
      setDropoffDate(formatDatetimeLocal(alignToNextOpenTime(new Date(checkoutDateTimeLocal(dropoffDateParam, dropoffTimeParam)), bookingConfiguration.weeklyOpeningHours, bookingConfiguration.openingHoursExceptions, bookingConfiguration.handoverPolicy, "RETURN", bookingConfiguration.businessTimeZone)))
    }
  }, [bookingConfiguration.businessTimeZone, bookingConfiguration.handoverPolicy, bookingConfiguration.openingHoursExceptions, bookingConfiguration.weeklyOpeningHours, searchParams])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    let mounted = true

    const fetchAvailability = async () => {
      try {
        setIsAvailabilityLoading(true)
        const result = await getCarAvailability(car.id)

        if (!mounted) {
          return
        }

        if (result?.error) {
          setAvailabilityError(copy("Unable to load unavailable dates right now.", "Nicht verfügbare Zeiten können derzeit nicht geladen werden."))
          return
        }

        const ranges = (result?.unavailableDates || []).map((range) => ({
          start: new Date(range.start),
          end: new Date(range.end),
        }))
        setUnavailableRanges(ranges)
        setHandoverEvents((result?.handoverEvents ?? []).map((event) => ({ at: new Date(event.at), kind: event.kind })))
        setAvailabilityError(null)
      } catch (err) {
        if (mounted) {
          console.error("Failed to load car availability:", err)
          setAvailabilityError(copy("Unable to load unavailable dates right now.", "Nicht verfügbare Zeiten können derzeit nicht geladen werden."))
        }
      } finally {
        if (mounted) {
          setIsAvailabilityLoading(false)
        }
      }
    }

    fetchAvailability()
    return () => {
      mounted = false
    }
  }, [car.id, copy])

  const [error, setError] = useState<string | null>(null)
  const [pickupCalendarOpen, setPickupCalendarOpen] = useState(false)
  const [dropoffCalendarOpen, setDropoffCalendarOpen] = useState(false)
  const configuredPaymentMethods = bookingConfiguration.payment?.methods ?? [
    { method: "TRANSFER" as const, configuredMode: "BANK_TRANSFER" as const, label: copy("Bank transfer", "Banküberweisung"), description: copy("Full payment by bank transfer before confirmation.", "Gesamtbetrag per Banküberweisung vor der Bestätigung.") },
    { method: "PAY_AT_PICKUP" as const, configuredMode: "CASH_ON_PICKUP" as const, label: copy("Pay at pickup", "Zahlung bei Abholung"), description: copy("Full payment when collecting the vehicle.", "Gesamtbetrag bei der Fahrzeugabholung.") },
  ]
  const methodRequiresAdvanceTransfer = (method: "TRANSFER" | "PAY_AT_PICKUP") =>
    requiresAdvanceBankTransfer({
      paymentMethod: method,
      depositType: bookingConfiguration.payment?.depositEnabled ? "PERCENTAGE_BPS" : "NONE",
    })
  const checkoutOpened = new Date(checkoutOpenedAt)
  const initialPickupInstant = parseBookingInstant(initialDates.pickup)
  const configuredDefaultMethod = bookingConfiguration.payment?.defaultMethod ?? "TRANSFER"
  const methodIsInitiallyEligible = ({ method }: (typeof configuredPaymentMethods)[number]) =>
    !methodRequiresAdvanceTransfer(method) ||
    Boolean(initialPickupInstant && hasBankTransferLeadTime(initialPickupInstant, checkoutOpened))
  const defaultMethodIsInitiallyEligible = configuredPaymentMethods.some(
    (method) => method.method === configuredDefaultMethod && methodIsInitiallyEligible(method),
  )
  const initiallyEligibleMethod = configuredPaymentMethods.find(
    methodIsInitiallyEligible,
  )?.method
  const [paymentMethod, setPaymentMethod] = useState<"TRANSFER" | "PAY_AT_PICKUP">(
    defaultMethodIsInitiallyEligible ? configuredDefaultMethod : initiallyEligibleMethod ?? configuredDefaultMethod,
  )
  const [customer, setCustomer] = useState<BookingCustomerDriverInput>(initialCustomer)
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true"
  const [insuranceSelected, setInsuranceSelected] = useState(
    bookingConfiguration.insurance?.requirementMode === "MANDATORY" ||
      bookingConfiguration.insurance?.preselectedByDefault ||
      false,
  )
  const [legalAcknowledgements, setLegalAcknowledgements] = useState({
    rentalTerms: false,
    privacyNotice: false,
    lateReturnPolicy: false,
  })
  const [isPending, startTransition] = useTransition()
  const [quote, setQuote] = useState<
    | (Awaited<ReturnType<typeof getBookingQuote>> extends {
        quote?: infer Quote
      }
        ? Quote
        : never)
    | null
  >(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [isQuoteLoading, setIsQuoteLoading] = useState(true)
  const configuredMinimumDays = bookingConfiguration.minimumChargeDays
  const minimumDurationMessage = minimumRentalPeriodMessage(locale, bookingConfiguration.minimumRentalMinutes)
  const operationalBufferMinutes = totalOperationalBufferMinutes(bookingConfiguration.preparationBufferMinutes)

  const updateQueryParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => params.set(key, value))
    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    })
  }

  const toFriendlyErrorMessage = useCallback((rawError: string) => {
    let normalizedError = rawError

    if (rawError.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(rawError)
        if (Array.isArray(parsed) && parsed[0]?.message) {
          normalizedError = parsed[0].message
        }
      } catch {
        // keep original message
      }
    }

    const messageMap: Record<string, string> = {
      "Pickup date must be in the future": copy("Please select a pickup date and time in the future.", "Bitte wählen Sie ein Abholdatum und eine Uhrzeit in der Zukunft."),
      "Drop-off date must be after pickup date": copy("Drop-off must be after pickup.", "Die Rückgabe muss nach der Abholung liegen."),
      "Car is not available for the selected dates": copy("Those dates are unavailable. Please choose different dates.", "Diese Daten sind nicht verfügbar. Bitte wählen Sie andere Daten."),
      "Car is no longer available":
        copy("That car is no longer available for the selected period. Please choose different dates.", "Dieses Fahrzeug ist im gewählten Zeitraum nicht mehr verfügbar. Bitte wählen Sie andere Daten."),
      "An advance bank transfer requires at least 48 hours before pick-up. Choose an available payment method or select a later pick-up time.":
        copy("An advance bank transfer requires at least 48 hours before pick-up. Choose an available payment method or select a later pick-up time.", "Für eine Vorauszahlung per Banküberweisung müssen bis zur Abholung mindestens 48 Stunden verbleiben. Wählen Sie eine verfügbare Zahlungsart oder eine spätere Abholzeit."),
      "There is no longer enough time to verify an advance bank transfer before pick-up. Start a new booking with an available payment method or a later pick-up time.":
        copy("There is no longer enough time to verify an advance bank transfer before pick-up. Start a new booking with an available payment method or a later pick-up time.", "Es bleibt nicht mehr genügend Zeit, um eine Vorauszahlung per Banküberweisung vor der Abholung zu prüfen. Starten Sie eine neue Buchung mit einer verfügbaren Zahlungsart oder einer späteren Abholzeit."),
    }

    return messageMap[normalizedError] || normalizedError
  }, [copy])

  const combineDateWithCurrentTime = (datePart: Date, currentDateTimeValue: string, fallbackHour = 10) => {
    const current = new Date(currentDateTimeValue)
    const merged = new Date(datePart)

    if (Number.isNaN(current.getTime())) {
      merged.setHours(fallbackHour, 0, 0, 0)
    } else {
      merged.setHours(current.getHours(), current.getMinutes(), 0, 0)
    }

    return merged
  }

  const pickupDateValue = useMemo(() => {
    const nextPickup = new Date(pickupDate)
    return Number.isNaN(nextPickup.getTime()) ? undefined : nextPickup
  }, [pickupDate])

  const dropoffDateValue = useMemo(() => {
    const nextDropoff = new Date(dropoffDate)
    return Number.isNaN(nextDropoff.getTime()) ? undefined : nextDropoff
  }, [dropoffDate])

  const handoverOptionsForDate = (date: Date, kind: HandoverKind) =>
    handoverTimeOptions(
      openingHoursForDate(date, bookingConfiguration.weeklyOpeningHours, bookingConfiguration.openingHoursExceptions),
      kind,
      bookingConfiguration.handoverPolicy.slotIntervalMinutes,
    )

  const isBusinessClosedDate = (date: Date, kind: HandoverKind) =>
    handoverOptionsForDate(date, kind).length === 0

  const isWithinConfiguredHandoverHours = (date: Date, kind: HandoverKind) =>
    handoverOptionsForDate(date, kind).includes(
      `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
    )

  const availablePickupTimes = (() => {
    if (!pickupDateValue) return []
    return handoverOptionsForDate(pickupDateValue, "PICKUP").filter((time) => {
      const candidate = new Date(pickupDateValue)
      const [hour, minute] = time.split(":").map(Number)
      candidate.setHours(hour, minute, 0, 0)
      const instant = wallDateToBookingInstant(candidate)
      return Boolean(instant &&
        hasMinimumPickupLeadTime(instant, bookingConfiguration.handoverPolicy) &&
        !isTimeUnavailable(instant) &&
        handoverSlotHasCapacity(instant, "PICKUP", handoverEvents, bookingConfiguration.handoverPolicy))
    })
  })()

  const availableDropoffTimes = (() => {
    if (!pickupDateValue || !dropoffDateValue) return []
    return handoverOptionsForDate(dropoffDateValue, "RETURN").filter((time) => {
      const candidate = new Date(dropoffDateValue)
      const [hour, minute] = time.split(":").map(Number)
      candidate.setHours(hour, minute, 0, 0)
      const pickupInstant = wallDateToBookingInstant(pickupDateValue)
      const candidateInstant = wallDateToBookingInstant(candidate)
      return Boolean(pickupInstant && candidateInstant && candidateInstant > pickupInstant &&
        !isRentalDurationTooShort(pickupInstant, candidateInstant, bookingConfiguration.minimumRentalMinutes) &&
        !rangeOverlapsUnavailableTime(pickupInstant, candidateInstant) &&
        handoverSlotHasCapacity(candidateInstant, "RETURN", handoverEvents, bookingConfiguration.handoverPolicy))
    })
  })()

  const formatDateLabel = (value: Date | undefined, fallback: string) => {
    if (!value) {
      return fallback
    }

    return value.toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  const formatTimeValue = (value: Date | undefined, fallback = "10:00") => {
    if (!value) {
      return fallback
    }

    const hours = String(value.getHours()).padStart(2, "0")
    const minutes = String(value.getMinutes()).padStart(2, "0")
    return `${hours}:${minutes}`
  }
  const selectedPickupTime = formatTimeValue(pickupDateValue)
  const selectedDropoffTime = formatTimeValue(dropoffDateValue)

  const applyTimeToDateTime = (dateTimeValue: string, timeValue: string) => {
    const [hoursRaw, minutesRaw] = timeValue.split(":")
    const hours = Number(hoursRaw)
    const minutes = Number(minutesRaw)

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null
    }

    const baseDate = new Date(dateTimeValue)
    if (Number.isNaN(baseDate.getTime())) {
      return null
    }

    baseDate.setHours(hours, minutes, 0, 0)
    return formatDatetimeLocal(baseDate)
  }

  const isDropoffDateDisabled = (date: Date) => {
    if (isDateInPast(date) || isBusinessClosedDate(date, "RETURN")) {
      return true
    }

    if (!pickupDateValue) {
      return true
    }

    const pickupInstant = wallDateToBookingInstant(pickupDateValue)
    if (!pickupInstant) return true
    const earliestDropoffInstant = minimumReturnAt(pickupInstant, bookingConfiguration.minimumRentalMinutes)
    const earliestDropoffLocal = instantToBusinessDateTimeLocal(
      earliestDropoffInstant,
      bookingConfiguration.businessTimeZone,
    )
    if (!earliestDropoffLocal) return true
    const earliestDropoffDay = new Date(earliestDropoffLocal)
    earliestDropoffDay.setHours(0, 0, 0, 0)

    const selectedDay = new Date(date)
    selectedDay.setHours(0, 0, 0, 0)
    return selectedDay < earliestDropoffDay
  }

  const findNextValidDropoff = (pickup: Date, seedDropoff?: Date) => {
    const base = seedDropoff && !Number.isNaN(seedDropoff.getTime()) ? new Date(seedDropoff) : new Date(pickup)
    const candidate = new Date(base)
    const pickupInstant = wallDateToBookingInstant(pickup)
    if (!pickupInstant) return null
    const earliestDropoff = minimumReturnAt(pickupInstant, bookingConfiguration.minimumRentalMinutes)

    const earliestDropoffLocal = instantToBusinessDateTimeLocal(
      earliestDropoff,
      bookingConfiguration.businessTimeZone,
    )
    if (earliestDropoffLocal && candidate < new Date(earliestDropoffLocal)) {
      candidate.setTime(new Date(earliestDropoffLocal).getTime())
    }

    for (let i = 0; i < 370; i += 1) {
      const options = handoverOptionsForDate(candidate, "RETURN")
      for (const time of options) {
        const option = new Date(candidate)
        const [hour, minute] = time.split(":").map(Number)
        option.setHours(hour, minute, 0, 0)
        const optionInstant = wallDateToBookingInstant(option)
        if (optionInstant && optionInstant >= earliestDropoff &&
          !rangeOverlapsUnavailableTime(pickupInstant, optionInstant) &&
          handoverSlotHasCapacity(optionInstant, "RETURN", handoverEvents, bookingConfiguration.handoverPolicy)) {
          return option
        }
      }
      candidate.setDate(candidate.getDate() + 1)
      candidate.setHours(0, 0, 0, 0)
    }

    return null
  }

  const handlePickupChange = (value: string) => {
    const nextPickup = new Date(value)
    const nextPickupInstant = parseBookingInstant(value)
    if (Number.isNaN(nextPickup.getTime()) || !nextPickupInstant) {
      return false
    }

    if (isTimeUnavailable(nextPickupInstant)) {
      setError(copy("This pickup time is booked or reserved for vehicle preparation. Please choose another time.", "Diese Abholzeit ist belegt oder für die Fahrzeugvorbereitung reserviert. Bitte wählen Sie eine andere Zeit."))
      return false
    }

    if (!isWithinConfiguredHandoverHours(nextPickup, "PICKUP")) {
      setError(copy("Pick-up must be during the rental company's opening hours.", "Die Abholung muss während der Öffnungszeiten des Vermieters erfolgen."))
      return false
    }

    if (nextPickupInstant <= new Date()) {
      setError(copy("Please select a pickup date and time in the future.", "Bitte wählen Sie ein Abholdatum und eine Uhrzeit in der Zukunft."))
      return false
    }

    if (methodRequiresAdvanceTransfer(paymentMethod) && !hasBankTransferLeadTime(nextPickupInstant)) {
      const alternative = configuredPaymentMethods.find(
        ({ method }) => !methodRequiresAdvanceTransfer(method),
      )
      if (alternative) setPaymentMethod(alternative.method)
    }

    const currentDropoff = new Date(dropoffDate)
    const nextDropoff = findNextValidDropoff(nextPickup, currentDropoff)
    if (!nextDropoff) {
      setError(copy("No available drop-off dates were found after this pick-up date.", "Nach diesem Abholdatum wurden keine verfügbaren Rückgabetermine gefunden."))
      return false
    }

    setPickupDate(value)
    setDropoffDate(formatDatetimeLocal(nextDropoff))
    setError(null)
    updateQueryParams({
      pickupDate: value.split("T")[0] || formatDateKey(nextPickup),
      pickupTime: checkoutTimeParam(nextPickup),
      dropoffDate: formatDateKey(nextDropoff),
      dropoffTime: checkoutTimeParam(nextDropoff),
    })
    return true
  }

  const handleDropoffChange = (value: string) => {
    const parsedDropoff = new Date(value)
    const parsedDropoffInstant = parseBookingInstant(value)
    if (Number.isNaN(parsedDropoff.getTime()) || !parsedDropoffInstant) {
      return false
    }

    if (!isWithinConfiguredHandoverHours(parsedDropoff, "RETURN")) {
      setError(copy("Return must be during the rental company's opening hours.", "Die Rückgabe muss während der Öffnungszeiten des Vermieters erfolgen."))
      return false
    }

    const currentPickup = new Date(pickupDate)
    if (!Number.isNaN(currentPickup.getTime())) {
      const nextDropoff = new Date(parsedDropoff)
      const currentPickupInstant = parseBookingInstant(pickupDate)
      if (!currentPickupInstant) {
        setError(copy("Please select a valid pick-up time.", "Bitte wählen Sie eine gültige Abholzeit."))
        return false
      }

      if (
        parsedDropoffInstant <= currentPickupInstant ||
        isRentalDurationTooShort(currentPickupInstant, parsedDropoffInstant, bookingConfiguration.minimumRentalMinutes)
      ) {
        setError(minimumDurationMessage)
        return false
      }

      if (rangeOverlapsUnavailableTime(currentPickupInstant, parsedDropoffInstant)) {
        setError(copy("The selected times overlap a booking, block, or vehicle preparation period.", "Die gewählten Zeiten überschneiden sich mit einer Buchung, Sperre oder Fahrzeugvorbereitung."))
        return false
      }

      setDropoffDate(formatDatetimeLocal(nextDropoff))
      setError(null)
      updateQueryParams({
        pickupDate: formatDateKey(currentPickup),
        pickupTime: checkoutTimeParam(currentPickup),
        dropoffDate: formatDateKey(nextDropoff),
        dropoffTime: checkoutTimeParam(nextDropoff),
      })
      return true
    }

    setDropoffDate(value)
    setError(null)
    updateQueryParams({
      dropoffDate: value.split("T")[0] || formatDateKey(parsedDropoff),
      dropoffTime: checkoutTimeParam(parsedDropoff),
    })
    return true
  }

  const handlePickupDateSelect = (date: Date | undefined) => {
    if (!date) {
      return
    }

    let nextPickup = combineDateWithCurrentTime(date, pickupDate, 10)
    if (!isWithinConfiguredHandoverHours(nextPickup, "PICKUP")) {
      nextPickup = alignToNextOpenTime(date, bookingConfiguration.weeklyOpeningHours, bookingConfiguration.openingHoursExceptions, bookingConfiguration.handoverPolicy, "PICKUP", bookingConfiguration.businessTimeZone)
    }
    const updated = handlePickupChange(formatDatetimeLocal(nextPickup))
    if (updated) {
      setPickupCalendarOpen(false)
    }
  }

  const handleDropoffDateSelect = (date: Date | undefined) => {
    if (!date) {
      return
    }

    let nextDropoff = combineDateWithCurrentTime(date, dropoffDate, 10)
    if (!isWithinConfiguredHandoverHours(nextDropoff, "RETURN")) {
      nextDropoff = alignToNextOpenTime(date, bookingConfiguration.weeklyOpeningHours, bookingConfiguration.openingHoursExceptions, bookingConfiguration.handoverPolicy, "RETURN", bookingConfiguration.businessTimeZone)
    }
    const updated = handleDropoffChange(formatDatetimeLocal(nextDropoff))
    if (updated) {
      setDropoffCalendarOpen(false)
    }
  }

  const handlePickupTimeChange = (timeValue: string) => {
    const nextValue = applyTimeToDateTime(pickupDate, timeValue)
    if (!nextValue) {
      return
    }
    handlePickupChange(nextValue)
  }

  const handleDropoffTimeChange = (timeValue: string) => {
    const nextValue = applyTimeToDateTime(dropoffDate, timeValue)
    if (!nextValue) {
      return
    }
    handleDropoffChange(nextValue)
  }

  /* eslint-disable react-hooks/set-state-in-effect -- quote state intentionally resets when authoritative inputs change. */
  useEffect(() => {
    const pickup = businessLocalDateTimeToInstant(pickupDate, bookingConfiguration.businessTimeZone)
    const dropoff = businessLocalDateTimeToInstant(dropoffDate, bookingConfiguration.businessTimeZone)
    if (!pickup || !dropoff || dropoff <= pickup) {
      setQuote(null)
      setQuoteError(null)
      setIsQuoteLoading(false)
      return
    }

    if (isRentalDurationTooShort(pickup, dropoff, bookingConfiguration.minimumRentalMinutes)) {
      setQuote(null)
      setQuoteError(minimumDurationMessage)
      setIsQuoteLoading(false)
      return
    }

    let current = true
    setQuote(null)
    setQuoteError(null)
    setIsQuoteLoading(true)
    void getBookingQuote({
      carId: car.id,
      pickupDate: pickup.toISOString(),
      dropoffDate: dropoff.toISOString(),
      paymentMethod,
      insuranceSelected,
    }).then((result) => {
      if (!current) return
      if (result.error || !result.quote) {
        setQuoteError(result.error ? toFriendlyErrorMessage(result.error) : copy("A valid quote could not be calculated.", "Es konnte kein gültiger Preis berechnet werden."))
      } else {
        setQuote(result.quote)
      }
      setIsQuoteLoading(false)
    })
    return () => {
      current = false
    }
  }, [
    bookingConfiguration.minimumRentalMinutes,
    bookingConfiguration.businessTimeZone,
    car.id,
    dropoffDate,
    insuranceSelected,
    minimumDurationMessage,
    paymentMethod,
    pickupDate,
    copy,
    toFriendlyErrorMessage,
  ])
  /* eslint-enable react-hooks/set-state-in-effect */

  const days = quote?.chargeableDays ?? 0
  const subtotalCents = quote?.baseSubtotal ?? 0
  const taxCents = quote?.taxSubtotal ?? 0
  const totalCents = quote?.grandTotal ?? 0
  const depositPercent = Math.round((quote?.depositRateBps ?? 0) / 100)
  const guaranteePercent = Math.round((quote?.guaranteeRateBps ?? 0) / 100)
  const depositCents = quote?.depositAmount ?? 0
  const advanceCents = depositCents > 0 ? depositCents : paymentMethod === "TRANSFER" ? totalCents : 0
  const guaranteeCents = quote?.guaranteeAmount ?? 0
  const quoteCurrency = quote?.currency ?? "EUR"
  const bookingSetupUnavailable = bookingConfiguration.mode !== "ACTIVE_RELEASE"

  const handleConfirmBooking = () => {
    setError(null)

    const pickupWallTime = new Date(pickupDate)
    const dropoffWallTime = new Date(dropoffDate)
    const pickup = parseBookingInstant(pickupDate)
    const dropoff = parseBookingInstant(dropoffDate)

    if (!pickup || !dropoff || Number.isNaN(pickupWallTime.getTime()) || Number.isNaN(dropoffWallTime.getTime())) {
      setError(copy("Please select valid pickup and drop-off dates.", "Bitte wählen Sie gültige Abhol- und Rückgabedaten."))
      return
    }

    if (pickup <= new Date()) {
      setError(copy("Please select a pickup date and time in the future.", "Bitte wählen Sie ein Abholdatum und eine Uhrzeit in der Zukunft."))
      return
    }

    if (dropoff <= pickup) {
      setError(copy("Drop-off must be after pickup.", "Die Rückgabe muss nach der Abholung liegen."))
      return
    }

    if (methodRequiresAdvanceTransfer(paymentMethod) && !hasBankTransferLeadTime(pickup)) {
      setError(copy(
        `An advance bank transfer requires at least ${BANK_TRANSFER_MINIMUM_LEAD_HOURS} hours before pick-up. Choose an available payment method or select a later pick-up time.`,
        `Für eine Vorauszahlung per Banküberweisung müssen bis zur Abholung mindestens ${BANK_TRANSFER_MINIMUM_LEAD_HOURS} Stunden verbleiben. Wählen Sie eine verfügbare Zahlungsart oder eine spätere Abholzeit.`,
      ))
      return
    }

    if (isRentalDurationTooShort(pickup, dropoff, bookingConfiguration.minimumRentalMinutes)) {
      setError(minimumDurationMessage)
      return
    }

    if (rangeOverlapsUnavailableTime(pickup, dropoff)) {
      setError(copy("Your selected times overlap a booking, block, or vehicle preparation period.", "Ihre gewählten Zeiten überschneiden sich mit einer Buchung, Sperre oder Fahrzeugvorbereitung."))
      return
    }
    if (!availablePickupTimes.includes(selectedPickupTime) || !availableDropoffTimes.includes(selectedDropoffTime)) {
      setError(copy("Please select an available pick-up and return time.", "Bitte wählen Sie eine verfügbare Abhol- und Rückgabezeit."))
      return
    }
    if (!isWithinConfiguredHandoverHours(pickupWallTime, "PICKUP") || !isWithinConfiguredHandoverHours(dropoffWallTime, "RETURN")) {
      setError(copy("Pick-up and return must be during the rental company's opening hours.", "Abholung und Rückgabe müssen während der Öffnungszeiten des Vermieters erfolgen."))
      return
    }
    if (!pickupLocation) {
      setError(copy("The rental company pickup address is not configured. Please contact support.", "Die Abholadresse des Vermieters ist nicht eingerichtet. Bitte kontaktieren Sie den Support."))
      return
    }
    const missingLegalAcknowledgement = bookingConfiguration.legal?.documents.find(
      (document) =>
        document.requirement === "REQUIRED" &&
        (document.type === "RENTAL_TERMS"
          ? !legalAcknowledgements.rentalTerms
          : !legalAcknowledgements.privacyNotice),
    )
    if (missingLegalAcknowledgement) {
      setError(copy(`Please acknowledge ${missingLegalAcknowledgement.title} before booking.`, `Bitte bestätigen Sie vor der Buchung: ${missingLegalAcknowledgement.title}.`))
      return
    }
    if (!legalAcknowledgements.lateReturnPolicy) {
      setError(locale === "de" ? "Bitte bestätigen Sie die Rückgabe- und Verspätungsregeln." : "Please acknowledge the return-time and late-use rules.")
      return
    }

    startTransition(async () => {
      // Convert datetime-local format to ISO 8601
      const pickupISO = pickup.toISOString()
      const dropoffISO = dropoff.toISOString()

      const storageKey = `booking-application:${car.id}:${pickupISO}:${dropoffISO}`
      let idempotencyKey = window.localStorage.getItem(storageKey)
      if (!idempotencyKey) {
        idempotencyKey = crypto.randomUUID()
        window.localStorage.setItem(storageKey, idempotencyKey)
      }
      const result = await beginBookingApplication({
        carId: car.id,
        pickupAt: pickupISO,
        returnAt: dropoffISO,
        paymentMethod,
        locale: locale === "de" ? "de" : "en",
        insuranceSelected,
        customer,
        legalAcknowledgements,
        idempotencyKey,
      })

      if ("error" in result) {
        if (result.error === "Unauthorized") {
          const returnUrl = `${window.location.pathname}${window.location.search}`
          router.push(`${signInUrl}?redirect_url=${encodeURIComponent(returnUrl)}`)
          return
        }
        setError(toFriendlyErrorMessage(result.error))
        return
      }

      router.push(`/applications/${result.applicationId}`)
    })
  }

  return (
      <div className="qujo-page pb-24">
        {/* Header */}
        <header className="bg-background px-4 py-4 border-b border-border sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="p-2 -ml-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold">{copy("Checkout", "Buchung")}</h1>
          </div>
        </header>

        <div className="mx-auto max-w-3xl space-y-4 p-4 sm:py-8">
          {/* Car Summary */}
          <div className="bg-background rounded-xl p-4 border border-border">
            <div className="flex gap-4">
              <Image
                src={car.image || "/placeholder.svg"}
                alt={car.name}
                width={96}
                height={96}
                className="h-24 w-24 rounded-lg object-cover"
              />
              <div className="flex-1">
                <h3 className="font-bold text-lg mb-1">{car.name}</h3>
                <p className="text-sm text-muted-foreground mb-2">{car.subtitle}</p>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-warning" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                  <span className="text-sm font-semibold">{car.rating}</span>
                  <span className="text-sm text-muted-foreground">({car.reviews})</span>
                </div>
              </div>
            </div>
          </div>

          {/* Booking Details */}
          <div className="bg-background rounded-xl p-4 border border-border space-y-4">
            <h3 className="font-semibold text-lg">{copy("Booking details", "Buchungsdetails")}</h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{copy("Pick-up date", "Abholdatum")}</Label>
                <Popover open={pickupCalendarOpen} onOpenChange={setPickupCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-between font-normal">
                      <span>{formatDateLabel(pickupDateValue, copy("Select pick-up date", "Abholdatum auswählen"))}</span>
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={pickupDateValue}
                      onSelect={handlePickupDateSelect}
                      disabled={(date) => isDateInPast(date) || isBusinessClosedDate(date, "PICKUP")}
                      modifiers={{
                        unavailable: (date) => hasUnavailableTime(date),
                      }}
                      modifiersClassNames={{
                        unavailable:
                          "!bg-red-100 !text-red-700 !opacity-100 hover:!bg-red-100 dark:!bg-red-900/30 dark:!text-red-300",
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pickup-time">{copy("Pick-up time", "Abholzeit")}</Label>
                <select
                  id="pickup-time"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={availablePickupTimes.includes(selectedPickupTime) ? selectedPickupTime : ""}
                  onChange={(e) => handlePickupTimeChange(e.target.value)}
                  disabled={availablePickupTimes.length === 0}
                >
                  <option value="" disabled>{availablePickupTimes.length === 0 ? copy("No available times", "Keine Zeiten verfügbar") : copy("Select an available time", "Verfügbare Zeit auswählen")}</option>
                  {availablePickupTimes.map((time) => <option key={time} value={time}>{time}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{copy("Drop-off date", "Rückgabedatum")}</Label>
                <Popover open={dropoffCalendarOpen} onOpenChange={setDropoffCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-between font-normal">
                      <span>{formatDateLabel(dropoffDateValue, copy("Select drop-off date", "Rückgabedatum auswählen"))}</span>
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dropoffDateValue}
                      onSelect={handleDropoffDateSelect}
                      disabled={isDropoffDateDisabled}
                      modifiers={{
                        unavailable: (date) => hasUnavailableTime(date),
                      }}
                      modifiersClassNames={{
                        unavailable:
                          "!bg-red-100 !text-red-700 !opacity-100 hover:!bg-red-100 dark:!bg-red-900/30 dark:!text-red-300",
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dropoff-time">{copy("Drop-off time", "Rückgabezeit")}</Label>
                <select
                  id="dropoff-time"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={availableDropoffTimes.includes(selectedDropoffTime) ? selectedDropoffTime : ""}
                  onChange={(e) => handleDropoffTimeChange(e.target.value)}
                  disabled={availableDropoffTimes.length === 0}
                >
                  <option value="" disabled>{availableDropoffTimes.length === 0 ? copy("No available times", "Keine Zeiten verfügbar") : copy("Select an available time", "Verfügbare Zeit auswählen")}</option>
                  {availableDropoffTimes.map((time) => <option key={time} value={time}>{time}</option>)}
                </select>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {isAvailabilityLoading
                ? copy("Loading unavailable dates…", "Nicht verfügbare Zeiten werden geladen…")
                : locale === "de"
                  ? `Rote Tage enthalten belegte Zeiten. Freie Uhrzeiten am selben Tag können gewählt werden. Nach jeder Rückgabe sind insgesamt ${operationalBufferMinutes} Minuten gesperrt: 60 Minuten Verspätungspuffer und ${bookingConfiguration.preparationBufferMinutes} Minuten Vorbereitung.`
                  : `Red days contain unavailable times. Free times on the same day remain selectable. Every return is followed by a ${operationalBufferMinutes}-minute block: 60 minutes for possible lateness and ${bookingConfiguration.preparationBufferMinutes} minutes for preparation.`}
            </p>
            <p className="text-xs text-muted-foreground">
              {locale === "de"
                ? `Abhol- und Rückgabezeiten berücksichtigen Öffnungszeiten, Sondertage, Vorlaufzeit und verfügbare Übergabekapazität in ${bookingConfiguration.businessTimeZone}.`
                : `Pick-up and return choices account for opening windows, special dates, minimum notice and remaining handover capacity in ${bookingConfiguration.businessTimeZone}.`}
            </p>
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground" role="status">
              <span className="font-medium">
                {locale === "de" ? "Mindestberechnung" : "Minimum charge"}: {configuredMinimumDays}{" "}
                {locale === "de"
                  ? configuredMinimumDays === 1
                    ? "Tag"
                    : "Tage"
                  : configuredMinimumDays === 1
                    ? "day"
                    : "days"}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {locale === "de"
                  ? "Eine frühere Rückgabe ist möglich; berechnet werden trotzdem mindestens die oben genannten Tage."
                  : "Earlier returns are allowed; the minimum number of days shown above is still charged."}
              </span>
            </div>
            {availabilityError && <p className="text-xs text-red-600">{availabilityError}</p>}

            <div className="space-y-2">
              <Label id="owner-pickup-location-label">{copy("Pick-up and return location", "Abhol- und Rückgabeort")}</Label>
              <div
                className={`flex gap-3 rounded-lg border px-3 py-3 ${pickupLocation ? "border-primary/20 bg-primary/5" : "border-red-200 bg-red-50"}`}
                aria-labelledby="owner-pickup-location-label"
              >
                <MapPin className={`mt-0.5 h-5 w-5 shrink-0 ${pickupLocation ? "text-primary" : "text-red-600"}`} aria-hidden="true" />
                <div>
                  <p className={`text-sm font-medium ${pickupLocation ? "text-foreground" : "text-red-700"}`}>
                    {pickupLocation ?? copy("Pickup address unavailable", "Abholadresse nicht verfügbar")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {locale === "de"
                      ? "Abholung und Rückgabe erfolgen am Standort des Vermieters. Diese Adresse wird vom Vermieter festgelegt."
                      : "The car must be picked up and returned at the rental company’s location. This address is set by the owner."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {bookingConfiguration.mode === "ACTIVE_RELEASE" && bookingConfiguration.fields.length > 0 ? (
            <div className="bg-background rounded-xl p-4 border border-border space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-lg">{copy("Customer and driver information", "Kunden- und Fahrerdaten")}</h3>
                  {isDemoMode ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {locale === "de"
                        ? "Testdaten bleiben deutlich als fiktiv markiert. Für den E-Mail-Test wird Ihre angemeldete E-Mail-Adresse beibehalten."
                        : "Test data stays clearly marked as fictional. Your signed-in email is preserved for delivery testing."}
                    </p>
                  ) : null}
                </div>
                {isDemoMode ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCustomer((current) => ({
                        ...current,
                        firstName: current.firstName || "Test",
                        lastName: current.lastName || "Customer",
                        phone: "+49 30 11111111",
                        country: "DE",
                        address: "Testkunde Straße 2 (TESTDATEN)",
                        city: "Musterstadt",
                        postalCode: "10115",
                        nationality: "DE",
                        dateOfBirth: "1990-01-01",
                        licenceNumber: "TEST-LICENCE-0001",
                        licenceIssueDate: "2015-01-01",
                        licenceExpiryDate: "2030-01-01",
                        licenceIssuingCountry: "DE",
                      }))
                    }
                  >
                    {locale === "de" ? "Fiktive Testdaten einfügen" : "Fill fictional test data"}
                  </Button>
                ) : null}
              </div>
              {(["CUSTOMER", "DRIVER"] as const).map((section) => {
                const fields = bookingConfiguration.fields.filter((field) => field.visible && field.section === section)
                if (!fields.length) return null
                return (
                  <div key={section} className="space-y-3">
                    <h4 className="font-medium">
                      {section === "CUSTOMER" ? copy("Customer information", "Kundendaten") : copy("Driver information", "Fahrerdaten")}
                    </h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {fields.map((field) => {
                        const key = (
                          {
                            FIRST_NAME: "firstName",
                            LAST_NAME: "lastName",
                            EMAIL: "email",
                            PHONE: "phone",
                            DATE_OF_BIRTH: "dateOfBirth",
                            COUNTRY: "country",
                            ADDRESS: "address",
                            CITY: "city",
                            POSTAL_CODE: "postalCode",
                            NATIONALITY: "nationality",
                            LICENCE_NUMBER: "licenceNumber",
                            LICENCE_ISSUE_DATE: "licenceIssueDate",
                            LICENCE_EXPIRY_DATE: "licenceExpiryDate",
                            LICENCE_ISSUING_COUNTRY: "licenceIssuingCountry",
                          } as const
                        )[field.key]
                        return (
                          <label key={field.key} className="space-y-1 text-sm">
                            <span className="font-medium">
                              {field.label}
                              {field.required ? " *" : ""}
                            </span>
                            <Input
                              type={
                                field.validation.kind === "date"
                                  ? "date"
                                  : field.validation.kind === "email"
                                    ? "email"
                                    : "text"
                              }
                              value={customer[key] ?? ""}
                              onChange={(event) =>
                                setCustomer((current) => ({
                                  ...current,
                                  [key]: event.target.value,
                                }))
                              }
                              required={field.required}
                              autoComplete="off"
                            />
                            <span className="block text-xs text-muted-foreground">
                              {field.reason ?? field.helpText}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

          {bookingConfiguration.insurance?.enabled && bookingConfiguration.insurance.availableForVehicle ? (
            <div className="bg-background rounded-xl p-4 border border-border space-y-3">
              <h3 className="font-semibold text-lg">{copy("Insurance", "Versicherung")}</h3>
              <label className="flex items-start gap-3 rounded-lg border p-4">
                <Checkbox
                  checked={insuranceSelected}
                  onCheckedChange={(value) => setInsuranceSelected(value === true)}
                  disabled={
                    bookingConfiguration.insurance.requirementMode === "MANDATORY" ||
                    !bookingConfiguration.insurance.showCustomerSelection
                  }
                />
                <span>
                  <span className="font-medium">
                    {bookingConfiguration.insurance.customerFacingName}
                    {bookingConfiguration.insurance.requirementMode === "MANDATORY" ? copy(" — required", " — erforderlich") : ""}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {bookingConfiguration.insurance.description}
                  </span>
                  <span className="mt-2 block text-sm">
                    {formatCents(bookingConfiguration.insurance.pricePerDay, bookingConfiguration.insurance.currency)}{" "}
                    {copy("per billable rental day", "pro berechnetem Miettag")}
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          {bookingConfiguration.legal ? (
            <div className="bg-background rounded-xl p-4 border border-border space-y-4">
              <div>
                <h3 className="font-semibold text-lg">{copy("Terms and privacy", "Mietbedingungen und Datenschutz")}</h3>
                <p className="text-sm text-muted-foreground">
                  {copy("Review the exact published versions that apply to this booking. Required acknowledgements start unchecked.", "Prüfen Sie die veröffentlichten Fassungen, die für diese Buchung gelten. Erforderliche Bestätigungen sind zunächst nicht ausgewählt.")}
                </p>
              </div>
              <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
                <div>
                  <h4 className="font-semibold">
                    {locale === "de" ? "Rückgabezeit und Gebühren bei verspäteter Rückgabe" : "Return time and late-return charges"}
                  </h4>
                  <p className="mt-2 text-sm">
                    {locale === "de"
                      ? `Das Fahrzeug muss zu dem in Ihrer Buchung vereinbarten Zeitpunkt zurückgegeben werden. Erfolgt die Rückgabe mehr als ${bookingConfiguration.gracePeriodMinutes} Minuten verspätet, wird ein zusätzlicher Miettag berechnet. Diese Berechnung verlängert Ihre Buchung nicht und berechtigt Sie nicht, das Fahrzeug für den restlichen Tag zu behalten. Eine Verlängerung muss vor der vereinbarten Rückgabezeit beim Vermieter angefragt und von diesem genehmigt werden.`
                      : `The vehicle must be returned at the time stated in your booking. If it is returned more than ${bookingConfiguration.gracePeriodMinutes} minutes late, you will be charged for an additional rental day. This charge does not extend your booking or allow you to keep the vehicle for the rest of that day. Any extension must be requested and approved by the rental company before the agreed return time.`}
                  </p>
                </div>
                <label className="flex items-start gap-3">
                  <Checkbox
                    checked={legalAcknowledgements.lateReturnPolicy}
                    onCheckedChange={(value) =>
                      setLegalAcknowledgements((current) => ({ ...current, lateReturnPolicy: value === true }))
                    }
                  />
                  <span className="text-sm font-medium">
                    {locale === "de"
                      ? `Ich verstehe, dass bei einer Verspätung von mehr als ${bookingConfiguration.gracePeriodMinutes} Minuten ein zusätzlicher Miettag berechnet wird und dass sich dadurch meine vereinbarte Rückgabezeit nicht verlängert.`
                      : `I understand that returning the vehicle more than ${bookingConfiguration.gracePeriodMinutes} minutes late will result in an additional-day charge and does not extend my agreed return time.`}
                  </span>
                </label>
              </section>
              {bookingConfiguration.legal.documents.map((document) => {
                const key = document.type === "RENTAL_TERMS" ? "rentalTerms" : "privacyNotice"
                const exactVersionUrl = `/${locale}/legal/${document.legalDocumentTranslationId}`
                return (
                  <section key={document.type} className="space-y-3 rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h4 className="font-medium">{document.title}</h4>
                        <p className="text-xs text-muted-foreground">
                          {copy("Version", "Version")} {document.versionLabel || document.versionNumber} · {document.locale}
                        </p>
                      </div>
                      <a className="text-sm font-medium text-primary underline" href={exactVersionUrl} target="_blank" rel="noreferrer">
                        {document.linkLabel}
                      </a>
                    </div>
                    {document.presentation === "INLINE" ? (
                      <div className="max-h-64 overflow-y-auto rounded border bg-muted/30 p-3">
                        <LegalContent content={document.canonicalContent} />
                      </div>
                    ) : null}
                    {document.requirement === "REQUIRED" ? (
                      <label className="flex items-start gap-3">
                        <Checkbox
                          checked={legalAcknowledgements[key]}
                          onCheckedChange={(value) =>
                            setLegalAcknowledgements((current) => ({ ...current, [key]: value === true }))
                          }
                        />
                        <span className="text-sm">{document.checkboxLabel}</span>
                      </label>
                    ) : (
                      <p className="text-sm text-muted-foreground">{copy("Displayed for your information; no acceptance is recorded.", "Nur zu Ihrer Information angezeigt; es wird keine Zustimmung erfasst.")}</p>
                    )}
                  </section>
                )
              })}
            </div>
          ) : null}

          {/* Payment Method */}
          <div className="bg-background rounded-xl p-4 border border-border space-y-3">
            <h3 className="font-semibold text-lg">{locale === "de" ? "Zahlungsmethode" : "Payment method"}</h3>
            <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              {copy(
                `Advance bank payments are available only when pick-up is at least ${BANK_TRANSFER_MINIMUM_LEAD_HOURS} hours away. After approval, you will have up to 24 hours to pay; the exact deadline will be shown in your email and My Trips.`,
                `Vorauszahlungen per Banküberweisung sind nur möglich, wenn die Abholung mindestens ${BANK_TRANSFER_MINIMUM_LEAD_HOURS} Stunden entfernt ist. Nach der Freigabe haben Sie bis zu 24 Stunden Zeit; die genaue Frist steht in Ihrer E-Mail und unter „Meine Fahrten“.`,
              )}
            </p>
            {configuredPaymentMethods.map((method) => {
              const pickupInstant = parseBookingInstant(pickupDate)
              const unavailable = methodRequiresAdvanceTransfer(method.method) &&
                (!pickupInstant || !hasBankTransferLeadTime(pickupInstant, checkoutOpened))
              return (
              <button
                key={method.method}
                type="button"
                disabled={unavailable}
                onClick={() => setPaymentMethod(method.method)}
                className={`w-full text-left rounded-lg border p-3 transition ${
                  paymentMethod === method.method
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:bg-muted/50"
                } ${unavailable ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{method.label}</p>
                    <p className="text-sm text-muted-foreground">{method.description}</p>
                    {unavailable ? (
                      <p className="mt-2 text-sm font-medium text-amber-700">
                        {copy(
                          `Unavailable: less than ${BANK_TRANSFER_MINIMUM_LEAD_HOURS} hours remain before pick-up.`,
                          `Nicht verfügbar: Bis zur Abholung verbleiben weniger als ${BANK_TRANSFER_MINIMUM_LEAD_HOURS} Stunden.`,
                        )}
                      </p>
                    ) : null}
                  </div>
                  <div className={`mt-1 h-4 w-4 rounded-full border ${paymentMethod === method.method ? "border-primary bg-primary" : "border-muted-foreground"}`} />
                </div>
              </button>
              )
            })}
          </div>

          {/* Price Summary */}
          <div className="bg-background rounded-xl p-4 border border-border space-y-3">
            <h3 className="font-semibold text-lg">{copy("Price summary", "Preisübersicht")}</h3>

            {isQuoteLoading ? (
              <p className="text-sm text-muted-foreground">{copy("Calculating price…", "Preis wird berechnet…")}</p>
            ) : quote ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{copy(`Rental (${days} days)`, `Miete (${days} ${days === 1 ? "Tag" : "Tage"})`)}</span>
                  <span className="font-medium">
                    {formatCents(quote.sourceDailyRate, quoteCurrency)} × {days}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{copy("Subtotal", "Zwischensumme")}</span>
                  <span className="font-medium">{formatCents(subtotalCents, quoteCurrency)}</span>
                </div>
                {quote.taxTreatment === "TAX_INCLUDED" ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{copy("Tax", "MwSt.")}</span>
                    <span className="font-medium">{copy("Included", "Enthalten")}</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{copy("Tax", "MwSt.")} ({Math.round(quote.taxRateBps / 100)}%)</span>
                    <span className="font-medium">{formatCents(taxCents, quoteCurrency)}</span>
                  </div>
                )}
                {quote.insurance?.selected ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {quote.insurance.customerFacingName} ({quote.insurance.billableDays} {copy("days", "Tage")})
                    </span>
                    <span className="font-medium">
                      {formatCents(quote.insurance.subtotal, quote.insurance.currency)}
                    </span>
                  </div>
                ) : null}
                <div className="border-t border-border pt-2 flex justify-between">
                  <span className="font-semibold">{copy("Total", "Gesamt")}</span>
                  <span className="font-bold text-xl">{formatCents(totalCents, quoteCurrency)}</span>
                </div>
                {advanceCents > 0 && (
                  <div className="flex justify-between text-sm pt-2 border-t border-border/70">
                    <span className="text-muted-foreground">
                      {depositCents > 0
                        ? `${locale === "de" ? "Anzahlung vor Bestätigung" : "Deposit before confirmation"} (${depositPercent}%)`
                        : locale === "de" ? "Vollständige Zahlung vor Bestätigung" : "Full payment before confirmation"}
                    </span>
                    <span className="font-medium">{formatCents(advanceCents, quoteCurrency)}</span>
                  </div>
                )}
                {advanceCents < totalCents ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{locale === "de" ? "Restbetrag bei Abholung" : "Remaining at pickup"}</span>
                    <span className="font-medium">{formatCents(totalCents - advanceCents, quoteCurrency)}</span>
                  </div>
                ) : null}
                {guaranteeCents > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{copy("Refundable guarantee hold", "Rückerstattbare Sicherheitsleistung")} ({guaranteePercent}%)</span>
                    <span className="font-medium">{formatCents(guaranteeCents, quoteCurrency)}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-red-600">{quoteError ?? copy("A valid quote could not be calculated.", "Es konnte kein gültiger Preis berechnet werden.")}</p>
            )}
            {guaranteeCents > 0 && (
              <p className="text-xs text-muted-foreground rounded-lg bg-muted/40 p-2">
                {copy("The guarantee is a temporary security hold, not an extra rental charge. It is released after return if there are no damages, fines, or policy violations.", "Die Sicherheitsleistung ist eine vorübergehende Reservierung und keine zusätzliche Mietgebühr. Sie wird nach der Rückgabe freigegeben, sofern keine Schäden, Bußgelder oder Regelverstöße vorliegen.")}
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
          )}
          {bookingSetupUnavailable ? (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-medium">{copy("Online booking is not available yet.", "Die Online-Buchung ist noch nicht verfügbar.")}</p>
              <p className="mt-1">{copy("The rental company is still completing its booking settings. Please contact support for help.", "Der Vermieter richtet die Buchungseinstellungen noch ein. Bitte wenden Sie sich an den Support.")}</p>
            </div>
          ) : null}
        </div>

        {/* Bottom Bar */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
          <Button
            onClick={handleConfirmBooking}
            disabled={isPending || isQuoteLoading || !quote || bookingSetupUnavailable || !pickupLocation}
            className="w-full h-12 text-base font-semibold"
          >
            {isPending ? copy("Saving application…", "Antrag wird gespeichert…") : copy("Continue to document upload", "Weiter zum Dokumentenupload")}
          </Button>
        </div>
      </div>
  )
}
