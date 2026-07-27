"use client"

import { useRouter, usePathname } from "@/navigation"
import { useState, useTransition, useEffect, useMemo } from "react"
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
import { LegalContent } from "@/components/legal/legal-content"
import {
  isRentalDurationTooShort,
  minimumRentalDays,
  minimumRentalPeriodMessage,
  minimumReturnAt,
} from "@/lib/booking-configuration/minimum-rental"
import {
  totalOperationalBufferMinutes,
} from "@/lib/rental-timing"

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

const convertDateStringToDatetimeLocal = (dateString: string, defaultHour: number = 10) => {
  const date = new Date(dateString)
  date.setHours(defaultHour, 0, 0, 0)
  return formatDatetimeLocal(date)
}

export function CheckoutClient({
  locale,
  car,
  signInUrl,
  bookingConfiguration,
  pickupLocation,
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
  initialCustomer: BookingCustomerDriverInput
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Get dates from URL params or use defaults
  const getInitialDates = () => {
    const pickupDateParam = searchParams.get("pickupDate")
    const dropoffDateParam = searchParams.get("dropoffDate")

    if (pickupDateParam && dropoffDateParam) {
      // Convert YYYY-MM-DD from URL to datetime-local format
      const pickup = convertDateStringToDatetimeLocal(pickupDateParam, 10)
      const dropoff = convertDateStringToDatetimeLocal(dropoffDateParam, 10)
      return { pickup, dropoff }
    }

    // Default dates: tomorrow and 3 days later
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(10, 0, 0, 0)

    const threeDaysLater = new Date(tomorrow)
    threeDaysLater.setDate(threeDaysLater.getDate() + 3)

    return {
      pickup: formatDatetimeLocal(tomorrow),
      dropoff: formatDatetimeLocal(threeDaysLater),
    }
  }

  const initialDates = getInitialDates()
  const [pickupDate, setPickupDate] = useState(initialDates.pickup)
  const [dropoffDate, setDropoffDate] = useState(initialDates.dropoff)

  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(true)
  const [unavailableRanges, setUnavailableRanges] = useState<{ start: Date; end: Date }[]>([])
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)

  const unavailableDateSet = useMemo(() => {
    const blocked = new Set<string>()
    unavailableRanges.forEach((range) => {
      const start = new Date(range.start)
      const end = new Date(range.end)
      start.setHours(0, 0, 0, 0)
      end.setHours(0, 0, 0, 0)

      const current = new Date(start)
      while (current <= end) {
        blocked.add(formatDateKey(current))
        current.setDate(current.getDate() + 1)
      }
    })
    return blocked
  }, [unavailableRanges])

  const isDateInPast = (date: Date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dateCopy = new Date(date)
    dateCopy.setHours(0, 0, 0, 0)
    return dateCopy < today
  }

  const hasUnavailableTime = (date: Date) => unavailableDateSet.has(formatDateKey(date))
  const isTimeUnavailable = (date: Date) =>
    unavailableRanges.some((range) => date >= range.start && date < range.end)
  const rangeOverlapsUnavailableTime = (start: Date, end: Date) =>
    unavailableRanges.some((range) => start < range.end && end > range.start)

  // Update dates when URL params change.
  /* eslint-disable react-hooks/set-state-in-effect -- URL parameters intentionally synchronize controlled form state. */
  useEffect(() => {
    const pickupDateParam = searchParams.get("pickupDate")
    const dropoffDateParam = searchParams.get("dropoffDate")
    if (pickupDateParam && dropoffDateParam) {
      setPickupDate(convertDateStringToDatetimeLocal(pickupDateParam, 10))
      setDropoffDate(convertDateStringToDatetimeLocal(dropoffDateParam, 10))
    }
  }, [searchParams])
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
          setAvailabilityError("Unable to load unavailable dates right now.")
          return
        }

        const ranges = (result?.unavailableDates || []).map((range) => ({
          start: new Date(range.start),
          end: new Date(range.end),
        }))
        setUnavailableRanges(ranges)
        setAvailabilityError(null)
      } catch (err) {
        if (mounted) {
          console.error("Failed to load car availability:", err)
          setAvailabilityError("Unable to load unavailable dates right now.")
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
  }, [car.id])

  const [error, setError] = useState<string | null>(null)
  const [pickupCalendarOpen, setPickupCalendarOpen] = useState(false)
  const [dropoffCalendarOpen, setDropoffCalendarOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<"TRANSFER" | "PAY_AT_PICKUP">(
    bookingConfiguration.payment?.defaultMethod ?? "TRANSFER",
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
  const configuredMinimumDays = minimumRentalDays(bookingConfiguration.minimumRentalMinutes)
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

  const toFriendlyErrorMessage = (rawError: string) => {
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
      "Pickup date must be in the future": "Please select a pickup date and time in the future.",
      "Drop-off date must be after pickup date": "Drop-off must be after pickup.",
      "Car is not available for the selected dates": "Those dates are unavailable. Please choose different dates.",
      "Car is no longer available":
        "That car is no longer available for the selected period. Please choose different dates.",
    }

    return messageMap[normalizedError] || normalizedError
  }

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

  const formatDateLabel = (value: Date | undefined, fallback: string) => {
    if (!value) {
      return fallback
    }

    return value.toLocaleDateString(undefined, {
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
    if (isDateInPast(date)) {
      return true
    }

    if (!pickupDateValue) {
      return true
    }

    const earliestDropoffDay = minimumReturnAt(
      pickupDateValue,
      bookingConfiguration.minimumRentalMinutes,
    )
    earliestDropoffDay.setHours(0, 0, 0, 0)

    const selectedDay = new Date(date)
    selectedDay.setHours(0, 0, 0, 0)
    return selectedDay < earliestDropoffDay
  }

  const findNextValidDropoff = (pickup: Date, seedDropoff?: Date) => {
    const base = seedDropoff && !Number.isNaN(seedDropoff.getTime()) ? new Date(seedDropoff) : new Date(pickup)
    const candidate = new Date(base)
    const earliestDropoff = minimumReturnAt(pickup, bookingConfiguration.minimumRentalMinutes)

    if (candidate < earliestDropoff) {
      candidate.setTime(earliestDropoff.getTime())
    }

    for (let i = 0; i < 370; i += 1) {
      if (candidate >= earliestDropoff && !rangeOverlapsUnavailableTime(pickup, candidate)) {
        return candidate
      }
      candidate.setDate(candidate.getDate() + 1)
    }

    return null
  }

  const handlePickupChange = (value: string) => {
    const nextPickup = new Date(value)
    if (Number.isNaN(nextPickup.getTime())) {
      return false
    }

    if (isTimeUnavailable(nextPickup)) {
      setError("This pickup time is booked or reserved for vehicle preparation. Please choose another time.")
      return false
    }

    if (nextPickup <= new Date()) {
      setError("Please select a pickup date and time in the future.")
      return false
    }

    const currentDropoff = new Date(dropoffDate)
    const nextDropoff = findNextValidDropoff(nextPickup, currentDropoff)
    if (!nextDropoff) {
      setError("No available drop-off dates were found after this pick-up date.")
      return false
    }

    setPickupDate(value)
    setDropoffDate(formatDatetimeLocal(nextDropoff))
    setError(null)
    updateQueryParams({
      pickupDate: value.split("T")[0] || formatDateKey(nextPickup),
      dropoffDate: formatDateKey(nextDropoff),
    })
    return true
  }

  const handleDropoffChange = (value: string) => {
    const parsedDropoff = new Date(value)
    if (Number.isNaN(parsedDropoff.getTime())) {
      return false
    }

    const currentPickup = new Date(pickupDate)
    if (!Number.isNaN(currentPickup.getTime())) {
      const nextDropoff = new Date(parsedDropoff)

      if (
        nextDropoff <= currentPickup ||
        isRentalDurationTooShort(currentPickup, nextDropoff, bookingConfiguration.minimumRentalMinutes)
      ) {
        setError(minimumDurationMessage)
        return false
      }

      if (rangeOverlapsUnavailableTime(currentPickup, nextDropoff)) {
        setError("The selected times overlap a booking, block, or vehicle preparation period.")
        return false
      }

      setDropoffDate(formatDatetimeLocal(nextDropoff))
      setError(null)
      updateQueryParams({ dropoffDate: formatDateKey(nextDropoff) })
      return true
    }

    setDropoffDate(value)
    setError(null)
    updateQueryParams({
      dropoffDate: value.split("T")[0] || formatDateKey(parsedDropoff),
    })
    return true
  }

  const handlePickupDateSelect = (date: Date | undefined) => {
    if (!date) {
      return
    }

    const nextPickup = combineDateWithCurrentTime(date, pickupDate, 10)
    const updated = handlePickupChange(formatDatetimeLocal(nextPickup))
    if (updated) {
      setPickupCalendarOpen(false)
    }
  }

  const handleDropoffDateSelect = (date: Date | undefined) => {
    if (!date) {
      return
    }

    const nextDropoff = combineDateWithCurrentTime(date, dropoffDate, 10)
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
    const pickup = new Date(pickupDate)
    const dropoff = new Date(dropoffDate)
    if (Number.isNaN(pickup.getTime()) || Number.isNaN(dropoff.getTime()) || dropoff <= pickup) {
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
        setQuoteError(result.error ?? "A valid quote could not be calculated.")
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
    car.id,
    dropoffDate,
    insuranceSelected,
    minimumDurationMessage,
    paymentMethod,
    pickupDate,
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

    const pickup = new Date(pickupDate)
    const dropoff = new Date(dropoffDate)

    if (Number.isNaN(pickup.getTime()) || Number.isNaN(dropoff.getTime())) {
      setError("Please select valid pickup and drop-off dates.")
      return
    }

    if (pickup <= new Date()) {
      setError("Please select a pickup date and time in the future.")
      return
    }

    if (dropoff <= pickup) {
      setError("Drop-off must be after pickup.")
      return
    }

    if (isRentalDurationTooShort(pickup, dropoff, bookingConfiguration.minimumRentalMinutes)) {
      setError(minimumDurationMessage)
      return
    }

    if (rangeOverlapsUnavailableTime(pickup, dropoff)) {
      setError("Your selected times overlap a booking, block, or vehicle preparation period.")
      return
    }
    if (!pickupLocation) {
      setError("The rental company pickup address is not configured. Please contact support.")
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
      setError(`Please acknowledge ${missingLegalAcknowledgement.title} before booking.`)
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
            <h1 className="text-xl font-bold">Checkout</h1>
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
            <h3 className="font-semibold text-lg">Booking Details</h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Pick-up Date</Label>
                <Popover open={pickupCalendarOpen} onOpenChange={setPickupCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-between font-normal">
                      <span>{formatDateLabel(pickupDateValue, "Select pick-up date")}</span>
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={pickupDateValue}
                      onSelect={handlePickupDateSelect}
                      disabled={(date) => isDateInPast(date)}
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
                <Label htmlFor="pickup-time">Pick-up Time</Label>
                <Input
                  id="pickup-time"
                  type="time"
                  value={formatTimeValue(pickupDateValue)}
                  onChange={(e) => handlePickupTimeChange(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Drop-off Date</Label>
                <Popover open={dropoffCalendarOpen} onOpenChange={setDropoffCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-between font-normal">
                      <span>{formatDateLabel(dropoffDateValue, "Select drop-off date")}</span>
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
                <Label htmlFor="dropoff-time">Drop-off Time</Label>
                <Input
                  id="dropoff-time"
                  type="time"
                  value={formatTimeValue(dropoffDateValue)}
                  onChange={(e) => handleDropoffTimeChange(e.target.value)}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {isAvailabilityLoading
                ? "Loading unavailable dates..."
                : locale === "de"
                  ? `Rote Tage enthalten belegte Zeiten. Freie Uhrzeiten am selben Tag können gewählt werden. Nach jeder Rückgabe sind insgesamt ${operationalBufferMinutes} Minuten gesperrt: 60 Minuten Verspätungspuffer und ${bookingConfiguration.preparationBufferMinutes} Minuten Vorbereitung.`
                  : `Red days contain unavailable times. Free times on the same day remain selectable. Every return is followed by a ${operationalBufferMinutes}-minute block: 60 minutes for possible lateness and ${bookingConfiguration.preparationBufferMinutes} minutes for preparation.`}
            </p>
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground" role="status">
              <span className="font-medium">
                {locale === "de" ? "Mindestmietdauer" : "Minimum rental period"}: {configuredMinimumDays}{" "}
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
                  ? "Frühere Rückgabetermine können nicht ausgewählt werden."
                  : "Earlier drop-off times cannot be selected."}
              </span>
            </div>
            {availabilityError && <p className="text-xs text-red-600">{availabilityError}</p>}

            <div className="space-y-2">
              <Label id="owner-pickup-location-label">Pick-up and return location</Label>
              <div
                className={`flex gap-3 rounded-lg border px-3 py-3 ${pickupLocation ? "border-primary/20 bg-primary/5" : "border-red-200 bg-red-50"}`}
                aria-labelledby="owner-pickup-location-label"
              >
                <MapPin className={`mt-0.5 h-5 w-5 shrink-0 ${pickupLocation ? "text-primary" : "text-red-600"}`} aria-hidden="true" />
                <div>
                  <p className={`text-sm font-medium ${pickupLocation ? "text-foreground" : "text-red-700"}`}>
                    {pickupLocation ?? "Pickup address unavailable"}
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
                  <h3 className="font-semibold text-lg">Customer and driver information</h3>
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
                      {section === "CUSTOMER" ? "Customer information" : "Driver information"}
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
              <h3 className="font-semibold text-lg">Insurance</h3>
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
                    {bookingConfiguration.insurance.requirementMode === "MANDATORY" ? " — required" : ""}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {bookingConfiguration.insurance.description}
                  </span>
                  <span className="mt-2 block text-sm">
                    {formatCents(bookingConfiguration.insurance.pricePerDay, bookingConfiguration.insurance.currency)}{" "}
                    per billable rental day
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          {bookingConfiguration.legal ? (
            <div className="bg-background rounded-xl p-4 border border-border space-y-4">
              <div>
                <h3 className="font-semibold text-lg">Terms and privacy</h3>
                <p className="text-sm text-muted-foreground">
                  Review the exact published versions that apply to this booking. Required acknowledgements start unchecked.
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
                          Version {document.versionLabel || document.versionNumber} · {document.locale}
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
                      <p className="text-sm text-muted-foreground">Displayed for your information; no acceptance is recorded.</p>
                    )}
                  </section>
                )
              })}
            </div>
          ) : null}

          {/* Payment Method */}
          <div className="bg-background rounded-xl p-4 border border-border space-y-3">
            <h3 className="font-semibold text-lg">{locale === "de" ? "Zahlungsmethode" : "Payment method"}</h3>
            {(bookingConfiguration.payment?.methods ?? [
              { method: "TRANSFER" as const, configuredMode: "BANK_TRANSFER" as const, label: "Bank transfer", description: "Full payment by bank transfer before confirmation." },
              { method: "PAY_AT_PICKUP" as const, configuredMode: "CASH_ON_PICKUP" as const, label: "Pay at pickup", description: "Full payment when collecting the vehicle." },
            ]).map((method) => (
              <button
                key={method.method}
                type="button"
                onClick={() => setPaymentMethod(method.method)}
                className={`w-full text-left rounded-lg border p-3 transition ${
                  paymentMethod === method.method
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{method.label}</p>
                    <p className="text-sm text-muted-foreground">{method.description}</p>
                  </div>
                  <div className={`mt-1 h-4 w-4 rounded-full border ${paymentMethod === method.method ? "border-primary bg-primary" : "border-muted-foreground"}`} />
                </div>
              </button>
            ))}
          </div>

          {/* Price Summary */}
          <div className="bg-background rounded-xl p-4 border border-border space-y-3">
            <h3 className="font-semibold text-lg">Price Summary</h3>

            {isQuoteLoading ? (
              <p className="text-sm text-muted-foreground">Calculating authoritative server quote…</p>
            ) : quote ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Rental ({days} days)</span>
                  <span className="font-medium">
                    {formatCents(quote.sourceDailyRate, quoteCurrency)} × {days}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatCents(subtotalCents, quoteCurrency)}</span>
                </div>
                {quote.taxTreatment === "TAX_INCLUDED" ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-medium">Included</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax ({Math.round(quote.taxRateBps / 100)}%)</span>
                    <span className="font-medium">{formatCents(taxCents, quoteCurrency)}</span>
                  </div>
                )}
                {quote.insurance?.selected ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {quote.insurance.customerFacingName} ({quote.insurance.billableDays} days)
                    </span>
                    <span className="font-medium">
                      {formatCents(quote.insurance.subtotal, quote.insurance.currency)}
                    </span>
                  </div>
                ) : null}
                <div className="border-t border-border pt-2 flex justify-between">
                  <span className="font-semibold">Total</span>
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
                    <span className="text-muted-foreground">Refundable guarantee hold ({guaranteePercent}%)</span>
                    <span className="font-medium">{formatCents(guaranteeCents, quoteCurrency)}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-red-600">{quoteError ?? "A valid quote could not be calculated."}</p>
            )}
            {guaranteeCents > 0 && (
              <p className="text-xs text-muted-foreground rounded-lg bg-muted/40 p-2">
                The guarantee is a temporary security hold, not an extra rental charge. It is released after return if
                there are no damages, fines, or policy violations.
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
          )}
          {bookingSetupUnavailable ? (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-medium">Online booking is not available yet.</p>
              <p className="mt-1">The rental company is still completing its booking settings. Please contact support for help.</p>
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
            {isPending ? "Saving application..." : "Continue to document upload"}
          </Button>
        </div>
      </div>
  )
}
