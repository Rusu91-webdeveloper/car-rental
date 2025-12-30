"use client"

import { useRouter } from "@/navigation"
import { useState, useTransition } from "react"
import { createBooking } from "@/app/actions/bookings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatCents } from "@/lib/money"
import { BookingSuccessModal } from "./booking-success-modal"

export function CheckoutClient({
  car,
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
}) {
  const router = useRouter()
  
  // Set default dates to tomorrow and 3 days later
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(10, 0, 0, 0)
  
  const threeDaysLater = new Date(tomorrow)
  threeDaysLater.setDate(threeDaysLater.getDate() + 3)
  
  // Format as datetime-local string (YYYY-MM-DDTHH:mm)
  const formatDatetimeLocal = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }
  
  const [pickupDate, setPickupDate] = useState(formatDatetimeLocal(tomorrow))
  const [dropoffDate, setDropoffDate] = useState(formatDatetimeLocal(threeDaysLater))
  const [location, setLocation] = useState("SFO International Airport")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [bookingSuccess, setBookingSuccess] = useState<{
    bookingNumber: string
    transferCode: string
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
      })

      if (result?.error) {
        setError(result.error)
        return
      }

      // If Stripe checkout URL is provided, redirect to Stripe
      if (result?.checkoutUrl) {
        window.location.href = result.checkoutUrl
        return
      }

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
          totalPrice={bookingSuccess.totalPrice}
          depositAmount={bookingSuccess.depositAmount}
          carName={bookingSuccess.carName}
          pickupDate={bookingSuccess.pickupDate}
          dropoffDate={bookingSuccess.dropoffDate}
          location={bookingSuccess.location}
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
              onChange={(e) => setPickupDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dropoff">Drop-off Date & Time</Label>
            <Input
              id="dropoff"
              type="datetime-local"
              value={dropoffDate}
              onChange={(e) => setDropoffDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Pick-up Location</Label>
            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
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
