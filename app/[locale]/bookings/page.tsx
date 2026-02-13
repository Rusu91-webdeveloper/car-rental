import Link from "@/navigation"
import { redirect } from "@/navigation"
import { BottomNav } from "@/components/bottom-nav"
import { Badge } from "@/components/ui/badge"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { config } from "@/lib/config"
import { formatCents } from "@/lib/money"
import { runBookingLifecycleMaintenance } from "@/lib/booking-expiration"
import { getTranslations } from "next-intl/server"
import { BOOKING_PAYMENT_WINDOW_MS } from "@/lib/constants"
import { BookingReviewSection } from "./booking-review-section"

export const dynamic = "force-dynamic"

export default async function BookingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations()
  const user = await getCurrentUser()
  const signInUrl = "/sign-in"

  if (!user) {
    redirect({ href: signInUrl, locale })
  }

  // TypeScript doesn't know redirect throws, use non-null assertion
  const currentUser = user!

  await runBookingLifecycleMaintenance()
  const userBookings = await prisma.booking.findMany({
    where: { userId: currentUser.id },
    include: {
      car: true,
      review: {
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "CONFIRMED":
        return "bg-green-50 text-success border-success/20"
      case "PENDING":
        return "bg-yellow-50 text-warning border-warning/20"
      case "COMPLETED":
        return "bg-blue-50 text-blue-600 border-blue-200"
      case "CANCELLED":
        return "bg-red-50 text-error border-error/20"
      default:
        return "bg-gray-50 text-gray-600 border-gray-200"
    }
  }

  const getPaymentStatusColor = (paymentStatus: string) => {
    switch (paymentStatus) {
      case "PAID":
        return "bg-green-50 text-green-700 border-green-200"
      case "PENDING":
        return "bg-yellow-50 text-yellow-700 border-yellow-200"
      case "FAILED":
        return "bg-red-50 text-red-700 border-red-200"
      case "REFUNDED":
        return "bg-blue-50 text-blue-700 border-blue-200"
      case "PARTIALLY_REFUNDED":
        return "bg-purple-50 text-purple-700 border-purple-200"
      default:
        return "bg-gray-50 text-gray-700 border-gray-200"
    }
  }

  const getPaymentStatusLabel = (paymentStatus: string) => {
    switch (paymentStatus) {
      case "PAID":
        return t("bookings.paid")
      case "PENDING":
        return t("bookings.pending")
      case "FAILED":
        return t("bookings.failed")
      case "REFUNDED":
        return t("bookings.refunded")
      case "PARTIALLY_REFUNDED":
        return t("bookings.partiallyRefunded")
      default:
        return paymentStatus
    }
  }

  const getPaymentMethodLabel = (paymentMethod: string) => {
    switch (paymentMethod) {
      case "TRANSFER":
        return "Bank Transfer"
      case "PAY_AT_PICKUP":
        return "Pay at Pickup"
      default:
        return paymentMethod
    }
  }

  const calculateCancellationDeadline = (createdAt: Date): Date => {
    return new Date(createdAt.getTime() + BOOKING_PAYMENT_WINDOW_MS)
  }

  const formatDateTime = (date: Date, locale: string) => {
    return new Date(date).toLocaleString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const reviewCopy = {
    yourReview: t("bookings.review.yourReview"),
    rateExperience: t("bookings.review.rateExperience"),
    eligibleMessage: t("bookings.review.eligibleMessage"),
    leaveReview: t("bookings.review.leaveReview"),
    submitReview: t("bookings.review.submitReview"),
    submitting: t("bookings.review.submitting"),
    cancel: t("bookings.review.cancel"),
    placeholder: t("bookings.review.placeholder"),
  }

  return (
    <div className="min-h-screen bg-muted pb-20">
      {/* Header */}
      <header className="bg-background px-4 py-4 border-b border-border sticky top-0 z-10">
        <h1 className="text-xl font-bold">{t("bookings.title")}</h1>
      </header>

      <div className="p-4">
        {userBookings.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">{t("bookings.noBookings")}</h3>
            <p className="text-muted-foreground text-sm mb-6">{t("bookings.createFirst")}</p>
            <Link
              href="/"
              className="inline-flex px-6 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-colors"
            >
              Browse Cars
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {userBookings.map((booking) => {
              const displayName = locale === "de" ? booking.car.nameDe || booking.car.name : booking.car.name
              const displaySubtitle =
                locale === "de" ? booking.car.subtitleDe || booking.car.subtitle : booking.car.subtitle
              const cancellationDeadline = calculateCancellationDeadline(booking.createdAt)
              const showCancellationDeadline =
                booking.status === "PENDING" &&
                booking.paymentStatus === "PENDING" &&
                booking.paymentMethod === "TRANSFER"
              const canLeaveReview =
                booking.status === "COMPLETED" &&
                (booking.paymentStatus === "PAID" || booking.paymentMethod === "PAY_AT_PICKUP")

              return (
                <div key={booking.id} className="bg-background rounded-xl p-4 border border-border">
                  <div className="flex gap-4 mb-4">
                    <img
                      src={booking.car.image || "/placeholder.svg"}
                      alt={displayName}
                      className="w-24 h-24 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-bold">{displayName}</h3>
                          <p className="text-sm text-muted-foreground">{displaySubtitle}</p>
                        </div>
                        <Badge className={getStatusColor(booking.status)}>{booking.status}</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 text-sm">
                    {/* Payment Information Section */}
                    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                      <h4 className="font-semibold text-sm mb-2">{t("bookings.paymentInfo")}</h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{t("bookings.referenceNumber")}</span>
                          <span className="font-mono font-medium">{booking.bookingNumber}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{t("bookings.paymentStatus")}</span>
                          <Badge className={getPaymentStatusColor(booking.paymentStatus)} variant="outline">
                            {getPaymentStatusLabel(booking.paymentStatus)}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Payment Method</span>
                          <span>{getPaymentMethodLabel(booking.paymentMethod)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{t("bookings.bookedAt")}</span>
                          <span>{formatDateTime(booking.createdAt, locale)}</span>
                        </div>
                        {showCancellationDeadline && (
                          <div className="flex items-center justify-between pt-2 border-t border-border">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <svg className="w-4 h-4 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                />
                              </svg>
                              {t("bookings.willCancelAt")}
                            </span>
                            <span className="font-medium text-warning">
                              {formatDateTime(cancellationDeadline, locale)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Booking Dates */}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span>
                        {new Date(booking.pickupDate).toLocaleDateString()} -{" "}
                        {new Date(booking.dropoffDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                      </svg>
                      <span>{booking.location}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <span className="font-semibold">{t("bookings.total")}</span>
                      <span className="font-bold text-lg">{formatCents(booking.totalPrice)}</span>
                    </div>
                  </div>

                  <BookingReviewSection
                    bookingId={booking.id}
                    locale={locale}
                    canLeaveReview={canLeaveReview}
                    copy={reviewCopy}
                    existingReview={
                      booking.review
                        ? {
                            id: booking.review.id,
                            rating: booking.review.rating,
                            comment: booking.review.comment,
                            createdAt: booking.review.createdAt.toISOString(),
                          }
                        : null
                    }
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <BottomNav active="trips" />
    </div>
  )
}
