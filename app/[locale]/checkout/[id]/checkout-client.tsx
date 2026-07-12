"use client"

import { useRouter, usePathname } from "@/navigation"
import { useState, useTransition, useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { createBooking, getBookingQuote } from "@/app/actions/bookings"
import { getCarAvailability } from "@/app/actions/cars"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatCents } from "@/lib/money"
import { CalendarIcon } from "lucide-react"
import { BookingSuccessModal } from "./booking-success-modal"

export function CheckoutClient({
  locale,
  car,
  signInUrl,
  paymentDetails,
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
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const formatDateKey = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  // Format as datetime-local string (YYYY-MM-DDTHH:mm)
  const formatDatetimeLocal = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    const hours = String(date.getHours()).padStart(2, "0")
    const minutes = String(date.getMinutes()).padStart(2, "0")
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  // Convert YYYY-MM-DD format to datetime-local format (YYYY-MM-DDTHH:mm)
  const convertDateStringToDatetimeLocal = (dateString: string, defaultHour: number = 10) => {
    const date = new Date(dateString)
    date.setHours(defaultHour, 0, 0, 0)
    return formatDatetimeLocal(date)
  }

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

  // Get location from URL params or use default
  const getInitialLocation = () => {
    const locationParam = searchParams.get("location")
    return locationParam || "SFO International Airport"
  }

  const [location, setLocation] = useState(getInitialLocation())
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

  const isUnavailableDate = (date: Date) => unavailableDateSet.has(formatDateKey(date))

  const rangeHasUnavailableDays = (start: Date, end: Date) => {
    const from = new Date(start)
    const to = new Date(end)
    from.setHours(0, 0, 0, 0)
    to.setHours(0, 0, 0, 0)

    const current = new Date(from)
    while (current <= to) {
      if (isUnavailableDate(current)) {
        return true
      }
      current.setDate(current.getDate() + 1)
    }

    return false
  }

  // Update dates and location when URL params change
  /* eslint-disable react-hooks/set-state-in-effect -- URL parameters intentionally synchronize controlled form state. */
  useEffect(() => {
    const pickupDateParam = searchParams.get("pickupDate")
    const dropoffDateParam = searchParams.get("dropoffDate")
    const locationParam = searchParams.get("location")

    if (pickupDateParam && dropoffDateParam) {
      setPickupDate(convertDateStringToDatetimeLocal(pickupDateParam, 10))
      setDropoffDate(convertDateStringToDatetimeLocal(dropoffDateParam, 10))
    }

    if (locationParam) {
      setLocation(locationParam)
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
  const [paymentMethod, setPaymentMethod] = useState<"TRANSFER" | "PAY_AT_PICKUP">("TRANSFER")
  const [isPending, startTransition] = useTransition()
  const [bookingSuccess, setBookingSuccess] = useState<{
    bookingNumber: string
    transferCode: string
    paymentMethod: "TRANSFER" | "PAY_AT_PICKUP"
    totalPrice: number
    depositAmount: number
    guaranteeAmount: number
    pickupDate: Date
    dropoffDate: Date
    location: string
    carName: string
    currency: string
    depositRateBps: number
    guaranteeRateBps: number
  } | null>(null)
  const [quote, setQuote] = useState<
    (Awaited<ReturnType<typeof getBookingQuote>> extends { quote?: infer Quote } ? Quote : never) | null
  >(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [isQuoteLoading, setIsQuoteLoading] = useState(true)

  const updateQueryParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => params.set(key, value))
    const queryString = params.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
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
      "Car is no longer available": "That car is no longer available for the selected period. Please choose different dates.",
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
    if (isDateInPast(date) || isUnavailableDate(date)) {
      return true
    }

    if (!pickupDateValue) {
      return true
    }

    const pickupDay = new Date(pickupDateValue)
    pickupDay.setHours(0, 0, 0, 0)

    const selectedDay = new Date(date)
    selectedDay.setHours(0, 0, 0, 0)
    return selectedDay < pickupDay
  }

  const findNextValidDropoff = (pickup: Date, seedDropoff?: Date) => {
    const base = seedDropoff && !Number.isNaN(seedDropoff.getTime()) ? new Date(seedDropoff) : new Date(pickup)
    const candidate = new Date(base)

    if (candidate <= pickup) {
      candidate.setTime(pickup.getTime())
      candidate.setDate(candidate.getDate() + 1)
    }

    for (let i = 0; i < 370; i += 1) {
      if (candidate > pickup && !isUnavailableDate(candidate) && !rangeHasUnavailableDays(pickup, candidate)) {
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

    if (isUnavailableDate(nextPickup)) {
      setError("This pickup date is already booked. Please choose another date.")
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

    if (isUnavailableDate(parsedDropoff)) {
      setError("This drop-off date is already booked. Please choose another date.")
      return false
    }

    const currentPickup = new Date(pickupDate)
    if (!Number.isNaN(currentPickup.getTime())) {
      let nextDropoff = new Date(parsedDropoff)

      if (nextDropoff <= currentPickup) {
        const isSameCalendarDay = formatDateKey(nextDropoff) === formatDateKey(currentPickup)
        if (!isSameCalendarDay) {
          setError("Drop-off must be after pickup.")
          return false
        }

        nextDropoff = new Date(currentPickup)
        nextDropoff.setMinutes(nextDropoff.getMinutes() + 60)
      }

      if (rangeHasUnavailableDays(currentPickup, nextDropoff)) {
        const nextAvailableDropoff = findNextValidDropoff(currentPickup, nextDropoff)
        if (!nextAvailableDropoff) {
          setError("No available drop-off dates were found after this pick-up date.")
          return false
        }
        nextDropoff = nextAvailableDropoff
      }

      setDropoffDate(formatDatetimeLocal(nextDropoff))
      setError(null)
      updateQueryParams({ dropoffDate: formatDateKey(nextDropoff) })
      return true
    }

    setDropoffDate(value)
    setError(null)
    updateQueryParams({ dropoffDate: value.split("T")[0] || formatDateKey(parsedDropoff) })
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

    let current = true
    setQuote(null)
    setQuoteError(null)
    setIsQuoteLoading(true)
    void getBookingQuote({
      carId: car.id,
      pickupDate: pickup.toISOString(),
      dropoffDate: dropoff.toISOString(),
      paymentMethod,
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
  }, [car.id, dropoffDate, paymentMethod, pickupDate])
  /* eslint-enable react-hooks/set-state-in-effect */

  const days = quote?.chargeableDays ?? 0
  const subtotalCents = quote?.baseSubtotal ?? 0
  const taxCents = quote?.taxSubtotal ?? 0
  const totalCents = quote?.grandTotal ?? 0
  const depositPercent = Math.round((quote?.depositRateBps ?? 0) / 100)
  const guaranteePercent = Math.round((quote?.guaranteeRateBps ?? 0) / 100)
  const depositCents = quote?.depositAmount ?? 0
  const guaranteeCents = quote?.guaranteeAmount ?? 0
  const quoteCurrency = quote?.currency ?? "EUR"

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

    if (rangeHasUnavailableDays(pickup, dropoff)) {
      setError("Your selected range includes booked dates. Please choose different dates.")
      return
    }

    startTransition(async () => {
      // Convert datetime-local format to ISO 8601
      const pickupISO = pickup.toISOString()
      const dropoffISO = dropoff.toISOString()
      
      const result = await createBooking({
        carId: car.id,
        pickupDate: pickupISO,
        dropoffDate: dropoffISO,
        location,
        paymentMethod,
        locale: locale === "de" ? "de" : "en",
      })

      if (result?.error) {
        if (result.error === "Unauthorized") {
          const returnUrl = `${window.location.pathname}${window.location.search}`
          router.push(`${signInUrl}?redirect_url=${encodeURIComponent(returnUrl)}`)
          return
        }
        setError(toFriendlyErrorMessage(result.error))
        return
      }

      // Stripe checkout redirect is temporarily disabled.
      // Uncomment this block when you want to re-enable Stripe integration.
      /*
      if (result?.checkoutUrl) {
        window.location.href = result.checkoutUrl
        return
      }
      */

      // Manual payment flow - show success modal with payment instructions
      if (result?.manualPayment && result?.booking) {
        setBookingSuccess({ ...result.booking, carName: car.name })
        return
      }

      // Fallback: redirect to bookings page
      router.push("/bookings")
    })
  }

  return (
    <>
      {bookingSuccess && (
        <BookingSuccessModal
          bookingNumber={bookingSuccess.bookingNumber}
          transferCode={bookingSuccess.transferCode}
          paymentMethod={bookingSuccess.paymentMethod}
          totalPrice={bookingSuccess.totalPrice}
          depositAmount={bookingSuccess.depositAmount}
          guaranteeAmount={bookingSuccess.guaranteeAmount}
          currency={bookingSuccess.currency}
          depositRateBps={bookingSuccess.depositRateBps}
          guaranteeRateBps={bookingSuccess.guaranteeRateBps}
          carName={bookingSuccess.carName}
          pickupDate={bookingSuccess.pickupDate}
          dropoffDate={bookingSuccess.dropoffDate}
          location={bookingSuccess.location}
          paymentDetails={paymentDetails}
          onClose={() => router.push("/bookings")}
        />
      )}

      <div className="min-h-screen bg-muted pb-24">
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

      <div className="p-4 space-y-4">
        {/* Car Summary */}
        <div className="bg-background rounded-xl p-4 border border-border">
          <div className="flex gap-4">
            <img src={car.image || "/placeholder.svg"} alt={car.name} className="w-24 h-24 rounded-lg object-cover" />
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
                    disabled={(date) => isDateInPast(date) || isUnavailableDate(date)}
                    modifiers={{
                      unavailable: (date) => isUnavailableDate(date),
                    }}
                    modifiersClassNames={{
                      unavailable:
                        "!bg-red-100 !text-red-700 !opacity-100 line-through hover:!bg-red-100 dark:!bg-red-900/30 dark:!text-red-300",
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
                      unavailable: (date) => isUnavailableDate(date),
                    }}
                    modifiersClassNames={{
                      unavailable:
                        "!bg-red-100 !text-red-700 !opacity-100 line-through hover:!bg-red-100 dark:!bg-red-900/30 dark:!text-red-300",
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
              : "Booked dates are red in the date picker and cannot be selected."}
          </p>
          {availabilityError && <p className="text-xs text-red-600">{availabilityError}</p>}

          <div className="space-y-2">
            <Label htmlFor="location">Pick-up Location</Label>
            <Input 
              id="location" 
              value={location} 
              onChange={(e) => {
                setLocation(e.target.value)
                updateQueryParams({ location: e.target.value })
              }} 
            />
          </div>
        </div>

        {/* Payment Method */}
        <div className="bg-background rounded-xl p-4 border border-border space-y-3">
          <h3 className="font-semibold text-lg">Payment Method</h3>

          <button
            type="button"
            onClick={() => setPaymentMethod("TRANSFER")}
            className={`w-full text-left rounded-lg border p-3 transition ${
              paymentMethod === "TRANSFER"
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">Bank Transfer</p>
                <p className="text-sm text-muted-foreground">
                  Transfer the deposit securely after booking confirmation.
                </p>
              </div>
              <div
                className={`mt-1 h-4 w-4 rounded-full border ${
                  paymentMethod === "TRANSFER" ? "border-primary bg-primary" : "border-muted-foreground"
                }`}
              />
            </div>
          </button>

          <button
            type="button"
            onClick={() => setPaymentMethod("PAY_AT_PICKUP")}
            className={`w-full text-left rounded-lg border p-3 transition ${
              paymentMethod === "PAY_AT_PICKUP"
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">Pay at Pickup</p>
                <p className="text-sm text-muted-foreground">
                  Pay the full amount in person when collecting the vehicle.
                </p>
              </div>
              <div
                className={`mt-1 h-4 w-4 rounded-full border ${
                  paymentMethod === "PAY_AT_PICKUP" ? "border-primary bg-primary" : "border-muted-foreground"
                }`}
              />
            </div>
          </button>
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
            <div className="border-t border-border pt-2 flex justify-between">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-xl">{formatCents(totalCents, quoteCurrency)}</span>
            </div>
            {paymentMethod === "TRANSFER" && (
              <div className="flex justify-between text-sm pt-2 border-t border-border/70">
                <span className="text-muted-foreground">Deposit due now ({depositPercent}%)</span>
                <span className="font-medium">{formatCents(depositCents, quoteCurrency)}</span>
              </div>
            )}
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
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        <Button onClick={handleConfirmBooking} disabled={isPending || isQuoteLoading || !quote} className="w-full h-12 text-base font-semibold">
          {isPending ? "Processing..." : "Confirm Booking"}
        </Button>
      </div>
    </div>
    </>
  )
}
