"use client"

import type React from "react"
import { useCallback, useEffect, useState, useTransition } from "react"
import { useLocale } from "next-intl"
import { Link, useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { formatCents } from "@/lib/money"
import {
  createCar as createCarAction,
  updateCar as updateCarAction,
  deleteCar as deleteCarAction,
} from "@/app/actions/cars"
import {
  confirmTransferDeposit,
  closeRefundReviewWithoutRefund,
  recordBookingRefund,
  recordPickupPayment,
  resendBookingConfirmationAsAdmin,
  retryBookingNotification,
  updateBookingStatus,
} from "@/app/actions/bookings"
import { cancelBookingApplicationAsAdmin } from "@/app/actions/booking-applications"
import { deleteReviewAsAdmin } from "@/app/actions/reviews"
import {
  createAdminUser,
  setUserActiveState,
  deleteAdminUser,
  createManualReservation,
  deleteManualReservation,
} from "@/app/actions/admin"
import type { OwnerSetupProgress } from "@/lib/admin/owner-console"
import type { AdminCarPublishingStatus } from "@/lib/admin/car-publishing-status"
import { useToast } from "@/hooks/use-toast"
import {
  CarIcon,
  Calendar,
  Users,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Search,
  Filter,
  BarChart3,
  UserPlus,
  UserCheck,
  UserX,
  Trash2,
  MessageSquare,
  FileCheck2,
  ArrowRight,
  RefreshCw,
  Mail,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ManualReservationCalendar } from "@/components/admin/manual-reservation-calendar"
import { businessLocalDateTimeToInstant, instantToBusinessDateTimeLocal } from "@/lib/business-hours"
import { formatBookingDateTime } from "@/lib/booking-time-zone"

interface AdminUser {
  id: string
  name: string | null
  email: string
  role: "ADMIN" | "USER"
  isActive: boolean
  createdAt: string
}

interface AdminCar {
  id: string
  name: string
  nameDe?: string | null
  subtitle?: string | null
  subtitleDe?: string | null
  category: "ELECTRIC" | "LUXURY" | "SUV" | "SEDAN" | "EV"
  price: number
  image: string
  images: string[]
  status: "AVAILABLE" | "LOW_STOCK" | "RENTED" | "MAINTENANCE"
  pricingPublication: AdminCarPublishingStatus
  specs: {
    gearbox: string
    seats: number
    fuel: string
    acceleration: string
  }
  year: number | null
  rating: number
  reviews: number
  description?: string | null
  descriptionDe?: string | null
}

interface AdminBooking {
  id: string
  userId: string
  carId: string
  pickupDate: string
  dropoffDate: string
  businessTimeZone: string
  location: string
  totalPrice: number
  currency: string
  guaranteeAmount: number
  bookingNumber: string
  transferCode: string
  depositAmount: number
  advancePaymentAmount: number
  status: "PENDING" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "REJECTED"
  paymentStatus: "PENDING" | "DEPOSIT_PAID" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED"
  paymentMethod: "TRANSFER" | "PAY_AT_PICKUP"
  paymentDueAt: string | null
  amountReceived: number
  refundReviewStatus: "NOT_REQUIRED" | "PENDING" | "RESOLVED"
  paymentPolicy: {
    depositEnabled: boolean
    depositRateBps: number | null
    remainingBalanceRule: "NOT_APPLICABLE" | "ON_PICKUP" | "BEFORE_PICKUP"
  } | null
  emailDelivery: {
    id: string
    event: "CUSTOMER_TRANSFER_INSTRUCTIONS" | "CUSTOMER_CASH_CONFIRMATION" | "CUSTOMER_TRANSFER_CONFIRMED" | "CUSTOMER_TRANSFER_EXPIRED" | "CUSTOMER_ADVANCE_INSTRUCTIONS" | "CUSTOMER_BOOKING_CONFIRMED" | "CUSTOMER_BALANCE_RECEIPT" | "CUSTOMER_BOOKING_CANCELLED" | "CUSTOMER_REFUND_CONFIRMED" | "CUSTOMER_PAYMENT_EXPIRED" | "ADMIN_BOOKING_CREATED"
    status: "PENDING" | "PROCESSING" | "SENT" | "FAILED"
    sentAt: string | null
    lastErrorCode: string | null
  } | null
  createdAt: string
  insurance: { name: string; subtotal: number } | null
  legalAcceptances: Array<{
    id: string
    type: "RENTAL_TERMS" | "PRIVACY_NOTICE"
    title: string
    versionNumber: number
    locale: string
    translationId: string
    acceptedAt: string
    source: "CUSTOMER_CHECKBOX" | "CUSTOMER_SUBMISSION" | "STAFF_RECORDED"
    hasExactProvenance: boolean
    hashVerified: boolean
  }>
  customer: {
    name: string
    email: string
    phone: string | null
    dateOfBirth: string | null
    licenceNumber: string | null
    validatedAt: string | null
  } | null
  provenance: {
    configurationReleaseId: string | null
    insuranceConfigVersionId: string | null
    customerDriverConfigVersionId: string | null
    legalAcceptanceConfigVersionId: string | null
  }
}

interface AdminBookingApplication {
  id: string
  userId: string
  carId: string
  status:
    | "DRAFT"
    | "AWAITING_DOCUMENT_UPLOAD"
    | "AWAITING_DOCUMENT_REVIEW"
    | "CUSTOMER_ACTION_REQUIRED"
    | "READY_TO_FINALIZE"
    | "FINALIZING"
    | "FINALIZED"
    | "EXPIRED"
    | "CANCELLED"
    | "REJECTED"
  revision: number
  pickupDate: string
  dropoffDate: string
  businessTimeZone: string
  location: string
  totalPrice: number | null
  currency: string
  paymentMethod: "TRANSFER" | "PAY_AT_PICKUP"
  updatedAt: string
}

interface AdminManualReservation {
  id: string
  carId: string
  customerName: string
  customerPhone: string
  totalPrice: number
  pickupDate: string
  dropoffDate: string
  createdAt: string
}

interface AdminReview {
  id: string
  rating: number
  comment: string
  createdAt: string
  carId: string
  carName: string
  carNameDe?: string | null
  bookingNumber: string
  userName: string | null
  userEmail: string
}

const ADMIN_SECTIONS = new Set(["overview", "cars", "bookings", "users", "reviews", "analytics"])

export default function AdminDashboard({
  currentUser,
  cars,
  bookings,
  bookingApplications,
  users,
  reviews,
  manualReservations,
  initialSection,
  generatedAt,
  businessTimeZone,
  setup,
  documentReviewCount,
  canReviewDocuments,
}: {
  currentUser: { id: string; name: string; email: string }
  cars: AdminCar[]
  bookings: AdminBooking[]
  bookingApplications: AdminBookingApplication[]
  users: AdminUser[]
  reviews: AdminReview[]
  manualReservations: AdminManualReservation[]
  initialSection: string
  generatedAt: string
  businessTimeZone: string
  setup: OwnerSetupProgress
  documentReviewCount: number | null
  canReviewDocuments: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [carsState, setCarsState] = useState<AdminCar[]>(cars)
  const [bookingsState, setBookingsState] = useState<AdminBooking[]>(bookings)
  const [bookingApplicationsState, setBookingApplicationsState] = useState<AdminBookingApplication[]>(bookingApplications)
  const [usersState, setUsersState] = useState<AdminUser[]>(users)
  const [reviewsState, setReviewsState] = useState<AdminReview[]>(reviews)
  const [manualReservationsState, setManualReservationsState] = useState<AdminManualReservation[]>(manualReservations)
  const [activeTab, setActiveTab] = useState(initialSection)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false)
  const [editCarId, setEditCarId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>(initialSection === "bookings" ? "active" : "all")
  const locale = useLocale()
  const tr = (english: string, german: string) => (locale === "de" ? german : english)
  const actionError = (message: string) => tr(message, "Der Vorgang konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.")
  const router = useRouter()
  const { toast } = useToast()

  const selectSection = (section: string) => {
    if (!ADMIN_SECTIONS.has(section)) return
    setActiveTab(section)
    setSearchTerm("")
    setFilterStatus(section === "bookings" ? "active" : "all")

    const destination = new URL(window.location.href)
    if (section === "overview") destination.searchParams.delete("section")
    else destination.searchParams.set("section", section)
    window.history.pushState(null, "", `${destination.pathname}${destination.search}`)
  }

  useEffect(() => {
    const applySection = (section: string | null) => {
      const nextSection = section && ADMIN_SECTIONS.has(section) ? section : "overview"
      setActiveTab(nextSection)
      setSearchTerm("")
      setFilterStatus(nextSection === "bookings" ? "active" : "all")
    }
    const handleSectionChange = (event: Event) => {
      applySection((event as CustomEvent<{ section?: string }>).detail?.section ?? null)
    }
    const handleHistoryChange = () => {
      applySection(new URL(window.location.href).searchParams.get("section"))
    }

    window.addEventListener("admin:section-change", handleSectionChange)
    window.addEventListener("popstate", handleHistoryChange)
    return () => {
      window.removeEventListener("admin:section-change", handleSectionChange)
      window.removeEventListener("popstate", handleHistoryChange)
    }
  }, [])

  const getLocalizedText = (valueEn: string, valueDe?: string | null) => {
    return locale === "de" ? valueDe || valueEn : valueEn
  }

  const getCarName = (car: Pick<AdminCar, "name" | "nameDe">) => getLocalizedText(car.name, car.nameDe)
  const getCarSubtitle = (car: Pick<AdminCar, "subtitle" | "subtitleDe">) =>
    locale === "de" ? car.subtitleDe || car.subtitle : car.subtitle
  const getReviewCarName = (review: Pick<AdminReview, "carName" | "carNameDe">) =>
    getLocalizedText(review.carName, review.carNameDe)
  const normalizedSearch = searchTerm.trim().toLowerCase()

  // Helper function to get booking status badge styling
  const getBookingStatusBadge = (status: AdminBooking["status"]) => {
    switch (status) {
      case "PENDING":
        return {
          className: "bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200",
          variant: "outline" as const,
        }
      case "CONFIRMED":
        return {
          className: "bg-green-100 text-green-800 border-green-200 hover:bg-green-200",
          variant: "outline" as const,
        }
      case "IN_PROGRESS":
        return {
          className: "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200",
          variant: "outline" as const,
        }
      case "COMPLETED":
        return {
          className: "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200",
          variant: "outline" as const,
        }
      case "CANCELLED":
      case "REJECTED":
        return {
          className: "bg-red-100 text-red-800 border-red-200 hover:bg-red-200",
          variant: "outline" as const,
        }
      default:
        return {
          className: "",
          variant: "secondary" as const,
        }
    }
  }

  const revenueBookings = bookingsState.filter((booking) => booking.amountReceived > 0)
  const totalRevenueCents = revenueBookings.reduce((sum, booking) => sum + booking.amountReceived, 0)
  const activeBookings = bookingsState.filter((b) => b.status === "CONFIRMED").length
  const pendingBookings = bookingsState.filter((b) => b.status === "PENDING").length
  const completedBookings = bookingsState.filter((b) => b.status === "COMPLETED").length
  const availableCars = carsState.filter(
    (car) =>
      (car.status === "AVAILABLE" || car.status === "LOW_STOCK") &&
      (car.pricingPublication === "PUBLISHED" || car.pricingPublication === "PUBLISHED_WITH_CHANGES"),
  ).length
  const rentedCars = carsState.filter((c) => c.status === "RENTED").length
  const unavailableCars = carsState.filter(
    (car) =>
      car.status === "MAINTENANCE" ||
      car.pricingPublication === "DRAFT" ||
      car.pricingPublication === "NEEDS_PRICING",
  ).length
  const unpublishedPricingCars = carsState.filter(
    (car) => car.pricingPublication === "DRAFT" || car.pricingPublication === "NEEDS_PRICING",
  )
  const generatedAtTimestamp = new Date(generatedAt).getTime()
  const upcomingBookings = bookingsState
    .filter(
      (booking) =>
        new Date(booking.pickupDate).getTime() >= generatedAtTimestamp &&
        !["CANCELLED", "REJECTED", "COMPLETED"].includes(booking.status),
    )
    .sort((a, b) => new Date(a.pickupDate).getTime() - new Date(b.pickupDate).getTime())
  const now = new Date(generatedAt)
  const revenueThisMonthCents = revenueBookings
    .filter((b) => {
      const bookingDate = new Date(b.createdAt)
      return bookingDate.getMonth() === now.getMonth() && bookingDate.getFullYear() === now.getFullYear()
    })
    .reduce((sum, booking) => sum + booking.amountReceived, 0)
  const customerCount = usersState.filter((user) => user.role === "USER").length
  const pendingApplicationReviews = bookingApplicationsState.filter(
    (application) => application.status === "AWAITING_DOCUMENT_REVIEW",
  ).length
  const displayedDocumentReviewCount = canReviewDocuments ? (documentReviewCount ?? pendingApplicationReviews) : pendingApplicationReviews
  const attentionCount = pendingBookings + unavailableCars + displayedDocumentReviewCount

  const applicationStatusCopy = (status: AdminBookingApplication["status"]) => {
    const labels: Record<AdminBookingApplication["status"], { en: string; de: string }> = {
      DRAFT: { en: "In progress", de: "In Bearbeitung" },
      AWAITING_DOCUMENT_UPLOAD: { en: "Documents required", de: "Dokumente erforderlich" },
      AWAITING_DOCUMENT_REVIEW: { en: "Awaiting document review", de: "Dokumentenprüfung ausstehend" },
      CUSTOMER_ACTION_REQUIRED: { en: "Customer action required", de: "Kundenaktion erforderlich" },
      READY_TO_FINALIZE: { en: "Ready for automatic confirmation", de: "Bereit zur automatischen Bestätigung" },
      FINALIZING: { en: "Finalizing", de: "Wird abgeschlossen" },
      FINALIZED: { en: "Finalized", de: "Abgeschlossen" },
      EXPIRED: { en: "Expired", de: "Abgelaufen" },
      CANCELLED: { en: "Cancelled", de: "Storniert" },
      REJECTED: { en: "Rejected", de: "Abgelehnt" },
    }
    return tr(labels[status].en, labels[status].de)
  }

  const formatAdminDate = (value: string, timeZone = businessTimeZone) =>
    formatBookingDateTime(value, locale, timeZone, { dateStyle: "medium" })
  const formatAdminDateTime = (value: string, timeZone = businessTimeZone) =>
    formatBookingDateTime(value, locale, timeZone)

  const filteredCars = carsState.filter((car) => {
    const matchesSearch =
      normalizedSearch === "" ||
      car.name.toLowerCase().includes(normalizedSearch) ||
      (car.nameDe || "").toLowerCase().includes(normalizedSearch)
    const matchesFilter = filterStatus === "all" || car.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const filteredBookings = bookingsState.filter((booking) => {
    const car = carsState.find((c) => c.id === booking.carId)
    const user = usersState.find((u) => u.id === booking.userId)
    const matchesSearch =
      normalizedSearch === "" ||
      car?.name.toLowerCase().includes(normalizedSearch) ||
      (car?.nameDe || "").toLowerCase().includes(normalizedSearch) ||
      user?.name?.toLowerCase().includes(normalizedSearch) ||
      user?.email.toLowerCase().includes(normalizedSearch)
    const matchesFilter =
      filterStatus === "all" ||
      (filterStatus === "active" && !["CANCELLED", "REJECTED", "COMPLETED"].includes(booking.status)) ||
      booking.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const filteredUsers = usersState.filter(
    (u) => (u.name || "").toLowerCase().includes(normalizedSearch) || u.email.toLowerCase().includes(normalizedSearch),
  )

  const filteredReviews = reviewsState.filter((review) => {
    return (
      normalizedSearch === "" ||
      review.comment.toLowerCase().includes(normalizedSearch) ||
      review.carName.toLowerCase().includes(normalizedSearch) ||
      (review.carNameDe || "").toLowerCase().includes(normalizedSearch) ||
      (review.userName || "").toLowerCase().includes(normalizedSearch) ||
      review.userEmail.toLowerCase().includes(normalizedSearch) ||
      review.bookingNumber.toLowerCase().includes(normalizedSearch)
    )
  })

  const filteredManualReservations = manualReservationsState
    .filter((reservation) => {
      const car = carsState.find((item) => item.id === reservation.carId)
      return (
        normalizedSearch === "" ||
        reservation.customerName.toLowerCase().includes(normalizedSearch) ||
        reservation.customerPhone.toLowerCase().includes(normalizedSearch) ||
        car?.name.toLowerCase().includes(normalizedSearch) ||
        (car?.nameDe || "").toLowerCase().includes(normalizedSearch)
      )
    })
    .sort((a, b) => new Date(a.pickupDate).getTime() - new Date(b.pickupDate).getTime())

  const normalizeAdminUser = (user: {
    id: string
    name: string | null
    email: string
    role: "ADMIN" | "USER"
    isActive: boolean
    createdAt: string | Date
  }): AdminUser => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: typeof user.createdAt === "string" ? user.createdAt : user.createdAt.toISOString(),
  })

  const handleCreateUser = (userData: UserFormValues) => {
    startTransition(async () => {
      const result = await createAdminUser(userData)
      if (result?.error) {
        toast({
          title: tr("Error", "Fehler"),
          description: actionError(result.error),
          variant: "destructive",
        })
        return
      }

      if (result?.user) {
        setUsersState((prev) => [normalizeAdminUser(result.user), ...prev])
        setIsAddUserDialogOpen(false)
        toast({
          title: tr("Success", "Erfolg"),
          description: tr("User created successfully.", "Benutzer wurde erfolgreich erstellt."),
          variant: "default",
        })
      }
    })
  }

  const handleToggleUserActive = (targetUser: AdminUser) => {
    const nextState = !targetUser.isActive
    const displayName = targetUser.name || targetUser.email

    if (!confirm(nextState
      ? tr(`Are you sure you want to activate ${displayName}?`, `Möchten Sie ${displayName} wirklich aktivieren?`)
      : tr(`Are you sure you want to deactivate ${displayName}?`, `Möchten Sie ${displayName} wirklich deaktivieren?`))) {
      return
    }

    startTransition(async () => {
      const result = await setUserActiveState({
        userId: targetUser.id,
        isActive: nextState,
      })

      if (result?.error) {
        toast({
          title: tr("Error", "Fehler"),
          description: actionError(result.error),
          variant: "destructive",
        })
        return
      }

      if (result?.user) {
        setUsersState((prev) =>
          prev.map((user) => (user.id === targetUser.id ? normalizeAdminUser(result.user) : user)),
        )
        toast({
          title: tr("Success", "Erfolg"),
          description: nextState
            ? tr(`${displayName} has been activated.`, `${displayName} wurde aktiviert.`)
            : tr(`${displayName} has been deactivated.`, `${displayName} wurde deaktiviert.`),
          variant: "default",
        })
      }
    })
  }

  const handleDeleteUser = (targetUser: AdminUser) => {
    const displayName = targetUser.name || targetUser.email
    if (!confirm(tr(`Delete ${displayName}? This action cannot be undone.`, `${displayName} löschen? Diese Aktion kann nicht rückgängig gemacht werden.`))) {
      return
    }

    startTransition(async () => {
      const result = await deleteAdminUser(targetUser.id)
      if (result?.error) {
        toast({
          title: tr("Error", "Fehler"),
          description: actionError(result.error),
          variant: "destructive",
        })
        return
      }

      setUsersState((prev) => prev.filter((user) => user.id !== targetUser.id))
      toast({
        title: tr("Success", "Erfolg"),
        description: tr("User deleted successfully.", "Benutzer wurde erfolgreich gelöscht."),
        variant: "default",
      })
    })
  }

  const mapCar = (car: {
    id: string
    name: string
    nameDe?: string | null
    subtitle?: string | null
    subtitleDe?: string | null
    category: AdminCar["category"]
    price: number
    image: string
    images: string[]
    status: AdminCar["status"]
    pricingPublication?: AdminCarPublishingStatus
    gearbox: string
    seats: number
    fuelType: string
    acceleration: string
    year?: number | null
    rating: number
    reviewCount: number
    description?: string | null
    descriptionDe?: string | null
  }): AdminCar => ({
    id: car.id,
    name: car.name,
    nameDe: car.nameDe,
    subtitle: car.subtitle,
    subtitleDe: car.subtitleDe,
    category: car.category,
    price: car.price,
    image: car.image,
    images: car.images || [],
    status: car.status,
    pricingPublication: car.pricingPublication ?? "NEEDS_PRICING",
    specs: {
      gearbox: car.gearbox,
      seats: car.seats,
      fuel: car.fuelType,
      acceleration: car.acceleration,
    },
    year: car.year ?? null,
    rating: car.rating,
    reviews: car.reviewCount,
    description: car.description,
    descriptionDe: car.descriptionDe,
  })

  const handleCreateCar = (car: CarFormValues) => {
    startTransition(async () => {
      try {
        const result = await createCarAction({
          name: car.name,
          nameDe: car.nameDe,
          subtitle: car.subtitle || undefined,
          subtitleDe: car.subtitleDe || undefined,
          description: car.description,
          descriptionDe: car.descriptionDe,
          category: car.category,
          price: Math.round(car.price * 100),
          image: car.image,
          images: car.images,
          status: car.status,
          gearbox: car.gearbox,
          seats: car.seats,
          fuelType: car.fuelType,
          acceleration: car.acceleration,
          year: car.year,
        })

        if (result?.car) {
          const pricingPublication: AdminCarPublishingStatus =
            result.bookingStatus === "ACTIVE"
              ? "PUBLISHED"
              : result.bookingStatus === "PENDING_REVIEW" || result.bookingStatus === "SETUP_DRAFT"
                ? "DRAFT"
                : "NEEDS_PRICING"
          setCarsState((prev) => [mapCar({ ...result.car, pricingPublication }), ...prev])
          setIsAddDialogOpen(false)
          const bookingMessage = result.bookingStatus === "ACTIVE"
            ? tr("Car created and published for online booking.", "Das Fahrzeug wurde erstellt und für Online-Buchungen veröffentlicht.")
            : result.bookingStatus === "PENDING_REVIEW"
              ? tr("Car created with pricing. Publish your pending settings before customers can book it.", "Das Fahrzeug wurde mit Preis erstellt. Veröffentlichen Sie die ausstehenden Einstellungen, bevor Kunden es buchen können.")
              : result.bookingStatus === "SETUP_DRAFT"
                ? tr("Car created with pricing. It will become bookable when business setup is completed.", "Das Fahrzeug wurde mit Preis erstellt. Es wird buchbar, sobald die Unternehmenseinrichtung abgeschlossen ist.")
                : tr("Car created, but its pricing needs attention before customers can book it.", "Das Fahrzeug wurde erstellt, aber die Preise müssen geprüft werden, bevor Kunden es buchen können.")
          toast({
            title: tr("Success", "Erfolg"),
            description: bookingMessage,
            variant: "default",
          })
        } else if (result?.error) {
          // Handle validation errors with detailed messages
          if (result.validationErrors && Array.isArray(result.validationErrors)) {
            toast({
              title: tr("Please check the car details", "Bitte prüfen Sie die Fahrzeugangaben"),
              description: (
                <div className="space-y-1">
                  <p className="font-medium">{tr("Please fix the following errors:", "Bitte beheben Sie die folgenden Fehler:")}</p>
                  <ul className="list-disc list-inside space-y-0.5 text-sm">
                    {result.validationErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              ),
              variant: "destructive",
            })
          } else {
            toast({
              title: tr("Error", "Fehler"),
              description: actionError(result.error),
              variant: "destructive",
            })
          }
        }
      } catch (error) {
        console.error(error)
        toast({
          title: tr("Error", "Fehler"),
          description: tr("Failed to create car. Please try again.", "Das Fahrzeug konnte nicht erstellt werden. Bitte versuchen Sie es erneut."),
          variant: "destructive",
        })
      }
    })
  }

  const handleUpdateCar = (carId: string, updates: CarFormValues) => {
    startTransition(async () => {
      try {
        const result = await updateCarAction(carId, {
          name: updates.name,
          nameDe: updates.nameDe,
          subtitle: updates.subtitle || undefined,
          subtitleDe: updates.subtitleDe || undefined,
          description: updates.description,
          descriptionDe: updates.descriptionDe,
          category: updates.category,
          price: Math.round(updates.price * 100),
          image: updates.image,
          images: updates.images,
          status: updates.status,
          gearbox: updates.gearbox,
          seats: updates.seats,
          fuelType: updates.fuelType,
          acceleration: updates.acceleration,
          year: updates.year,
        })

        if (result?.car) {
          setCarsState((prev) =>
            prev.map((car) =>
              car.id === carId
                ? mapCar({ ...result.car, pricingPublication: car.pricingPublication })
                : car,
            ),
          )
          setEditCarId((current) => (current === carId ? null : current))
          toast({
            title: tr("Success", "Erfolg"),
            description: tr("Car updated successfully!", "Fahrzeug wurde erfolgreich aktualisiert!"),
            variant: "default",
          })
        } else if (result?.error) {
          // Handle validation errors with detailed messages
          if (result.validationErrors && Array.isArray(result.validationErrors)) {
            toast({
              title: tr("Please check the car details", "Bitte prüfen Sie die Fahrzeugangaben"),
              description: (
                <div className="space-y-1">
                  <p className="font-medium">{tr("Please fix the following errors:", "Bitte beheben Sie die folgenden Fehler:")}</p>
                  <ul className="list-disc list-inside space-y-0.5 text-sm">
                    {result.validationErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              ),
              variant: "destructive",
            })
          } else {
            toast({
              title: tr("Error", "Fehler"),
              description: actionError(result.error),
              variant: "destructive",
            })
          }
        }
      } catch (error) {
        console.error(error)
        toast({
          title: tr("Error", "Fehler"),
          description: tr("Failed to update car. Please try again.", "Das Fahrzeug konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut."),
          variant: "destructive",
        })
      }
    })
  }

  const handleDeleteCar = (carId: string) => {
    startTransition(async () => {
      const result = await deleteCarAction(carId)
      if (result?.error) {
        toast({
          title: tr("Error", "Fehler"),
          description: actionError(result.error),
          variant: "destructive",
        })
        return
      }
      setCarsState((prev) => prev.filter((car) => car.id !== carId))
      toast({
        title: tr("Success", "Erfolg"),
        description: tr("Car deleted successfully!", "Fahrzeug wurde erfolgreich gelöscht!"),
        variant: "default",
      })
    })
  }

  const handleUpdateBookingStatus = (bookingId: string, status: AdminBooking["status"], reason?: string) => {
    startTransition(async () => {
      const result = await updateBookingStatus({ bookingId, status, reason })
      if (result?.error) {
        toast({ title: tr("Booking could not be updated", "Buchung konnte nicht aktualisiert werden"), description: actionError(result.error), variant: "destructive" })
        return
      }
      setBookingsState((prev) => prev.map((booking) => (booking.id === bookingId ? { ...booking, status } : booking)))
      toast({
        title: status === "CANCELLED" ? tr("Booking cancelled", "Buchung storniert") : tr("Booking updated", "Buchung aktualisiert"),
        description: status === "CANCELLED"
          ? tr("The booking no longer blocks the car's dates. Its audit record has been retained.", "Die Buchung blockiert die Fahrzeugdaten nicht mehr. Der Prüfverlauf wurde aufbewahrt.")
          : tr("The booking status was saved.", "Der Buchungsstatus wurde gespeichert."),
      })
    })
  }

  const handleCancelBooking = (booking: AdminBooking) => {
    if (!confirm(tr(
      "Cancel this booking? The dates will be released and the customer will be notified. The legal audit record will be retained.",
      "Diese Buchung stornieren? Die Daten werden freigegeben und der Kunde wird benachrichtigt. Der rechtliche Prüfverlauf bleibt erhalten.",
    ))) return
    const reason = prompt(tr("Reason for cancellation:", "Grund für die Stornierung:"))?.trim()
    if (!reason) return
    handleUpdateBookingStatus(booking.id, "CANCELLED", reason)
  }

  const handleConfirmTransferDeposit = (booking: AdminBooking) => {
    if (!confirm(tr(
      `Confirm receipt of ${formatCents(booking.advancePaymentAmount || booking.depositAmount || booking.totalPrice, booking.currency)} and confirm this booking?`,
      `Eingang von ${formatCents(booking.advancePaymentAmount || booking.depositAmount || booking.totalPrice, booking.currency)} bestätigen und diese Buchung freigeben?`,
    ))) return
    startTransition(async () => {
      const result = await confirmTransferDeposit({ bookingId: booking.id })
      if (result?.error) {
        toast({ title: tr("Payment could not be confirmed", "Zahlung konnte nicht bestätigt werden"), description: actionError(result.error), variant: "destructive" })
        return
      }
      if (!("success" in result) || !result.success) return
      setBookingsState((previous) => previous.map((item) => item.id === booking.id
        ? {
            ...item,
            status: "CONFIRMED",
            paymentStatus: result.paymentStatus,
            paymentDueAt: null,
            amountReceived: item.amountReceived + result.amountReceived,
          }
        : item))
      toast({
        title: tr("Deposit received", "Anzahlung eingegangen"),
        description: result.confirmationEmailSent
          ? tr("The booking is confirmed and the pickup email was sent.", "Die Buchung ist bestätigt und die Abhol-E-Mail wurde gesendet.")
          : tr("The booking is confirmed. Email delivery is queued for retry.", "Die Buchung ist bestätigt. Die E-Mail-Zustellung wird erneut versucht."),
      })
      router.refresh()
    })
  }

  const handleRecordRefund = (booking: AdminBooking) => {
    const refundable = Math.max(booking.amountReceived, 0)
    const rawAmount = prompt(tr(
      `Refund amount in EUR (maximum ${(refundable / 100).toFixed(2)}):`,
      `Erstattungsbetrag in EUR (maximal ${(refundable / 100).toFixed(2)}):`,
    ), (refundable / 100).toFixed(2))
    if (!rawAmount) return
    const amount = Math.round(Number(rawAmount.replace(",", ".")) * 100)
    const reason = prompt(tr("Reason for this refund:", "Grund für diese Erstattung:"))?.trim()
    if (!Number.isInteger(amount) || amount <= 0 || !reason) return
    startTransition(async () => {
      const result = await recordBookingRefund({ bookingId: booking.id, amount, reason })
      if (result?.error) {
        toast({ title: tr("Refund could not be recorded", "Erstattung konnte nicht erfasst werden"), description: actionError(result.error), variant: "destructive" })
        return
      }
      toast({ title: tr("Refund recorded", "Erstattung erfasst"), description: tr("The ledger and customer notification were updated.", "Zahlungsverlauf und Kundenbenachrichtigung wurden aktualisiert.") })
      router.refresh()
    })
  }

  const handleCloseRefundReview = (booking: AdminBooking) => {
    const reason = prompt(tr("Why is no further refund due?", "Warum ist keine weitere Erstattung fällig?"))?.trim()
    if (!reason) return
    startTransition(async () => {
      const result = await closeRefundReviewWithoutRefund({ bookingId: booking.id, reason })
      if (result?.error) {
        toast({ title: tr("Refund review could not be closed", "Erstattungsprüfung konnte nicht abgeschlossen werden"), description: actionError(result.error), variant: "destructive" })
        return
      }
      toast({ title: tr("Refund review resolved", "Erstattungsprüfung abgeschlossen") })
      router.refresh()
    })
  }

  const handleRecordPickupPayment = (booking: AdminBooking) => {
    const outstanding = Math.max(booking.totalPrice - booking.amountReceived, 0)
    if (!confirm(tr(
      `Confirm that ${formatCents(outstanding, booking.currency)} was collected at pickup?`,
      `Bestätigen, dass ${formatCents(outstanding, booking.currency)} bei der Abholung bezahlt wurde?`,
    ))) return
    startTransition(async () => {
      const result = await recordPickupPayment({ bookingId: booking.id })
      if (result?.error) {
        toast({ title: tr("Payment could not be recorded", "Zahlung konnte nicht erfasst werden"), description: actionError(result.error), variant: "destructive" })
        return
      }
      if (!("success" in result) || !result.success) return
      setBookingsState((previous) => previous.map((item) => item.id === booking.id
        ? { ...item, paymentStatus: "PAID", amountReceived: item.amountReceived + result.amountReceived }
        : item))
      toast({ title: tr("Pickup payment recorded", "Abholzahlung erfasst"), description: tr("Revenue and the booking payment status were updated.", "Umsatz und Zahlungsstatus der Buchung wurden aktualisiert.") })
      router.refresh()
    })
  }

  const handleRetryNotification = (booking: AdminBooking) => {
    if (!booking.emailDelivery) return
    startTransition(async () => {
      const result = await retryBookingNotification({ deliveryId: booking.emailDelivery!.id })
      if (result?.error) {
        toast({ title: tr("Email retry failed", "Erneuter E-Mail-Versand fehlgeschlagen"), description: actionError(result.error), variant: "destructive" })
        return
      }
      toast({ title: tr("Email delivered", "E-Mail zugestellt"), description: tr("The customer notification was sent through Gmail SMTP.", "Die Kundenbenachrichtigung wurde über Gmail SMTP gesendet.") })
      router.refresh()
    })
  }

  const handleCancelApplication = (application: AdminBookingApplication) => {
    if (!confirm(tr(
      "Cancel and remove this application from the active list? No booking will be created.",
      "Diesen Antrag stornieren und aus der aktiven Liste entfernen? Es wird keine Buchung erstellt.",
    ))) return
    startTransition(async () => {
      const result = await cancelBookingApplicationAsAdmin({
        applicationId: application.id,
        expectedRevision: application.revision,
        reason: "Cancelled and removed from the active application list by administrator.",
      })
      if (result?.error) {
        toast({ title: tr("Application could not be cancelled", "Antrag konnte nicht storniert werden"), description: actionError(result.error), variant: "destructive" })
        return
      }
      setBookingApplicationsState((previous) => previous.filter((item) => item.id !== application.id))
      toast({ title: tr("Application removed", "Antrag entfernt"), description: tr("No booking was created. The audit record was retained.", "Es wurde keine Buchung erstellt. Der Prüfverlauf wurde aufbewahrt.") })
    })
  }

  const handleResendConfirmation = (bookingId: string) => {
    startTransition(async () => {
      const result = await resendBookingConfirmationAsAdmin({ bookingId })
      if (result?.error) {
        toast({ title: tr("Email could not be sent", "E-Mail konnte nicht gesendet werden"), description: actionError(result.error), variant: "destructive" })
        return
      }
      toast({ title: tr("Confirmation email sent", "Bestätigungs-E-Mail gesendet"), description: tr(`Delivered to ${result.customerEmail}.`, `An ${result.customerEmail} zugestellt.`) })
    })
  }

  const handleCreateManualReservation = (reservation: ManualReservationFormValues) => {
    startTransition(async () => {
      const pickupDate = businessLocalDateTimeToInstant(reservation.pickupDate, businessTimeZone)
      const dropoffDate = businessLocalDateTimeToInstant(reservation.dropoffDate, businessTimeZone)

      if (!pickupDate || !dropoffDate) {
        toast({
          title: tr("Error", "Fehler"),
          description: tr("Please select valid pickup and drop-off date/time values.", "Bitte wählen Sie gültige Abhol- und Rückgabedaten mit Uhrzeit."),
          variant: "destructive",
        })
        return
      }

      const result = await createManualReservation({
        carId: reservation.carId,
        customerName: reservation.customerName.trim(),
        customerPhone: reservation.customerPhone.trim(),
        pickupDate: pickupDate.toISOString(),
        dropoffDate: dropoffDate.toISOString(),
        totalPrice: Math.round(reservation.totalPrice * 100),
      })

      if (result?.error) {
        toast({
          title: tr("Error", "Fehler"),
          description: actionError(result.error),
          variant: "destructive",
        })
        return
      }

      if (result?.reservation) {
        setManualReservationsState((prev) => [result.reservation, ...prev])
        toast({
          title: tr("Success", "Erfolg"),
          description: tr("Manual reservation created and car availability has been blocked for that period.", "Die manuelle Reservierung wurde erstellt und das Fahrzeug für diesen Zeitraum gesperrt."),
          variant: "default",
        })
      }
    })
  }

  const handleDeleteManualReservation = (reservationId: string) => {
    if (!confirm(tr("Remove this manual reservation and make the car available again for those dates?", "Diese manuelle Reservierung entfernen und das Fahrzeug für diesen Zeitraum wieder freigeben?"))) {
      return
    }

    startTransition(async () => {
      const result = await deleteManualReservation(reservationId)
      if (result?.error) {
        toast({
          title: tr("Error", "Fehler"),
          description: actionError(result.error),
          variant: "destructive",
        })
        return
      }

      setManualReservationsState((prev) => prev.filter((reservation) => reservation.id !== reservationId))
      toast({
        title: tr("Success", "Erfolg"),
        description: tr("Manual reservation removed successfully.", "Die manuelle Reservierung wurde erfolgreich entfernt."),
        variant: "default",
      })
    })
  }

  const handleDeleteReview = (review: AdminReview) => {
    const displayCarName = getReviewCarName(review)
    if (!confirm(tr(`Delete this review for ${displayCarName}? This action cannot be undone.`, `Diese Bewertung für ${displayCarName} löschen? Diese Aktion kann nicht rückgängig gemacht werden.`))) {
      return
    }

    startTransition(async () => {
      const result = await deleteReviewAsAdmin(review.id)
      if (!result.success) {
        toast({
          title: tr("Error", "Fehler"),
          description: actionError(result.error),
          variant: "destructive",
        })
        return
      }

      setReviewsState((prev) => prev.filter((item) => item.id !== review.id))
      if (result.carId) {
        setCarsState((prev) =>
          prev.map((car) =>
            car.id === result.carId
              ? {
                  ...car,
                  rating: result.carRating ?? car.rating,
                  reviews: result.carReviewCount ?? car.reviews,
                }
              : car,
          ),
        )
      }

      toast({
        title: tr("Success", "Erfolg"),
        description: tr("Review deleted successfully.", "Bewertung wurde erfolgreich gelöscht."),
        variant: "default",
      })
    })
  }

  return (
    <main className="mx-auto w-full max-w-7xl overflow-x-hidden p-4 sm:p-6 lg:p-8">
      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-primary">{tr("Today", "Heute")}</p>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{tr("Your business at a glance", "Ihr Unternehmen auf einen Blick")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{tr("The numbers and actions that matter today.", "Die wichtigsten Zahlen und Aufgaben für heute.")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => startTransition(() => router.refresh())}
              >
                <RefreshCw className={isPending ? "animate-spin" : undefined} aria-hidden="true" />
                {tr("Refresh data", "Daten aktualisieren")}
              </Button>
              <Button type="button" onClick={() => selectSection("bookings")}>
                {tr("View bookings", "Buchungen anzeigen")} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </header>

          {!setup.readyForBookings ? (
            <Card className="overflow-hidden border-primary/20 bg-primary/[0.025]">
              <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{setup.percent}% {tr("complete", "abgeschlossen")}</Badge>
                    <span className="text-sm text-muted-foreground">{tr("Your progress is saved", "Ihr Fortschritt wurde gespeichert")}</span>
                  </div>
                  <h2 className="mt-3 text-xl font-semibold">{tr("Finish setting up your business", "Unternehmenseinrichtung abschließen")}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {tr("Continue the guided setup. You will only see one clear step at a time.", "Fahren Sie mit der geführten Einrichtung fort. Sie sehen jeweils nur den nächsten klaren Schritt.")}
                  </p>
                  <div className="mt-4 h-2 max-w-lg overflow-hidden rounded-full bg-primary/10" aria-label={tr(`${setup.percent}% setup complete`, `${setup.percent}% der Einrichtung abgeschlossen`)}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${setup.percent}%` }} />
                  </div>
                </div>
                <Button asChild size="lg" className="shrink-0">
                  <Link href="/admin/settings">
                    {tr("Continue setup", "Einrichtung fortsetzen")} <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>{tr("Your business is ready", "Ihr Unternehmen ist startklar")}</AlertTitle>
              <AlertDescription>{tr("Essential setup is complete and customers can use the current settings.", "Die grundlegende Einrichtung ist abgeschlossen und Kunden können die aktuellen Einstellungen verwenden.")}</AlertDescription>
            </Alert>
          )}

          <section aria-labelledby="business-numbers-title">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="business-numbers-title" className="text-lg font-semibold">{tr("Key numbers", "Kennzahlen")}</h2>
              <span className="text-xs text-muted-foreground">{tr("Updated now", "Gerade aktualisiert")}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardContent className="p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><DollarSign className="h-5 w-5" /></span>
                  <p className="mt-4 text-sm text-muted-foreground">{tr("Income this month", "Einnahmen in diesem Monat")}</p>
                  <p className="mt-1 text-2xl font-bold">{formatCents(revenueThisMonthCents)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatCents(totalRevenueCents)} {tr("total confirmed income", "bestätigte Einnahmen insgesamt")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Calendar className="h-5 w-5" /></span>
                  <p className="mt-4 text-sm text-muted-foreground">{tr("Upcoming bookings", "Bevorstehende Buchungen")}</p>
                  <p className="mt-1 text-2xl font-bold">{upcomingBookings.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{pendingBookings} {tr("waiting for your approval", "warten auf Ihre Freigabe")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><CarIcon className="h-5 w-5" /></span>
                  <p className="mt-4 text-sm text-muted-foreground">{tr("Cars", "Fahrzeuge")}</p>
                  <p className="mt-1 text-2xl font-bold">{carsState.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{availableCars} {tr("available", "verfügbar")} · {rentedCars} {tr("rented", "vermietet")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-700"><Users className="h-5 w-5" /></span>
                  <p className="mt-4 text-sm text-muted-foreground">{tr("Customers", "Kunden")}</p>
                  <p className="mt-1 text-2xl font-bold">{customerCount}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{tr("Registered customer accounts", "Registrierte Kundenkonten")}</p>
                </CardContent>
              </Card>
            </div>
          </section>

          <Card className={attentionCount > 0 ? "border-amber-200" : "border-emerald-200"}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>{attentionCount > 0 ? tr("What needs attention", "Was Ihre Aufmerksamkeit benötigt") : tr("Everything is under control", "Alles unter Kontrolle")}</CardTitle>
                  <CardDescription>{attentionCount > 0 ? tr(`${attentionCount} items may need you today.`, `${attentionCount} Punkte könnten heute Ihre Aufmerksamkeit benötigen.`) : tr("There are no urgent actions right now.", "Derzeit sind keine dringenden Aufgaben offen.")}</CardDescription>
                </div>
                <Badge variant={attentionCount > 0 ? "secondary" : "outline"}>{attentionCount}</Badge>
              </div>
            </CardHeader>
            {attentionCount > 0 ? (
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <button type="button" onClick={() => selectSection("bookings")} className="flex items-center justify-between rounded-lg border p-4 text-left transition hover:bg-muted/50">
                  <span><span className="block text-sm font-medium">{tr("Bookings to approve", "Zu prüfende Buchungen")}</span><span className="text-xs text-muted-foreground">{tr("Review customer requests", "Kundenanfragen prüfen")}</span></span>
                  <Badge variant={pendingBookings > 0 ? "destructive" : "secondary"}>{pendingBookings}</Badge>
                </button>
                <button type="button" onClick={() => selectSection("cars")} className="flex items-center justify-between rounded-lg border p-4 text-left transition hover:bg-muted/50">
                  <span><span className="block text-sm font-medium">{tr("Unavailable cars", "Nicht verfügbare Fahrzeuge")}</span><span className="text-xs text-muted-foreground">{tr("Check status or maintenance", "Status oder Wartung prüfen")}</span></span>
                  <Badge variant={unavailableCars > 0 ? "destructive" : "secondary"}>{unavailableCars}</Badge>
                </button>
                <Link href={canReviewDocuments ? "/admin/documents" : "/admin/documents/security"} className="flex items-center justify-between rounded-lg border p-4 transition hover:bg-muted/50">
                  <span>
                    <span className="block text-sm font-medium">
                      {canReviewDocuments
                        ? tr("Documents to review", "Zu prüfende Dokumente")
                        : tr("Document access required", "Dokumentenzugriff erforderlich")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {canReviewDocuments
                        ? tr("Check customer uploads", "Kundendokumente prüfen")
                        : tr("A document security administrator must grant reviewer access.", "Ein Dokumentensicherheitsadministrator muss den Prüferzugriff freigeben.")}
                    </span>
                  </span>
                  <Badge variant={displayedDocumentReviewCount > 0 ? "destructive" : "secondary"}>{displayedDocumentReviewCount}</Badge>
                </Link>
              </CardContent>
            ) : null}
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>{tr("Quick actions", "Schnellaktionen")}</CardTitle>
              <CardDescription>{tr("Go straight to the work you do most often.", "Direkt zu den häufigsten Aufgaben wechseln.")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="h-auto py-4 flex-col gap-2">
                      <CarIcon className="w-6 h-6" />
                      <span>{tr("Add car", "Fahrzeug hinzufügen")}</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{tr("Add New Car", "Neues Fahrzeug hinzufügen")}</DialogTitle>
                    </DialogHeader>
                    <CarForm
                      onSubmit={(car) => {
                        handleCreateCar(car)
                      }}
                      isSubmitting={isPending}
                    />
                  </DialogContent>
                </Dialog>

                <Button
                  variant="outline"
                  className="relative h-auto py-4 flex-col gap-2 bg-transparent"
                  onClick={() => selectSection("bookings")}
                >
                  <AlertCircle className="w-6 h-6" />
                  <span>{tr("Review bookings", "Buchungen prüfen")}</span>
                  {pendingBookings > 0 && (
                    <Badge variant="destructive" className="absolute top-2 right-2">
                      {pendingBookings}
                    </Badge>
                  )}
                </Button>

                <Button variant="outline" className="h-auto py-4 flex-col gap-2 bg-transparent" asChild>
                  <Link href="/admin/settings">
                    <Users className="w-6 h-6" />
                    <span>{tr("Business settings", "Unternehmenseinstellungen")}</span>
                  </Link>
                </Button>

                <Button variant="outline" className="h-auto py-4 flex-col gap-2 bg-transparent" asChild>
                  <Link href={canReviewDocuments ? "/admin/documents" : "/admin/documents/security"}>
                    <FileCheck2 className="w-6 h-6" />
                    <span>
                      {canReviewDocuments
                        ? tr("Review documents", "Dokumente prüfen")
                        : tr("Request document access", "Dokumentenzugriff anfordern")}
                    </span>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Bookings */}
          <Card>
            <CardHeader>
              <CardTitle>{tr("Upcoming bookings", "Bevorstehende Buchungen")}</CardTitle>
              <CardDescription>{tr("The next pickups that need your attention.", "Die nächsten Abholungen, die Ihre Aufmerksamkeit benötigen.")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingBookings.slice(0, 5).map((booking) => {
                  const car = carsState.find((c) => c.id === booking.carId)
                  const bookingUser = usersState.find((u) => u.id === booking.userId)
                  if (!car || !bookingUser) return null

                  return (
                    <div
                      key={booking.id}
                      className="flex flex-col gap-3 rounded-xl border border-border/70 p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <img
                        src={car.image || "/placeholder.svg"}
                        alt={getCarName(car)}
                        className="h-40 w-full rounded-lg object-cover sm:h-16 sm:w-16"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{getCarName(car)}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {bookingUser.name || bookingUser.email}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatAdminDate(booking.createdAt, booking.businessTimeZone)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:block sm:text-right">
                        <div className="font-bold">{formatCents(booking.totalPrice, booking.currency)}</div>
                        <Badge
                          variant={getBookingStatusBadge(booking.status).variant}
                          className={`${getBookingStatusBadge(booking.status).className} sm:mt-1`}
                        >
                          {tr(booking.status.replaceAll("_", " "), ({ PENDING: "AUSSTEHEND", CONFIRMED: "BESTÄTIGT", IN_PROGRESS: "IN BEARBEITUNG", COMPLETED: "ABGESCHLOSSEN", CANCELLED: "STORNIERT", REJECTED: "ABGELEHNT" } as const)[booking.status])}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
                {upcomingBookings.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">{tr("No upcoming bookings", "Keine bevorstehenden Buchungen")}</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cars Tab */}
      {activeTab === "cars" && (
        <div className="space-y-4">
          <header>
            <p className="text-sm font-medium text-primary">{tr("Cars", "Fahrzeuge")}</p>
            <h1 className="text-2xl font-bold tracking-tight">{tr("Which cars are ready to rent?", "Welche Fahrzeuge sind vermietbereit?")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr("Add cars, update availability, and keep their customer details accurate.", "Fügen Sie Fahrzeuge hinzu, aktualisieren Sie die Verfügbarkeit und halten Sie die Kundenangaben korrekt.")}
            </p>
          </header>
          {unpublishedPricingCars.length > 0 ? (
            <Alert className="border-amber-300 bg-amber-50 text-amber-950">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>
                {tr(
                  `${unpublishedPricingCars.length} ${unpublishedPricingCars.length === 1 ? "car is" : "cars are"} not bookable yet`,
                  `${unpublishedPricingCars.length} ${unpublishedPricingCars.length === 1 ? "Fahrzeug ist" : "Fahrzeuge sind"} noch nicht buchbar`,
                )}
              </AlertTitle>
              <AlertDescription className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {tr(
                    "Their prices are saved as draft changes and must be published before customers can book them.",
                    "Die Preise sind als Entwurf gespeichert und müssen veröffentlicht werden, bevor Kunden buchen können.",
                  )}
                </span>
                <Button asChild size="sm" className="shrink-0">
                  <Link href="/admin/advanced/configuration">
                    {tr("Review and publish", "Prüfen und veröffentlichen")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={tr("Search cars...", "Fahrzeuge suchen...")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder={tr("Filter by status", "Nach Status filtern")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr("Any availability", "Alle Verfügbarkeiten")}</SelectItem>
                <SelectItem value="AVAILABLE">{tr("Available", "Verfügbar")}</SelectItem>
                <SelectItem value="LOW_STOCK">{tr("Limited availability", "Begrenzt verfügbar")}</SelectItem>
                <SelectItem value="RENTED">{tr("Rented", "Vermietet")}</SelectItem>
                <SelectItem value="MAINTENANCE">{tr("Maintenance", "Wartung")}</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto">
                  <CarIcon className="w-4 h-4 mr-2" />
                  {tr("Add car", "Fahrzeug hinzufügen")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{tr("Add a car", "Fahrzeug hinzufügen")}</DialogTitle>
                </DialogHeader>
                <CarForm
                  onSubmit={(car) => {
                    handleCreateCar(car)
                  }}
                  isSubmitting={isPending}
                />
              </DialogContent>
            </Dialog>
          </div>

          {/* Cars Grid */}
          <div className="grid gap-4">
            {filteredCars.map((car) => (
              <Card key={car.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 md:flex-row">
                    <img
                      src={car.image || "/placeholder.svg"}
                      alt={getCarName(car)}
                      className="h-44 w-full rounded-lg object-cover sm:h-40 md:h-32 md:w-40"
                    />
                    <div className="flex-1">
                      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-bold text-lg">{getCarName(car)}</h3>
                          <p className="text-sm text-muted-foreground">{getCarSubtitle(car)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <Badge
                            variant={
                              car.status === "AVAILABLE"
                                ? "default"
                                : car.status === "LOW_STOCK"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {car.status === "LOW_STOCK"
                              ? tr("LIMITED AVAILABILITY", "BEGRENZT VERFÜGBAR")
                              : tr(car.status, ({ AVAILABLE: "VERFÜGBAR", RENTED: "VERMIETET", MAINTENANCE: "WARTUNG" } as const)[car.status as "AVAILABLE" | "RENTED" | "MAINTENANCE"] ?? car.status)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              car.pricingPublication === "PUBLISHED"
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : car.pricingPublication === "PUBLISHED_WITH_CHANGES"
                                  ? "border-blue-300 bg-blue-50 text-blue-800"
                                  : "border-amber-300 bg-amber-50 text-amber-800"
                            }
                          >
                            {car.pricingPublication === "PUBLISHED"
                              ? tr("PRICE PUBLISHED", "PREIS VERÖFFENTLICHT")
                              : car.pricingPublication === "PUBLISHED_WITH_CHANGES"
                                ? tr("PUBLISHED · CHANGES PENDING", "VERÖFFENTLICHT · ÄNDERUNGEN AUSSTEHEND")
                                : car.pricingPublication === "DRAFT"
                                  ? tr("DRAFT · NOT BOOKABLE", "ENTWURF · NICHT BUCHBAR")
                                  : tr("PRICING REQUIRED", "PREIS ERFORDERLICH")}
                          </Badge>
                        </div>
                      </div>

                      <div className="mb-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{tr("Category:", "Kategorie:")}</span>
                          <span className="font-medium">{car.category}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{tr("Price:", "Preis:")}</span>
                          <span className="font-bold text-primary">{formatCents(car.price)}/{tr("day", "Tag")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{tr("Seats:", "Sitzplätze:")}</span>
                          <span className="font-medium">{car.specs.seats}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{tr("Fuel:", "Kraftstoff:")}</span>
                          <span className="font-medium">{car.specs.fuel}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Dialog open={editCarId === car.id} onOpenChange={(open) => setEditCarId(open ? car.id : null)}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              {tr("Edit", "Bearbeiten")}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>{tr("Edit Car", "Fahrzeug bearbeiten")}</DialogTitle>
                            </DialogHeader>
                            <CarForm
                              initialCar={car}
                              onSubmit={(updates) => {
                                handleUpdateCar(car.id, updates)
                              }}
                              isSubmitting={isPending}
                            />
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm(tr(`Are you sure you want to delete ${getCarName(car)}?`, `Möchten Sie ${getCarName(car)} wirklich löschen?`))) {
                              handleDeleteCar(car.id)
                            }
                          }}
                        >
                          {tr("Delete", "Löschen")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredCars.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <CarIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">{tr("No cars found", "Keine Fahrzeuge gefunden")}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Bookings Tab */}
      {activeTab === "bookings" && (
        <div className="space-y-4">
          <header>
            <p className="text-sm font-medium text-primary">{tr("Bookings", "Buchungen")}</p>
            <h1 className="text-2xl font-bold tracking-tight">{tr("Which bookings need attention?", "Welche Buchungen benötigen Aufmerksamkeit?")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr("Review customer requests or reserve a car for a direct customer.", "Prüfen Sie Kundenanfragen oder reservieren Sie ein Fahrzeug für einen Direktkunden.")}
            </p>
          </header>
          <Card className={pendingApplicationReviews > 0 ? "border-amber-200" : undefined}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{tr("Booking applications before confirmation", "Buchungsanträge vor der Bestätigung")}</CardTitle>
                  <CardDescription>
                    {tr(
                      "After document approval, transfer requests await payment while pay-at-pickup requests are confirmed immediately.",
                      "Nach der Dokumentenfreigabe warten Überweisungsanfragen auf Zahlung; Buchungen mit Zahlung bei Abholung werden sofort bestätigt.",
                    )}
                  </CardDescription>
                </div>
                <Badge variant={pendingApplicationReviews > 0 ? "destructive" : "secondary"}>
                  {bookingApplicationsState.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!canReviewDocuments && pendingApplicationReviews > 0 ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{tr("Reviewer access is missing", "Prüferzugriff fehlt")}</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>
                      {tr(
                        "You can see that applications need review, but private files stay protected until a document security administrator grants the DOCUMENT_REVIEWER role.",
                        "Sie sehen, dass Anträge geprüft werden müssen. Private Dateien bleiben jedoch geschützt, bis ein Dokumentensicherheitsadministrator die Rolle DOCUMENT_REVIEWER erteilt.",
                      )}
                    </p>
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/admin/documents/security">
                        {tr("Open document access", "Dokumentenzugriff öffnen")}
                      </Link>
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              {bookingApplicationsState.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {tr("No open applications.", "Keine offenen Anträge.")}
                </p>
              ) : (
                bookingApplicationsState.map((application) => {
                  const car = carsState.find((item) => item.id === application.carId)
                  const customer = usersState.find((item) => item.id === application.userId)
                  const isClosed = ["CANCELLED", "EXPIRED", "REJECTED"].includes(application.status)

                  return (
                    <div key={application.id} className={`rounded-lg border p-4 ${isClosed ? "bg-muted/30" : ""}`}>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">
                              {car ? getCarName(car) : tr("Unknown car", "Unbekanntes Fahrzeug")}
                            </p>
                            <Badge variant={application.status === "AWAITING_DOCUMENT_REVIEW" ? "destructive" : isClosed ? "outline" : "secondary"}>
                              {applicationStatusCopy(application.status)}
                            </Badge>
                          </div>
                          <p className="break-words text-sm text-muted-foreground">
                            {customer?.name || customer?.email || tr("Unknown customer", "Unbekannter Kunde")}
                            {customer?.email && customer.name ? ` • ${customer.email}` : ""}
                          </p>
                          <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                            <p>{tr("Pick-up:", "Abholung:")} {formatAdminDateTime(application.pickupDate, application.businessTimeZone)}</p>
                            <p>{tr("Return:", "Rückgabe:")} {formatAdminDateTime(application.dropoffDate, application.businessTimeZone)}</p>
                            <p>{tr("Location:", "Ort:")} {application.location}</p>
                            <p>
                              {tr("Quote:", "Angebot:")} {application.totalPrice === null
                                ? tr("Not available", "Nicht verfügbar")
                                : formatCents(application.totalPrice, application.currency)}
                            </p>
                          </div>
                          {application.status === "READY_TO_FINALIZE" ? (
                            <p className="text-sm text-emerald-700">
                              {application.paymentMethod === "TRANSFER"
                                ? tr("Documents are approved. A 24-hour payment reservation is being created.", "Die Dokumente sind freigegeben. Eine 24-stündige Zahlungsreservierung wird erstellt.")
                                : tr("Documents are approved. The pay-at-pickup booking is being confirmed.", "Die Dokumente sind freigegeben. Die Buchung mit Zahlung bei Abholung wird bestätigt.")}
                            </p>
                          ) : null}
                          {application.status === "CANCELLED" ? (
                            <p className="text-sm text-muted-foreground">
                              {tr(
                                "The customer cancelled this application. No booking was created.",
                                "Der Kunde hat diesen Antrag storniert. Es wurde keine Buchung erstellt.",
                              )}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {application.status === "AWAITING_DOCUMENT_REVIEW" && canReviewDocuments ? (
                            <Button size="sm" asChild>
                              <Link href={`/admin/documents/applications/${application.id}`}>
                                {tr("Review application", "Antrag prüfen")}
                              </Link>
                            </Button>
                          ) : null}
                          {!isClosed ? (
                            <Button variant="destructive" size="sm" disabled={isPending} onClick={() => handleCancelApplication(application)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              {tr("Cancel / remove", "Stornieren / entfernen")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{tr("Reserve a car for a direct customer", "Fahrzeug für einen Direktkunden reservieren")}</CardTitle>
              <CardDescription>
                {tr("Reserve a car for direct customers. Reserved dates are blocked and cannot be booked online.", "Reservieren Sie ein Fahrzeug für Direktkunden. Reservierte Zeiträume werden gesperrt und können nicht online gebucht werden.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ManualReservationForm
                cars={carsState}
                referenceTime={generatedAt}
                businessTimeZone={businessTimeZone}
                availabilityRefreshToken={manualReservationsState.map(({ id }) => id).join("|")}
                onSubmit={handleCreateManualReservation}
                isSubmitting={isPending}
              />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{tr("Current manual reservations", "Aktuelle manuelle Reservierungen")}</h3>
                  <Badge variant="outline">{manualReservationsState.length}</Badge>
                </div>

                {manualReservationsState.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tr("No manual reservations yet.", "Noch keine manuellen Reservierungen.")}</p>
                ) : filteredManualReservations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tr("No manual reservations match your search.", "Keine manuellen Reservierungen entsprechen Ihrer Suche.")}</p>
                ) : (
                  <div className="space-y-3">
                    {filteredManualReservations.map((reservation) => {
                      const car = carsState.find((item) => item.id === reservation.carId)
                      return (
                        <div key={reservation.id} className="rounded-lg border border-border p-3">
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                              <p className="font-semibold">{car ? getCarName(car) : tr("Unknown car", "Unbekanntes Fahrzeug")}</p>
                              <p className="text-sm text-muted-foreground">
                                {tr("Reserved for", "Reserviert für")} {reservation.customerName} • {reservation.customerPhone}
                              </p>
                              <div className="grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                                <p>{tr("Pick-up:", "Abholung:")} {formatAdminDateTime(reservation.pickupDate)}</p>
                                <p>{tr("Drop-off:", "Rückgabe:")} {formatAdminDateTime(reservation.dropoffDate)}</p>
                                <p>{tr("Price:", "Preis:")} {formatCents(reservation.totalPrice)}</p>
                                <p>{tr("Created:", "Erstellt:")} {formatAdminDate(reservation.createdAt)}</p>
                              </div>
                            </div>

                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={isPending}
                              onClick={() => handleDeleteManualReservation(reservation.id)}
                            >
                              {tr("Remove", "Entfernen")}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={tr("Search bookings...", "Buchungen suchen...")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder={tr("Filter by status", "Nach Status filtern")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{tr("Active bookings", "Aktive Buchungen")}</SelectItem>
                <SelectItem value="all">{tr("All statuses", "Alle Status")}</SelectItem>
                <SelectItem value="PENDING">{tr("Pending", "Ausstehend")}</SelectItem>
                <SelectItem value="CONFIRMED">{tr("Confirmed", "Bestätigt")}</SelectItem>
                <SelectItem value="IN_PROGRESS">{tr("In Progress", "In Bearbeitung")}</SelectItem>
                <SelectItem value="COMPLETED">{tr("Completed", "Abgeschlossen")}</SelectItem>
                <SelectItem value="CANCELLED">{tr("Cancelled", "Storniert")}</SelectItem>
                <SelectItem value="REJECTED">{tr("Rejected", "Abgelehnt")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Bookings List */}
          <div className="space-y-3">
            {filteredBookings.map((booking) => {
              const car = carsState.find((c) => c.id === booking.carId)
              const bookingUser = usersState.find((u) => u.id === booking.userId)
              if (!car || !bookingUser) return null

              return (
                <Card key={booking.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <img
                        src={car.image || "/placeholder.svg"}
                        alt={getCarName(car)}
                        className="w-full sm:w-32 h-32 rounded-lg object-cover"
                      />
                      <div className="flex-1 space-y-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h3 className="font-bold text-lg">{getCarName(car)}</h3>
                            <p className="break-words text-sm text-muted-foreground">
                              {(bookingUser.name || bookingUser.email) + " • " + bookingUser.email}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={getBookingStatusBadge(booking.status).variant}
                              className={getBookingStatusBadge(booking.status).className}
                            >
                              {tr(booking.status.replaceAll("_", " "), ({ PENDING: "AUSSTEHEND", CONFIRMED: "BESTÄTIGT", IN_PROGRESS: "IN BEARBEITUNG", COMPLETED: "ABGESCHLOSSEN", CANCELLED: "STORNIERT", REJECTED: "ABGELEHNT" } as const)[booking.status])}
                            </Badge>
                            {booking.status === "PENDING" && booking.advancePaymentAmount > 0 && booking.paymentStatus === "PENDING" ? (
                              <Button size="sm" disabled={isPending} onClick={() => handleConfirmTransferDeposit(booking)}>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                {booking.depositAmount > 0 && booking.depositAmount < booking.totalPrice
                                  ? tr("Mark deposit received", "Anzahlung bestätigen")
                                  : tr("Mark full transfer received", "Vollständige Überweisung bestätigen")}
                              </Button>
                            ) : null}
                            {booking.status === "CONFIRMED" && booking.paymentStatus !== "PAID" && booking.amountReceived < booking.totalPrice ? (
                              <Button size="sm" disabled={isPending} onClick={() => handleRecordPickupPayment(booking)}>
                                <DollarSign className="mr-2 h-4 w-4" />
                                {booking.amountReceived > 0
                                  ? tr("Mark remaining balance received", "Restbetrag bestätigen")
                                  : tr("Mark full pickup payment received", "Vollständige Abholzahlung bestätigen")}
                              </Button>
                            ) : null}
                            {booking.status === "CONFIRMED" ? (
                              <Button variant="outline" size="sm" disabled={isPending || booking.paymentStatus !== "PAID"} onClick={() => handleUpdateBookingStatus(booking.id, "IN_PROGRESS")}>
                                {tr("Start rental", "Miete starten")}
                              </Button>
                            ) : null}
                            {booking.status === "IN_PROGRESS" ? (
                              <Button variant="outline" size="sm" disabled={isPending} onClick={() => handleUpdateBookingStatus(booking.id, "COMPLETED")}>
                                {tr("Complete rental", "Miete abschließen")}
                              </Button>
                            ) : null}
                            {booking.status === "CONFIRMED" ? (
                              <Button variant="outline" size="sm" disabled={isPending} onClick={() => handleResendConfirmation(booking.id)}>
                                <Mail className="mr-2 h-4 w-4" />
                                {tr("Resend confirmation", "Bestätigung erneut senden")}
                              </Button>
                            ) : null}
                            {booking.emailDelivery?.status === "FAILED" ? (
                              <Button variant="outline" size="sm" disabled={isPending} onClick={() => handleRetryNotification(booking)}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                {tr("Retry customer email", "Kunden-E-Mail erneut senden")}
                              </Button>
                            ) : null}
                            {!["CANCELLED", "REJECTED", "COMPLETED"].includes(booking.status) ? (
                              <Button variant="destructive" size="sm" disabled={isPending} onClick={() => handleCancelBooking(booking)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                {tr("Cancel / remove", "Stornieren / entfernen")}
                              </Button>
                            ) : null}
                            {booking.refundReviewStatus === "PENDING" && booking.amountReceived > 0 ? (
                              <>
                                <Button variant="outline" size="sm" disabled={isPending} onClick={() => handleRecordRefund(booking)}>
                                  {tr("Record refund", "Erstattung erfassen")}
                                </Button>
                                <Button variant="ghost" size="sm" disabled={isPending} onClick={() => handleCloseRefundReview(booking)}>
                                  {tr("Close refund review", "Erstattungsprüfung schließen")}
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                          <div>
                            <span className="text-muted-foreground">{tr("Location:", "Ort:")}</span>
                            <span className="ml-2 font-medium">{booking.location}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{tr("Booking ID:", "Buchungs-ID:")}</span>
                            <span className="ml-2 font-medium">#{booking.id.slice(0, 8)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{tr("Payment:", "Zahlung:")}</span>
                            <span className="ml-2 font-medium">
                              {booking.paymentMethod === "TRANSFER" ? tr("Bank Transfer", "Banküberweisung") : tr("Pay at Pickup", "Zahlung bei Abholung")}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{tr("Payment status:", "Zahlungsstatus:")}</span>
                            <span className="ml-2 font-medium">
                              {booking.paymentStatus === "DEPOSIT_PAID"
                                ? tr("Deposit paid", "Anzahlung bezahlt")
                                : tr(booking.paymentStatus.replaceAll("_", " "), ({ PENDING: "AUSSTEHEND", PAID: "BEZAHLT", FAILED: "FEHLGESCHLAGEN", REFUNDED: "ERSTATTET", PARTIALLY_REFUNDED: "TEILWEISE ERSTATTET" } as const)[booking.paymentStatus as Exclude<AdminBooking["paymentStatus"], "DEPOSIT_PAID">])}
                            </span>
                          </div>
                          {booking.advancePaymentAmount > 0 ? (
                            <div>
                              <span className="text-muted-foreground">{tr("Required advance:", "Erforderliche Vorauszahlung:")}</span>
                              <span className="ml-2 font-medium">{formatCents(booking.advancePaymentAmount, booking.currency)}</span>
                            </div>
                          ) : null}
                          <div>
                            <span className="text-muted-foreground">{tr("Received:", "Erhalten:")}</span>
                            <span className="ml-2 font-medium">{formatCents(booking.amountReceived, booking.currency)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{tr("Outstanding:", "Offen:")}</span>
                            <span className="ml-2 font-medium">{formatCents(Math.max(booking.totalPrice - booking.amountReceived, 0), booking.currency)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{tr("Refund review:", "Erstattungsprüfung:")}</span>
                            <span className="ml-2 font-medium">{tr(booking.refundReviewStatus.replaceAll("_", " "), ({ NOT_REQUIRED: "NICHT ERFORDERLICH", PENDING: "AUSSTEHEND", RESOLVED: "ABGESCHLOSSEN" } as const)[booking.refundReviewStatus])}</span>
                          </div>
                          {booking.paymentDueAt ? (
                            <div>
                              <span className="text-muted-foreground">{tr("Payment deadline:", "Zahlungsfrist:")}</span>
                              <span className="ml-2 font-medium">{formatAdminDateTime(booking.paymentDueAt, booking.businessTimeZone)}</span>
                            </div>
                          ) : null}
                          {booking.paymentMethod === "TRANSFER" ? (
                            <div>
                              <span className="text-muted-foreground">{tr("Transfer reference:", "Verwendungszweck:")}</span>
                              <span className="ml-2 font-mono font-medium">{booking.transferCode}</span>
                            </div>
                          ) : null}
                          <div>
                            <span className="text-muted-foreground">{tr("Customer email:", "Kunden-E-Mail:")}</span>
                            <span className="ml-2 font-medium">
                              {booking.emailDelivery
                                ? booking.emailDelivery.status === "SENT"
                                  ? tr("Sent", "Gesendet")
                                  : booking.emailDelivery.status === "FAILED"
                                    ? tr("Failed – retry available", "Fehlgeschlagen – erneut senden")
                                    : tr("Queued", "In Warteschlange")
                                : tr("No delivery recorded", "Keine Zustellung erfasst")}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{tr("Pick-up:", "Abholung:")}</span>
                            <span className="ml-2 font-medium">
                              {formatAdminDate(booking.pickupDate, booking.businessTimeZone)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{tr("Drop-off:", "Rückgabe:")}</span>
                            <span className="ml-2 font-medium">
                              {formatAdminDate(booking.dropoffDate, booking.businessTimeZone)}
                            </span>
                          </div>
                          {booking.guaranteeAmount > 0 && (
                            <div>
                              <span className="text-muted-foreground">{tr("Refundable security deposit:", "Rückzahlbare Kaution:")}</span>
                              <span className="ml-2 font-medium">
                                {formatCents(booking.guaranteeAmount, booking.currency)}
                              </span>
                            </div>
                          )}
                          {booking.insurance && (
                            <div>
                              <span className="text-muted-foreground">{tr("Insurance:", "Versicherung:")}</span>
                              <span className="ml-2 font-medium">
                                {booking.insurance.name} · {formatCents(booking.insurance.subtotal, booking.currency)}
                              </span>
                            </div>
                          )}
                          {booking.customer && (
                            <div className="sm:col-span-2 rounded-md border p-3 space-y-1">
                              <p className="font-medium">{tr("Customer and driver", "Kunde und Fahrer")}</p>
                              <p>
                                {booking.customer.name} · {booking.customer.email}
                              </p>
                              {booking.customer.phone && <p>{tr("Phone:", "Telefon:")} {booking.customer.phone}</p>}
                              {booking.customer.dateOfBirth && (
                                <p>{tr("Date of birth:", "Geburtsdatum:")} {formatAdminDate(booking.customer.dateOfBirth)}</p>
                              )}
                              {booking.customer.licenceNumber && <p>{tr("Licence:", "Führerschein:")} {booking.customer.licenceNumber}</p>}
                              <p className="text-xs text-muted-foreground">
                                {booking.customer.validatedAt
                                  ? tr(`Checked ${formatAdminDateTime(booking.customer.validatedAt, booking.businessTimeZone)}`, `Geprüft am ${formatAdminDateTime(booking.customer.validatedAt, booking.businessTimeZone)}`)
                                  : tr("Saved with this booking", "Mit dieser Buchung gespeichert")}
                              </p>
                            </div>
                          )}
                          {booking.legalAcceptances.length > 0 && (
                            <div className="sm:col-span-2 rounded-md border p-3 space-y-1">
                              <p className="font-medium">{tr("Customer agreements", "Kundenzustimmungen")}</p>
                              {booking.legalAcceptances.map((acceptance) => (
                                <p key={acceptance.id} className="text-sm">
                                  <a
                                    className="font-medium text-primary underline"
                                    href={`/${acceptance.locale}/legal/${acceptance.translationId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {acceptance.title}
                                  </a>{" "}
                                  · {acceptance.locale} · {tr("accepted", "akzeptiert")} {formatAdminDateTime(acceptance.acceptedAt, booking.businessTimeZone)} ·{" "}
                                  {tr(acceptance.source.replaceAll("_", " "), ({ CUSTOMER_CHECKBOX: "KUNDEN-CHECKBOX", CUSTOMER_SUBMISSION: "KUNDENÜBERMITTLUNG", STAFF_RECORDED: "VON MITARBEITER ERFASST" } as const)[acceptance.source])}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-border">
                          <span className="text-muted-foreground text-sm">{tr("Total Amount", "Gesamtbetrag")}</span>
                          <span className="text-xl font-bold">{formatCents(booking.totalPrice, booking.currency)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            {filteredBookings.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">{tr("No bookings found", "Keine Buchungen gefunden")}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="space-y-4">
          <header>
            <p className="text-sm font-medium text-primary">{tr("People", "Personen")}</p>
            <h1 className="text-2xl font-bold tracking-tight">{tr("Who uses the app?", "Wer nutzt die Anwendung?")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{tr("Find customer accounts and control who can sign in.", "Finden Sie Kundenkonten und steuern Sie, wer sich anmelden kann.")}</p>
          </header>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={tr("Search people...", "Personen suchen...")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
              <DialogTrigger asChild>
                <Button className="sm:w-auto">
                  <UserPlus className="w-4 h-4 mr-2" />
                  {tr("Add person", "Person hinzufügen")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{tr("Add a person", "Person hinzufügen")}</DialogTitle>
                </DialogHeader>
                <UserForm onSubmit={handleCreateUser} isSubmitting={isPending} />
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-3">
            {filteredUsers.map((user) => {
              const userBookings = bookingsState.filter((b) => b.userId === user.id)
              const userRevenue = userBookings.reduce((sum, b) => sum + b.totalPrice, 0)
              const isCurrentAdmin = user.id === currentUser.id

              return (
                <Card key={user.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xl font-bold">
                        {(user.name || user.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="break-words font-bold text-lg">{user.name || user.email}</h3>
                          <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                            {user.role === "ADMIN" ? tr("Team member", "Teammitglied") : tr("Customer", "Kunde")}
                          </Badge>
                          <Badge variant={user.isActive ? "outline" : "destructive"}>
                            {user.isActive ? tr("Active", "Aktiv") : tr("Inactive", "Inaktiv")}
                          </Badge>
                        </div>
                        <p className="mb-2 break-all text-sm text-muted-foreground">{user.email}</p>
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">{tr("Bookings:", "Buchungen:")}</span>
                            <span className="ml-2 font-bold">{userBookings.length}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{tr("Total Spent:", "Gesamtausgaben:")}</span>
                            <span className="ml-2 font-bold">{formatCents(userRevenue)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{tr("Joined:", "Registriert:")}</span>
                            <span className="ml-2 font-medium">{formatAdminDate(user.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:flex-col md:items-end">
                        <Button
                          size="sm"
                          variant={user.isActive ? "outline" : "default"}
                          onClick={() => handleToggleUserActive(user)}
                          disabled={isPending || isCurrentAdmin}
                          title={isCurrentAdmin ? tr("You cannot change your own active status", "Sie können Ihren eigenen Aktivstatus nicht ändern") : undefined}
                          className="w-full sm:w-auto"
                        >
                          {user.isActive ? (
                            <>
                              <UserX className="w-4 h-4 mr-2" />
                              {tr("Deactivate", "Deaktivieren")}
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-4 h-4 mr-2" />
                              {tr("Activate", "Aktivieren")}
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteUser(user)}
                          disabled={isPending || isCurrentAdmin}
                          title={isCurrentAdmin ? tr("You cannot delete your own account", "Sie können Ihr eigenes Konto nicht löschen") : undefined}
                          className="w-full sm:w-auto"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {tr("Delete", "Löschen")}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            {filteredUsers.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">{tr("No users found", "Keine Benutzer gefunden")}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Reviews Tab */}
      {activeTab === "reviews" && (
        <div className="space-y-4">
          <header>
            <p className="text-sm font-medium text-primary">{tr("Reviews", "Bewertungen")}</p>
            <h1 className="text-2xl font-bold tracking-tight">{tr("What are customers saying?", "Was sagen die Kunden?")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr("Read feedback and remove reviews that should not remain public.", "Lesen Sie Rückmeldungen und entfernen Sie Bewertungen, die nicht öffentlich bleiben sollen.")}
            </p>
          </header>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={tr("Search reviews, users, cars, booking number...", "Bewertungen, Benutzer, Fahrzeuge oder Buchungsnummer suchen...")}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{reviewsState.length} {tr("total", "insgesamt")}</Badge>
              <Badge variant="secondary">{filteredReviews.length} {tr("shown", "angezeigt")}</Badge>
            </div>
          </div>

          <div className="space-y-3">
            {filteredReviews.map((review) => (
              <Card key={review.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words font-semibold">{getReviewCarName(review)}</p>
                        <Badge variant="outline">#{review.bookingNumber}</Badge>
                      </div>

                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <svg
                            key={star}
                            className={`w-4 h-4 ${star <= review.rating ? "text-warning" : "text-muted-foreground/30"}`}
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                          </svg>
                        ))}
                        <span className="text-sm text-muted-foreground ml-2">{review.rating}/5</span>
                      </div>

                      <p className="break-words rounded-md border border-border bg-muted/20 p-3 text-sm text-foreground/90">
                        {review.comment}
                      </p>

                      <p className="break-all text-xs text-muted-foreground">
                        {tr("By", "Von")} {review.userName || review.userEmail} ({review.userEmail}) •{" "}
                        {formatAdminDateTime(review.createdAt)}
                      </p>
                    </div>

                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleDeleteReview(review)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {tr("Delete", "Löschen")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredReviews.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">{tr("No reviews found", "Keine Bewertungen gefunden")}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <header>
            <p className="text-sm font-medium text-primary">{tr("Reports", "Berichte")}</p>
            <h1 className="text-2xl font-bold tracking-tight">{tr("How is the business doing?", "Wie entwickelt sich das Unternehmen?")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr("See revenue, booking progress, and car availability at a glance.", "Sehen Sie Umsatz, Buchungsfortschritt und Fahrzeugverfügbarkeit auf einen Blick.")}
            </p>
          </header>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Analytics */}
            <Card>
              <CardHeader>
                <CardTitle>{tr("Revenue overview", "Umsatzübersicht")}</CardTitle>
                <CardDescription>{tr("Total earnings breakdown", "Aufschlüsselung der Gesamteinnahmen")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                    <div>
                      <p className="text-sm text-muted-foreground">{tr("Total Revenue", "Gesamtumsatz")}</p>
                      <p className="text-xl font-bold sm:text-2xl">{formatCents(totalRevenueCents)}</p>
                    </div>
                    <DollarSign className="w-8 h-8 text-green-500" />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                    <div>
                      <p className="text-sm text-muted-foreground">{tr("This Month", "Dieser Monat")}</p>
                      <p className="text-xl font-bold sm:text-2xl">{formatCents(revenueThisMonthCents)}</p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-blue-500" />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                    <div>
                      <p className="text-sm text-muted-foreground">{tr("Average Booking", "Durchschnittliche Buchung")}</p>
                      <p className="text-xl font-bold sm:text-2xl">
                        {bookingsState.length > 0
                          ? formatCents(Math.round(totalRevenueCents / bookingsState.length))
                          : formatCents(0)}
                      </p>
                    </div>
                    <BarChart3 className="w-8 h-8 text-purple-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Booking Status */}
            <Card>
              <CardHeader>
                <CardTitle>{tr("Booking progress", "Buchungsfortschritt")}</CardTitle>
                <CardDescription>{tr("Current booking distribution", "Aktuelle Buchungsverteilung")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-blue-50">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-6 h-6 text-blue-600" />
                      <div>
                        <p className="font-medium text-blue-900">{tr("Confirmed", "Bestätigt")}</p>
                        <p className="text-sm text-blue-600">{activeBookings} {tr("bookings", "Buchungen")}</p>
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-blue-600">{activeBookings}</div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-yellow-50">
                    <div className="flex items-center gap-3">
                      <Clock className="w-6 h-6 text-yellow-600" />
                      <div>
                        <p className="font-medium text-yellow-900">{tr("Pending", "Ausstehend")}</p>
                        <p className="text-sm text-yellow-600">{pendingBookings} {tr("bookings", "Buchungen")}</p>
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-yellow-600">{pendingBookings}</div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-green-50">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                      <div>
                        <p className="font-medium text-green-900">{tr("Completed", "Abgeschlossen")}</p>
                        <p className="text-sm text-green-600">{completedBookings} {tr("bookings", "Buchungen")}</p>
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-green-600">{completedBookings}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Car Utilization */}
            <Card>
              <CardHeader>
                <CardTitle>{tr("Car availability", "Fahrzeugverfügbarkeit")}</CardTitle>
                <CardDescription>{tr("Fleet availability status", "Verfügbarkeitsstatus der Flotte")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {["AVAILABLE", "LOW_STOCK", "RENTED", "MAINTENANCE"].map((status) => {
                    const count = carsState.filter((c) => c.status === status).length
                    const percentage = carsState.length > 0 ? (count / carsState.length) * 100 : 0

                    return (
                      <div key={status}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            {status === "LOW_STOCK"
                              ? tr("Limited availability", "Begrenzt verfügbar")
                              : tr(status.toLowerCase(), ({ AVAILABLE: "verfügbar", RENTED: "vermietet", MAINTENANCE: "Wartung" } as const)[status as "AVAILABLE" | "RENTED" | "MAINTENANCE"] ?? status)}
                          </span>
                          <span className="text-sm text-muted-foreground">{count} {tr("cars", "Fahrzeuge")}</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              status === "AVAILABLE"
                                ? "bg-green-500"
                                : status === "LOW_STOCK"
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Top Cars */}
            <Card>
              <CardHeader>
                <CardTitle>{tr("Most booked cars", "Meistgebuchte Fahrzeuge")}</CardTitle>
                <CardDescription>{tr("Popular vehicles this month", "Beliebte Fahrzeuge in diesem Monat")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {carsState
                    .map((car) => ({
                      ...car,
                      bookingCount: bookingsState.filter((b) => b.carId === car.id).length,
                    }))
                    .sort((a, b) => b.bookingCount - a.bookingCount)
                    .slice(0, 5)
                    .map((car, index) => (
                      <div key={car.id} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                          {index + 1}
                        </div>
                        <img
                          src={car.image || "/placeholder.svg"}
                          alt={getCarName(car)}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{getCarName(car)}</p>
                          <p className="text-sm text-muted-foreground">{car.bookingCount} {tr("bookings", "Buchungen")}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold sm:text-base">{formatCents(car.price)}</p>
                          <p className="text-xs text-muted-foreground">{tr("per day", "pro Tag")}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </main>
  )
}

interface CarFormValues {
  name: string
  nameDe: string
  subtitle?: string | null
  subtitleDe?: string | null
  category: AdminCar["category"]
  price: number
  image: string
  images: string[]
  status: AdminCar["status"]
  gearbox: string
  seats: number
  fuelType: string
  acceleration: string
  year: number
  description: string
  descriptionDe: string
}

interface ManualReservationFormValues {
  carId: string
  customerName: string
  customerPhone: string
  pickupDate: string
  dropoffDate: string
  totalPrice: number
}

interface UserFormValues {
  name: string
  email: string
  role: "ADMIN" | "USER"
}

function ManualReservationForm({
  cars,
  referenceTime,
  businessTimeZone,
  availabilityRefreshToken,
  onSubmit,
  isSubmitting = false,
}: {
  cars: AdminCar[]
  referenceTime: string
  businessTimeZone: string
  availabilityRefreshToken: string
  onSubmit: (reservation: ManualReservationFormValues) => void
  isSubmitting?: boolean
}) {
  const locale = useLocale()
  const tr = (english: string, german: string) => (locale === "de" ? german : english)
  const formatDatetimeLocal = (date: Date) =>
    instantToBusinessDateTimeLocal(date, businessTimeZone) ?? ""

  const createInitialDates = () => {
    const referenceLocal = instantToBusinessDateTimeLocal(new Date(referenceTime), businessTimeZone)
    const [year, month, day] = (referenceLocal?.slice(0, 10) ?? referenceTime.slice(0, 10)).split("-").map(Number)
    const base = new Date(Date.UTC(
      year,
      month - 1,
      day,
    ))
    const dateAtOffset = (days: number) => {
      const date = new Date(base)
      date.setUTCDate(date.getUTCDate() + days)
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}T10:00`
    }
    return {
      pickupDate: dateAtOffset(1),
      dropoffDate: dateAtOffset(3),
    }
  }

  const initialDates = createInitialDates()
  const [formData, setFormData] = useState<ManualReservationFormValues>({
    carId: cars[0]?.id || "",
    customerName: "",
    customerPhone: "",
    pickupDate: initialDates.pickupDate,
    dropoffDate: initialDates.dropoffDate,
    totalPrice: 0,
  })
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [availabilityConflict, setAvailabilityConflict] = useState(false)
  const handleCalendarRangeSelect = useCallback((pickupDate: string, dropoffDate: string) => {
    setFormData((previous) => ({ ...previous, pickupDate, dropoffDate }))
  }, [])
  const handleAvailabilityConflict = useCallback((hasConflict: boolean) => {
    setAvailabilityConflict(hasConflict)
  }, [])

  useEffect(() => {
    if (!formData.carId && cars[0]?.id) {
      // Keep the controlled form aligned when the first async car option arrives.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData((prev) => ({ ...prev, carId: cars[0].id }))
    }
  }, [cars, formData.carId])

  const validateForm = () => {
    const errors: string[] = []

    if (!formData.carId) errors.push(tr("Please select a car.", "Bitte wählen Sie ein Fahrzeug aus."))
    if (!formData.customerName.trim()) errors.push(tr("Customer name is required.", "Der Kundenname ist erforderlich."))
    if (!formData.customerPhone.trim()) errors.push(tr("Customer phone number is required.", "Die Telefonnummer des Kunden ist erforderlich."))
    if (formData.totalPrice < 0 || !Number.isFinite(formData.totalPrice)) {
      errors.push(tr("Price must be 0 or greater.", "Der Preis muss mindestens 0 betragen."))
    }

    const pickupDate = businessLocalDateTimeToInstant(formData.pickupDate, businessTimeZone)
    const dropoffDate = businessLocalDateTimeToInstant(formData.dropoffDate, businessTimeZone)

    if (!pickupDate || !dropoffDate) {
      errors.push(tr("Please select valid pickup and drop-off date/time.", "Bitte wählen Sie gültige Abhol- und Rückgabedaten mit Uhrzeit."))
    } else {
      if (pickupDate <= new Date()) {
        errors.push(tr("Pickup date must be in the future.", "Das Abholdatum muss in der Zukunft liegen."))
      }
      if (dropoffDate <= pickupDate) {
        errors.push(tr("Drop-off date must be after pickup date.", "Das Rückgabedatum muss nach dem Abholdatum liegen."))
      }
      if (availabilityConflict) {
        errors.push(
          tr(
            "This car is already booked or blocked during the selected period.",
            "Dieses Fahrzeug ist im ausgewählten Zeitraum bereits gebucht oder gesperrt.",
          ),
        )
      }
    }

    return errors
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const errors = validateForm()
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    setValidationErrors([])
    onSubmit({
      carId: formData.carId,
      customerName: formData.customerName.trim(),
      customerPhone: formData.customerPhone.trim(),
      pickupDate: formData.pickupDate,
      dropoffDate: formData.dropoffDate,
      totalPrice: formData.totalPrice,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {validationErrors.length > 0 ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{tr("Missing information", "Fehlende Angaben")}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {validationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="reservationCarId">{tr("Car", "Fahrzeug")}</Label>
          <Select
            value={formData.carId}
            onValueChange={(value) => {
              setAvailabilityConflict(false)
              setFormData((prev) => ({ ...prev, carId: value }))
            }}
            disabled={isSubmitting || cars.length === 0}
          >
            <SelectTrigger id="reservationCarId">
              <SelectValue placeholder={cars.length === 0 ? tr("No cars available", "Keine Fahrzeuge verfügbar") : tr("Select a car", "Fahrzeug auswählen")} />
            </SelectTrigger>
            <SelectContent>
              {cars.map((car) => (
                <SelectItem key={car.id} value={car.id}>
                  {locale === "de" ? car.nameDe || car.name : car.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reservationPrice">{tr("Price (€)", "Preis (€)")}</Label>
          <Input
            id="reservationPrice"
            type="number"
            min={0}
            step="0.01"
            value={formData.totalPrice}
            onChange={(event) =>
              setFormData((prev) => ({
                ...prev,
                totalPrice: Number(event.target.value),
              }))
            }
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reservationCustomerName">{tr("Customer Name", "Kundenname")}</Label>
          <Input
            id="reservationCustomerName"
            value={formData.customerName}
            onChange={(event) =>
              setFormData((prev) => ({
                ...prev,
                customerName: event.target.value,
              }))
            }
            placeholder="John Doe"
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reservationCustomerPhone">{tr("Phone Number", "Telefonnummer")}</Label>
          <Input
            id="reservationCustomerPhone"
            value={formData.customerPhone}
            onChange={(event) =>
              setFormData((prev) => ({
                ...prev,
                customerPhone: event.target.value,
              }))
            }
            placeholder="+49 176 1234567"
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reservationPickupDate">{tr("Pick-up Date & Time", "Abholdatum und Uhrzeit")}</Label>
          <Input
            id="reservationPickupDate"
            type="datetime-local"
            value={formData.pickupDate}
            min={formatDatetimeLocal(new Date(referenceTime))}
            onChange={(event) =>
              setFormData((prev) => ({
                ...prev,
                pickupDate: event.target.value,
              }))
            }
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reservationDropoffDate">{tr("Drop-off Date & Time", "Rückgabedatum und Uhrzeit")}</Label>
          <Input
            id="reservationDropoffDate"
            type="datetime-local"
            value={formData.dropoffDate}
            min={formData.pickupDate}
            onChange={(event) =>
              setFormData((prev) => ({
                ...prev,
                dropoffDate: event.target.value,
              }))
            }
            disabled={isSubmitting}
          />
        </div>
      </div>

      <ManualReservationCalendar
        carId={formData.carId}
        pickupDate={formData.pickupDate}
        dropoffDate={formData.dropoffDate}
        businessTimeZone={businessTimeZone}
        refreshToken={availabilityRefreshToken}
        onRangeSelect={handleCalendarRangeSelect}
        onConflictChange={handleAvailabilityConflict}
      />

      <Button type="submit" disabled={isSubmitting || cars.length === 0 || availabilityConflict}>
        {availabilityConflict
          ? tr("Choose available dates", "Verfügbare Daten wählen")
          : isSubmitting
            ? tr("Saving...", "Wird gespeichert...")
            : tr("Reserve Car", "Fahrzeug reservieren")}
      </Button>
    </form>
  )
}

function UserForm({
  onSubmit,
  isSubmitting = false,
}: {
  onSubmit: (user: UserFormValues) => void
  isSubmitting?: boolean
}) {
  const locale = useLocale()
  const tr = (english: string, german: string) => (locale === "de" ? german : english)
  const [formData, setFormData] = useState<UserFormValues>({
    name: "",
    email: "",
    role: "USER",
  })
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const validateForm = () => {
    const errors: string[] = []
    if (!formData.name.trim()) errors.push(tr("Name is required.", "Der Name ist erforderlich."))
    if (!formData.email.trim()) errors.push(tr("Email is required.", "Die E-Mail-Adresse ist erforderlich."))
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (formData.email.trim() && !emailPattern.test(formData.email.trim())) errors.push(tr("Please enter a valid email.", "Bitte geben Sie eine gültige E-Mail-Adresse ein."))
    return errors
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const errors = validateForm()
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }
    setValidationErrors([])
    onSubmit({
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      role: formData.role,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {validationErrors.length > 0 ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{tr("Missing information", "Fehlende Angaben")}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {validationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="newUserName">{tr("Full name", "Vollständiger Name")}</Label>
        <Input
          id="newUserName"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="John Doe"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="newUserEmail">{tr("Email", "E-Mail")}</Label>
        <Input
          id="newUserEmail"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
          placeholder="user@example.com"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="newUserRole">{tr("Role", "Rolle")}</Label>
        <Select
          value={formData.role}
          onValueChange={(value) =>
            setFormData((prev) => ({
              ...prev,
              role: value as UserFormValues["role"],
            }))
          }
          disabled={isSubmitting}
        >
          <SelectTrigger id="newUserRole">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USER">{tr("User", "Benutzer")}</SelectItem>
            <SelectItem value="ADMIN">{tr("Admin", "Administrator")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? tr("Creating...", "Wird erstellt...") : tr("Create User", "Benutzer erstellen")}
      </Button>
    </form>
  )
}

function CarForm({
  initialCar,
  onSubmit,
  isSubmitting = false,
}: {
  initialCar?: AdminCar
  onSubmit: (car: CarFormValues) => void
  isSubmitting?: boolean
}) {
  const locale = useLocale()
  const tr = (english: string, german: string) => (locale === "de" ? german : english)
  const [formData, setFormData] = useState<CarFormValues>(() =>
    initialCar
      ? {
          name: initialCar.name,
          nameDe: initialCar.nameDe || "",
          subtitle: initialCar.subtitle || "",
          subtitleDe: initialCar.subtitleDe || "",
          category: initialCar.category,
          price: Number((initialCar.price / 100).toFixed(2)),
          image: initialCar.image,
          images: initialCar.images || [],
          status: initialCar.status,
          gearbox: initialCar.specs.gearbox,
          seats: initialCar.specs.seats,
          fuelType: initialCar.specs.fuel,
          acceleration: initialCar.specs.acceleration,
          year: initialCar.year ?? new Date().getFullYear(),
          description: initialCar.description || "",
          descriptionDe: initialCar.descriptionDe || "",
        }
      : {
          name: "",
          nameDe: "",
          subtitle: "",
          subtitleDe: "",
          category: "SEDAN",
          price: 0,
          image: "https://placehold.co/600x400/png",
          images: [],
          status: "AVAILABLE",
          gearbox: "Automatic",
          seats: 5,
          fuelType: "Gas",
          acceleration: "0-60 in 6.0sec",
          year: new Date().getFullYear(),
          description: "",
          descriptionDe: "",
        },
  )
  const [isUploading, setIsUploading] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const maxGalleryImages = 10
  const maxUploadBytes = 4 * 1024 * 1024

  const validateForm = (data: CarFormValues) => {
    const errors: string[] = []

    if (!data.name.trim()) errors.push(tr("Car name (EN) is required.", "Der Fahrzeugname auf Englisch ist erforderlich."))
    if (!data.nameDe.trim()) errors.push(tr("Car name (DE) is required.", "Der Fahrzeugname auf Deutsch ist erforderlich."))
    if (!data.category) errors.push(tr("Category is required.", "Die Kategorie ist erforderlich."))
    if (!Number.isFinite(data.price) || data.price <= 0) errors.push(tr("Price per day must be greater than 0.", "Der Preis pro Tag muss größer als 0 sein."))
    if (!data.image.trim()) errors.push(tr("Main image URL is required.", "Die URL des Hauptbildes ist erforderlich."))
    if (!data.gearbox.trim()) errors.push(tr("Gearbox is required.", "Die Getriebeart ist erforderlich."))
    if (!Number.isFinite(data.seats) || data.seats < 2 || data.seats > 9) errors.push(tr("Seats must be between 2 and 9.", "Die Anzahl der Sitzplätze muss zwischen 2 und 9 liegen."))
    if (!data.fuelType.trim()) errors.push(tr("Fuel type is required.", "Die Kraftstoffart ist erforderlich."))
    if (!data.acceleration.trim()) errors.push(tr("Acceleration is required.", "Die Beschleunigungsangabe ist erforderlich."))
    if (!Number.isFinite(data.year) || data.year < 1900 || data.year > 2030)
      errors.push(tr("Year must be between 1900 and 2030.", "Das Baujahr muss zwischen 1900 und 2030 liegen."))
    if (!data.status) errors.push(tr("Status is required.", "Der Status ist erforderlich."))
    if (!data.description.trim()) errors.push(tr("Description (EN) is required.", "Die englische Beschreibung ist erforderlich."))
    if (!data.descriptionDe.trim()) errors.push(tr("Description (DE) is required.", "Die deutsche Beschreibung ist erforderlich."))

    return errors
  }

  const validateImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      return tr("Only image files are supported.", "Es werden nur Bilddateien unterstützt.")
    }
    if (file.size > maxUploadBytes) {
      return tr("Image is too large. Please upload a file under 4MB.", "Das Bild ist zu groß. Bitte laden Sie eine Datei unter 4 MB hoch.")
    }
    return null
  }

  const fetchUploadSignature = async () => {
    const response = await fetch("/api/cloudinary/signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error || "Failed to get upload signature")
    }
    return data as {
      cloudName: string
      apiKey: string
      timestamp: number
      signature: string
      folder: string
    }
  }

  const uploadToCloudinary = async (file: File) => {
    const { cloudName, apiKey, timestamp, signature, folder } = await fetchUploadSignature()
    const formData = new FormData()
    formData.append("file", file)
    formData.append("api_key", apiKey)
    formData.append("timestamp", `${timestamp}`)
    formData.append("signature", signature)
    formData.append("folder", folder)

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: formData,
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error?.message || "Upload failed")
    }
    return data.secure_url as string
  }

  const handlePrimaryImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const errorMessage = validateImageFile(file)
    if (errorMessage) {
      alert(errorMessage)
      event.target.value = ""
      return
    }

    try {
      setIsUploading(true)
      const url = await uploadToCloudinary(file)
      setFormData((prev) => ({ ...prev, image: url }))
    } catch (error) {
      console.error(error)
      alert(tr("Failed to upload image. Please try again.", "Das Bild konnte nicht hochgeladen werden. Bitte versuchen Sie es erneut."))
    } finally {
      setIsUploading(false)
      event.target.value = ""
    }
  }

  const handleGalleryUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    const invalidFile = files.find((file) => validateImageFile(file))
    if (invalidFile) {
      alert(validateImageFile(invalidFile) || tr("Invalid image file.", "Ungültige Bilddatei."))
      event.target.value = ""
      return
    }

    const availableSlots = maxGalleryImages - formData.images.length
    if (availableSlots <= 0) {
      alert(tr(`You can upload up to ${maxGalleryImages} images.`, `Sie können bis zu ${maxGalleryImages} Bilder hochladen.`))
      event.target.value = ""
      return
    }

    const selectedFiles = files.slice(0, availableSlots)

    try {
      setIsUploading(true)
      const newImages = await Promise.all(selectedFiles.map(uploadToCloudinary))
      setFormData((prev) => ({
        ...prev,
        images: [...prev.images, ...newImages].slice(0, maxGalleryImages),
      }))
    } catch (error) {
      console.error(error)
      alert(tr("Failed to upload one or more images. Please try again.", "Ein oder mehrere Bilder konnten nicht hochgeladen werden. Bitte versuchen Sie es erneut."))
    } finally {
      setIsUploading(false)
      event.target.value = ""
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isUploading) {
      alert(tr("Please wait for uploads to finish.", "Bitte warten Sie, bis alle Uploads abgeschlossen sind."))
      return
    }
    const errors = validateForm(formData)
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }
    setValidationErrors([])
    onSubmit(formData)
  }

  const isBusy = isSubmitting || isUploading

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {validationErrors.length > 0 ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{tr("Missing information", "Fehlende Angaben")}</AlertTitle>
          <AlertDescription>
            <p>{tr("Please complete the following before saving:", "Bitte vervollständigen Sie vor dem Speichern folgende Angaben:")}</p>
            <ul className="list-disc pl-4">
              {validationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">{tr("Car Name (EN)", "Fahrzeugname (Englisch)")}</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nameDe">{tr("Car Name (DE)", "Fahrzeugname (Deutsch)")}</Label>
          <Input
            id="nameDe"
            value={formData.nameDe}
            onChange={(e) => setFormData({ ...formData, nameDe: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="subtitle">{tr("Subtitle (EN)", "Untertitel (Englisch)")}</Label>
          <Input
            id="subtitle"
            value={formData.subtitle || ""}
            onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subtitleDe">{tr("Subtitle (DE)", "Untertitel (Deutsch)")}</Label>
          <Input
            id="subtitleDe"
            value={formData.subtitleDe || ""}
            onChange={(e) => setFormData({ ...formData, subtitleDe: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">{tr("Category", "Kategorie")}</Label>
        <Select
          value={formData.category}
          onValueChange={(value) =>
            setFormData({
              ...formData,
              category: value as AdminCar["category"],
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SEDAN">{tr("Sedan", "Limousine")}</SelectItem>
            <SelectItem value="SUV">SUV</SelectItem>
            <SelectItem value="LUXURY">{tr("Luxury", "Luxus")}</SelectItem>
            <SelectItem value="ELECTRIC">{tr("Electric", "Elektrisch")}</SelectItem>
            <SelectItem value="EV">{tr("EV", "Elektrofahrzeug")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="price">{tr("Price per Day (EUR)", "Preis pro Tag (EUR)")}</Label>
        <Input
          id="price"
          type="number"
          min="0"
          step="0.01"
          value={formData.price}
          onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="image">{tr("Main Image URL or Upload", "URL oder Upload des Hauptbildes")}</Label>
        <Input
          id="image"
          value={formData.image}
          onChange={(e) => setFormData({ ...formData, image: e.target.value })}
          required
          disabled={isBusy}
        />
        <Input id="imageUpload" type="file" accept="image/*" onChange={handlePrimaryImageUpload} disabled={isBusy} />
        {formData.image ? (
          <div className="rounded-lg border border-border p-2">
            <img
              src={formData.image}
              alt={tr(`${formData.name || "Car"} main`, `${formData.nameDe || formData.name || "Fahrzeug"} Hauptbild`)}
              className="h-32 w-full rounded-md object-cover"
            />
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="galleryUpload">{tr("Gallery Images (optional)", "Galeriebilder (optional)")}</Label>
        <Input
          id="galleryUpload"
          type="file"
          accept="image/*"
          multiple
          onChange={handleGalleryUpload}
          disabled={isBusy}
        />
        <p className="text-xs text-muted-foreground">{tr(`Upload up to ${maxGalleryImages} images, 4MB max each.`, `Laden Sie bis zu ${maxGalleryImages} Bilder mit jeweils höchstens 4 MB hoch.`)}</p>
        {formData.images.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {formData.images.map((src, index) => (
              <div key={`${src}-${index}`} className="relative overflow-hidden rounded-md border border-border">
                <img src={src} alt={`${locale === "de" ? formData.nameDe || formData.name || "Fahrzeug" : formData.name || "Car"} ${index + 1}`} className="h-24 w-full object-cover" />
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      images: prev.images.filter((_, imgIndex) => imgIndex !== index),
                    }))
                  }
                  className="absolute right-2 top-2 rounded-full bg-background/80 px-2 py-1 text-xs shadow"
                >
                  {tr("Remove", "Entfernen")}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="gearbox">{tr("Gearbox", "Getriebe")}</Label>
          <Input
            id="gearbox"
            value={formData.gearbox}
            onChange={(e) => setFormData({ ...formData, gearbox: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="seats">{tr("Seats", "Sitzplätze")}</Label>
          <Input
            id="seats"
            type="number"
            value={formData.seats}
            onChange={(e) => setFormData({ ...formData, seats: Number(e.target.value) })}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fuel">{tr("Fuel Type", "Kraftstoffart")}</Label>
          <Input
            id="fuel"
            value={formData.fuelType}
            onChange={(e) => setFormData({ ...formData, fuelType: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="acceleration">0-60 mph</Label>
          <Input
            id="acceleration"
            value={formData.acceleration}
            onChange={(e) => setFormData({ ...formData, acceleration: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="year">{tr("Year", "Baujahr")}</Label>
        <Select
          value={formData.year?.toString() || ""}
          onValueChange={(value) => setFormData({ ...formData, year: Number(value) })}
        >
          <SelectTrigger>
            <SelectValue placeholder={tr("Select year", "Baujahr auswählen")} />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 26 }, (_, i) => {
              const year = 2000 + i
              return (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">{tr("Status", "Status")}</Label>
        <Select
          value={formData.status}
          onValueChange={(value) => setFormData({ ...formData, status: value as AdminCar["status"] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AVAILABLE">{tr("Available", "Verfügbar")}</SelectItem>
            <SelectItem value="LOW_STOCK">{tr("Low Stock", "Begrenzt verfügbar")}</SelectItem>
            <SelectItem value="RENTED">{tr("Rented", "Vermietet")}</SelectItem>
            <SelectItem value="MAINTENANCE">{tr("Maintenance", "Wartung")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="description">{tr("Description (EN)", "Beschreibung (Englisch)")}</Label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full min-h-24 px-3 py-2 rounded-md border border-input bg-background"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="descriptionDe">{tr("Description (DE)", "Beschreibung (Deutsch)")}</Label>
          <textarea
            id="descriptionDe"
            value={formData.descriptionDe}
            onChange={(e) => setFormData({ ...formData, descriptionDe: e.target.value })}
            className="w-full min-h-24 px-3 py-2 rounded-md border border-input bg-background"
            required
          />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isBusy}>
        {isUploading
          ? tr("Uploading...", "Wird hochgeladen...")
          : isSubmitting
            ? tr("Saving...", "Wird gespeichert...")
            : initialCar
              ? tr("Update Car", "Fahrzeug aktualisieren")
              : tr("Add Car", "Fahrzeug hinzufügen")}
      </Button>
    </form>
  )
}
