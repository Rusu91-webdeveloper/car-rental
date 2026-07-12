"use client"

import { formatCents } from "@/lib/money"
import { Button } from "@/components/ui/button"
import { BOOKING_PAYMENT_WINDOW_HOURS } from "@/lib/constants"

interface BookingSuccessModalProps {
  bookingNumber: string
  transferCode: string
  paymentMethod: "TRANSFER" | "PAY_AT_PICKUP"
  totalPrice: number
  depositAmount: number
  guaranteeAmount: number
  currency: string
  depositRateBps: number
  guaranteeRateBps: number
  carName: string
  pickupDate: Date
  dropoffDate: Date
  location: string
  paymentDetails: {
    bankName: string
    accountName: string
    accountNumber: string
    swiftCode: string
    iban?: string | null
  }
  onClose: () => void
}

export function BookingSuccessModal({
  bookingNumber,
  transferCode,
  paymentMethod,
  totalPrice,
  depositAmount,
  guaranteeAmount,
  currency,
  depositRateBps,
  guaranteeRateBps,
  carName,
  pickupDate,
  dropoffDate,
  location,
  paymentDetails,
  onClose,
}: BookingSuccessModalProps) {
  const depositPercent = Math.round(depositRateBps / 100)
  const guaranteePercent = Math.round(guaranteeRateBps / 100)
  const remainingAtPickup = Math.max(totalPrice - depositAmount, 0)
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const handleCopyTransferCode = () => {
    navigator.clipboard.writeText(transferCode)
    // You could add a toast notification here
  }

  const handleCopyBookingNumber = () => {
    navigator.clipboard.writeText(bookingNumber)
    // You could add a toast notification here
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Success Header */}
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-t-2xl">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center mb-2">Booking Confirmed!</h2>
          <p className="text-center text-white/90">Your reservation has been created successfully</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Booking Reference */}
          <div className="bg-muted rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Booking Number</span>
              <button
                onClick={handleCopyBookingNumber}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Copy
              </button>
            </div>
            <div className="font-mono font-bold text-xl">{bookingNumber}</div>
          </div>

          {paymentMethod === "TRANSFER" ? (
            <div className="bg-primary/10 border-2 border-primary/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-primary">Transfer Reference Code</span>
                <button
                  onClick={handleCopyTransferCode}
                  className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy
                </button>
              </div>
              <div className="font-mono font-bold text-2xl text-primary tracking-wider">{transferCode}</div>
              <p className="text-xs text-muted-foreground">Use this code as reference when making payment</p>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1">
              <p className="text-sm font-semibold text-emerald-900">Payment Method</p>
              <p className="text-sm text-emerald-800">Pay at Pickup</p>
              <p className="text-xs text-emerald-700">
                You will complete payment when collecting the vehicle at pickup.
              </p>
            </div>
          )}

          {/* Booking Details */}
          <div className="space-y-3">
            <h3 className="font-semibold">Booking Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Car</span>
                <span className="font-medium">{carName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pick-up</span>
                <span className="font-medium">{formatDate(pickupDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Drop-off</span>
                <span className="font-medium">{formatDate(dropoffDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Location</span>
                <span className="font-medium">{location}</span>
              </div>
            </div>
          </div>

          {paymentMethod === "TRANSFER" ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
                <div className="flex-1">
                  <h4 className="font-semibold text-amber-900 mb-2">Payment Required</h4>
                  <div className="space-y-2 text-sm text-amber-800">
                    <p>Please complete payment via bank transfer:</p>
                    <p className="text-xs text-amber-800">
                      Pay within {BOOKING_PAYMENT_WINDOW_HOURS} hours or the booking will be cancelled.
                    </p>
                    <div className="bg-white rounded-lg p-3 space-y-1 font-mono text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deposit ({depositPercent}%):</span>
                        <span className="font-bold">{formatCents(depositAmount, currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Remaining rental at pickup:</span>
                        <span className="font-bold">{formatCents(remainingAtPickup, currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Amount:</span>
                        <span className="font-bold">{formatCents(totalPrice, currency)}</span>
                      </div>
                      {guaranteeAmount > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Refundable guarantee ({guaranteePercent}%):</span>
                          <span className="font-bold">{formatCents(guaranteeAmount, currency)}</span>
                        </div>
                      )}
                    </div>
                    <div className="bg-white rounded-lg p-3 space-y-1 text-xs">
                      <p className="font-semibold text-amber-900">Bank Details:</p>
                      <p>Bank Name: <span className="font-medium">{paymentDetails.bankName}</span></p>
                      <p>Account Name: <span className="font-medium">{paymentDetails.accountName}</span></p>
                      <p>Account Number: <span className="font-medium">{paymentDetails.accountNumber}</span></p>
                      <p>Swift Code: <span className="font-medium">{paymentDetails.swiftCode}</span></p>
                      {paymentDetails.iban && (
                        <p>IBAN: <span className="font-medium">{paymentDetails.iban}</span></p>
                      )}
                      <p>Reference: <span className="font-mono font-bold text-primary">{transferCode}</span></p>
                    </div>
                    <p className="text-xs mt-2">
                      <strong>Important:</strong> Include the transfer code <span className="font-mono font-semibold">{transferCode}</span> in your payment reference so we can process your booking.
                    </p>
                    {guaranteeAmount > 0 && (
                      <p className="text-xs">
                        The guarantee is a refundable security hold. It is not an extra rental fee and is released
                        after return if there are no damages, fines, or policy violations.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <h4 className="font-semibold text-amber-900">Pay at Pickup</h4>
              <p className="text-sm text-amber-800">
                You selected in-person payment at pickup. Please arrive with a valid payment method to complete the booking.
              </p>
              <div className="bg-white rounded-lg p-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount Due at Pickup:</span>
                  <span className="font-bold">{formatCents(totalPrice, currency)}</span>
                </div>
                {guaranteeAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Refundable guarantee ({guaranteePercent}%):</span>
                    <span className="font-bold">{formatCents(guaranteeAmount, currency)}</span>
                  </div>
                )}
              </div>
              {guaranteeAmount > 0 && (
                <p className="text-xs text-amber-800">
                  The guarantee is a temporary security hold and is released after return if no issues are found.
                </p>
              )}
            </div>
          )}

          {/* Next Steps */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
            <h4 className="font-semibold text-blue-900 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Next Steps
            </h4>
            {paymentMethod === "TRANSFER" ? (
              <ol className="text-sm text-blue-800 space-y-1 ml-7 list-decimal">
                <li>Complete the bank transfer within {BOOKING_PAYMENT_WINDOW_HOURS} hours</li>
                <li>You will receive a confirmation email with payment instructions</li>
                <li>Once payment is verified, your booking will be confirmed</li>
                <li>You&apos;ll receive a final confirmation email with pickup details</li>
              </ol>
            ) : (
              <ol className="text-sm text-blue-800 space-y-1 ml-7 list-decimal">
                <li>Arrive at the pickup location at the selected date and time</li>
                <li>Present your booking number and valid ID</li>
                <li>Complete payment at pickup</li>
                <li>Collect your vehicle and enjoy your trip</li>
              </ol>
            )}
          </div>

          {/* Action Button */}
          <Button onClick={onClose} className="w-full h-12 text-base font-semibold">
            View My Bookings
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            A confirmation email has been sent with all the details above.
          </p>
        </div>
      </div>
    </div>
  )
}
