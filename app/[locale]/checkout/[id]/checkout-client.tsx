"use client"

import { useRouter, usePathname } from "@/navigation"
import { useState, useTransition, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { createBooking } from "@/app/actions/bookings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatCents } from "@/lib/money"
import { BookingSuccessModal } from "./booking-success-modal"

export function CheckoutClient({
  car,
  signInUrl,
  paymentDetails,
  companySettings,
}: {
  car: {
    id: string
    name: string
    subtitle?: string | null
    image: string
    price: number
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
  companySettings: {
    companyName: string
    supportEmail: string
    depositPercentage: number
  }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  // Format as datetime-local string (YYYY-MM-DDTHH:mm)
  const formatDatetimeLocal = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
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

  // Update dates and location when URL params change
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
  const [error, setError] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<"TRANSFER" | "PAY_AT_PICKUP">("TRANSFER")
  const [isPending, startTransition] = useTransition()
  const [bookingSuccess, setBookingSuccess] = useState<{
    bookingNumber: string
    transferCode: string
    paymentMethod: "TRANSFER" | "PAY_AT_PICKUP"
    totalPrice: number
    depositAmount: number
    pickupDate: Date
    dropoffDate: Date
    location: string
    carName: string
  } | null>(null)

  const calculateDays = () => {
    const pickup = new Date(pickupDate)
    const dropoff = new Date(dropoffDate)
    const diffTime = Math.abs(dropoff.getTime() - pickup.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays || 1
  }

  const days = calculateDays()
  const subtotalCents = car.price * days
  const taxCents = Math.round(subtotalCents * 0.1)
  const totalCents = subtotalCents + taxCents

  const handleConfirmBooking = () => {
    setError(null)
    startTransition(async () => {
      // Convert datetime-local format to ISO 8601
      const pickupISO = new Date(pickupDate).toISOString()
      const dropoffISO = new Date(dropoffDate).toISOString()
      
      const result = await createBooking({
        carId: car.id,
        pickupDate: pickupISO,
        dropoffDate: dropoffISO,
        location,
        paymentMethod,
      })

      if (result?.error) {
        if (result.error === "Unauthorized") {
          const returnUrl = `${window.location.pathname}${window.location.search}`
          router.push(`${signInUrl}?redirect_url=${encodeURIComponent(returnUrl)}`)
          return
        }
        setError(result.error)
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
          carName={bookingSuccess.carName}
          pickupDate={bookingSuccess.pickupDate}
          dropoffDate={bookingSuccess.dropoffDate}
          location={bookingSuccess.location}
          paymentDetails={paymentDetails}
          companySettings={companySettings}
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

          <div className="space-y-2">
            <Label htmlFor="pickup">Pick-up Date & Time</Label>
            <Input
              id="pickup"
              type="datetime-local"
              value={pickupDate}
              onChange={(e) => {
                setPickupDate(e.target.value)
                // Update URL params when date changes
                const params = new URLSearchParams(searchParams.toString())
                const dateStr = e.target.value.split("T")[0] // Extract YYYY-MM-DD
                params.set("pickupDate", dateStr)
                const queryString = params.toString()
                router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dropoff">Drop-off Date & Time</Label>
            <Input
              id="dropoff"
              type="datetime-local"
              value={dropoffDate}
              onChange={(e) => {
                setDropoffDate(e.target.value)
                // Update URL params when date changes
                const params = new URLSearchParams(searchParams.toString())
                const dateStr = e.target.value.split("T")[0] // Extract YYYY-MM-DD
                params.set("dropoffDate", dateStr)
                const queryString = params.toString()
                router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Pick-up Location</Label>
            <Input 
              id="location" 
              value={location} 
              onChange={(e) => {
                setLocation(e.target.value)
                // Update URL params when location changes
                const params = new URLSearchParams(searchParams.toString())
                params.set("location", e.target.value)
                const queryString = params.toString()
                router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
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
                  Pay deposit by transfer after booking confirmation.
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
                  Complete payment in person when you collect the vehicle.
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

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Rental ({days} days)</span>
              <span className="font-medium">
                {formatCents(car.price)} × {days}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatCents(subtotalCents)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax (10%)</span>
              <span className="font-medium">{formatCents(taxCents)}</span>
            </div>
            <div className="border-t border-border pt-2 flex justify-between">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-xl">{formatCents(totalCents)}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        <Button onClick={handleConfirmBooking} disabled={isPending} className="w-full h-12 text-base font-semibold">
          {isPending ? "Processing..." : "Confirm Booking"}
        </Button>
      </div>
    </div>
    </>
  )
}
