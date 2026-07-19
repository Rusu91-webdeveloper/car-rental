"use client"

import type React from "react"
import { useEffect, useState, useTransition } from "react"
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
import { updateBookingStatus } from "@/app/actions/bookings"
import { deleteReviewAsAdmin } from "@/app/actions/reviews"
import {
  createAdminUser,
  setUserActiveState,
  deleteAdminUser,
  createManualReservation,
  deleteManualReservation,
} from "@/app/actions/admin"
import type { OwnerSetupProgress } from "@/lib/admin/owner-console"
import { useToast } from "@/hooks/use-toast"
import {
  CarIcon,
  Calendar,
  Users,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  XCircle,
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
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

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
  location: string
  totalPrice: number
  currency: string
  guaranteeAmount: number
  status: "PENDING" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "REJECTED"
  paymentMethod: "TRANSFER" | "PAY_AT_PICKUP"
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
  users,
  reviews,
  manualReservations,
  initialSection,
  generatedAt,
  setup,
  documentReviewCount,
}: {
  currentUser: { id: string; name: string; email: string }
  cars: AdminCar[]
  bookings: AdminBooking[]
  users: AdminUser[]
  reviews: AdminReview[]
  manualReservations: AdminManualReservation[]
  initialSection: string
  generatedAt: string
  setup: OwnerSetupProgress
  documentReviewCount: number | null
}) {
  const [isPending, startTransition] = useTransition()
  const [carsState, setCarsState] = useState<AdminCar[]>(cars)
  const [bookingsState, setBookingsState] = useState<AdminBooking[]>(bookings)
  const [usersState, setUsersState] = useState<AdminUser[]>(users)
  const [reviewsState, setReviewsState] = useState<AdminReview[]>(reviews)
  const [manualReservationsState, setManualReservationsState] = useState<AdminManualReservation[]>(manualReservations)
  const [activeTab, setActiveTab] = useState(initialSection)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false)
  const [editCarId, setEditCarId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const locale = useLocale()
  const router = useRouter()
  const { toast } = useToast()

  const selectSection = (section: string) => {
    if (!ADMIN_SECTIONS.has(section)) return
    setActiveTab(section)
    setSearchTerm("")
    setFilterStatus("all")

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
      setFilterStatus("all")
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

  const revenueBookings = bookingsState.filter((booking) =>
    ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(booking.status),
  )
  const totalRevenueCents = revenueBookings.reduce((sum, booking) => sum + booking.totalPrice, 0)
  const activeBookings = bookingsState.filter((b) => b.status === "CONFIRMED").length
  const pendingBookings = bookingsState.filter((b) => b.status === "PENDING").length
  const completedBookings = bookingsState.filter((b) => b.status === "COMPLETED").length
  const availableCars = carsState.filter((c) => c.status === "AVAILABLE").length
  const rentedCars = carsState.filter((c) => c.status === "RENTED").length
  const unavailableCars = carsState.filter((c) => ["LOW_STOCK", "MAINTENANCE"].includes(c.status)).length
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
    .reduce((sum, booking) => sum + booking.totalPrice, 0)
  const customerCount = usersState.filter((user) => user.role === "USER").length
  const attentionCount = pendingBookings + unavailableCars + (documentReviewCount ?? 0)

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
    const matchesFilter = filterStatus === "all" || booking.status === filterStatus
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
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      if (result?.user) {
        setUsersState((prev) => [normalizeAdminUser(result.user), ...prev])
        setIsAddUserDialogOpen(false)
        toast({
          title: "Success",
          description: "User created successfully.",
          variant: "default",
        })
      }
    })
  }

  const handleToggleUserActive = (targetUser: AdminUser) => {
    const nextState = !targetUser.isActive
    const actionLabel = nextState ? "activate" : "deactivate"
    const displayName = targetUser.name || targetUser.email

    if (!confirm(`Are you sure you want to ${actionLabel} ${displayName}?`)) {
      return
    }

    startTransition(async () => {
      const result = await setUserActiveState({
        userId: targetUser.id,
        isActive: nextState,
      })

      if (result?.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      if (result?.user) {
        setUsersState((prev) =>
          prev.map((user) => (user.id === targetUser.id ? normalizeAdminUser(result.user) : user)),
        )
        toast({
          title: "Success",
          description: `${displayName} has been ${nextState ? "activated" : "deactivated"}.`,
          variant: "default",
        })
      }
    })
  }

  const handleDeleteUser = (targetUser: AdminUser) => {
    const displayName = targetUser.name || targetUser.email
    if (!confirm(`Delete ${displayName}? This action cannot be undone.`)) {
      return
    }

    startTransition(async () => {
      const result = await deleteAdminUser(targetUser.id)
      if (result?.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      setUsersState((prev) => prev.filter((user) => user.id !== targetUser.id))
      toast({
        title: "Success",
        description: "User deleted successfully.",
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
          setCarsState((prev) => [mapCar(result.car), ...prev])
          setIsAddDialogOpen(false)
          toast({
            title: "Success",
            description: "Car created successfully!",
            variant: "default",
          })
        } else if (result?.error) {
          // Handle validation errors with detailed messages
          if (result.validationErrors && Array.isArray(result.validationErrors)) {
            toast({
              title: "Please check the car details",
              description: (
                <div className="space-y-1">
                  <p className="font-medium">Please fix the following errors:</p>
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
              title: "Error",
              description: result.error,
              variant: "destructive",
            })
          }
        }
      } catch (error) {
        console.error(error)
        toast({
          title: "Error",
          description: "Failed to create car. Please try again.",
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
          setCarsState((prev) => prev.map((car) => (car.id === carId ? mapCar(result.car) : car)))
          setEditCarId((current) => (current === carId ? null : current))
          toast({
            title: "Success",
            description: "Car updated successfully!",
            variant: "default",
          })
        } else if (result?.error) {
          // Handle validation errors with detailed messages
          if (result.validationErrors && Array.isArray(result.validationErrors)) {
            toast({
              title: "Please check the car details",
              description: (
                <div className="space-y-1">
                  <p className="font-medium">Please fix the following errors:</p>
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
              title: "Error",
              description: result.error,
              variant: "destructive",
            })
          }
        }
      } catch (error) {
        console.error(error)
        toast({
          title: "Error",
          description: "Failed to update car. Please try again.",
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
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }
      setCarsState((prev) => prev.filter((car) => car.id !== carId))
      toast({
        title: "Success",
        description: "Car deleted successfully!",
        variant: "default",
      })
    })
  }

  const handleUpdateBookingStatus = (bookingId: string, status: AdminBooking["status"]) => {
    startTransition(async () => {
      const result = await updateBookingStatus({ bookingId, status })
      if (result?.error) {
        alert(result.error)
        return
      }
      setBookingsState((prev) => prev.map((booking) => (booking.id === bookingId ? { ...booking, status } : booking)))
    })
  }

  const handleCreateManualReservation = (reservation: ManualReservationFormValues) => {
    startTransition(async () => {
      const pickupDate = new Date(reservation.pickupDate)
      const dropoffDate = new Date(reservation.dropoffDate)

      if (Number.isNaN(pickupDate.getTime()) || Number.isNaN(dropoffDate.getTime())) {
        toast({
          title: "Error",
          description: "Please select valid pickup and drop-off date/time values.",
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
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      if (result?.reservation) {
        setManualReservationsState((prev) => [result.reservation, ...prev])
        toast({
          title: "Success",
          description: "Manual reservation created and car availability has been blocked for that period.",
          variant: "default",
        })
      }
    })
  }

  const handleDeleteManualReservation = (reservationId: string) => {
    if (!confirm("Remove this manual reservation and make the car available again for those dates?")) {
      return
    }

    startTransition(async () => {
      const result = await deleteManualReservation(reservationId)
      if (result?.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      setManualReservationsState((prev) => prev.filter((reservation) => reservation.id !== reservationId))
      toast({
        title: "Success",
        description: "Manual reservation removed successfully.",
        variant: "default",
      })
    })
  }

  const handleDeleteReview = (review: AdminReview) => {
    const displayCarName = getReviewCarName(review)
    if (!confirm(`Delete this review for ${displayCarName}? This action cannot be undone.`)) {
      return
    }

    startTransition(async () => {
      const result = await deleteReviewAsAdmin(review.id)
      if (!result.success) {
        toast({
          title: "Error",
          description: result.error,
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
        title: "Success",
        description: "Review deleted successfully.",
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
              <p className="text-sm font-medium text-primary">Today</p>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your business at a glance</h1>
              <p className="mt-1 text-sm text-muted-foreground">The numbers and actions that matter today.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => startTransition(() => router.refresh())}
              >
                <RefreshCw className={isPending ? "animate-spin" : undefined} aria-hidden="true" />
                Refresh data
              </Button>
              <Button type="button" onClick={() => selectSection("bookings")}>
                View bookings <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </header>

          {!setup.readyForBookings ? (
            <Card className="overflow-hidden border-primary/20 bg-primary/[0.025]">
              <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{setup.percent}% complete</Badge>
                    <span className="text-sm text-muted-foreground">Your progress is saved</span>
                  </div>
                  <h2 className="mt-3 text-xl font-semibold">Finish setting up your business</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Continue the guided setup. You will only see one clear step at a time.
                  </p>
                  <div className="mt-4 h-2 max-w-lg overflow-hidden rounded-full bg-primary/10" aria-label={`${setup.percent}% setup complete`}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${setup.percent}%` }} />
                  </div>
                </div>
                <Button asChild size="lg" className="shrink-0">
                  <Link href="/admin/settings">
                    Continue setup <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Your business is ready</AlertTitle>
              <AlertDescription>Essential setup is complete and customers can use the current settings.</AlertDescription>
            </Alert>
          )}

          <section aria-labelledby="business-numbers-title">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="business-numbers-title" className="text-lg font-semibold">Key numbers</h2>
              <span className="text-xs text-muted-foreground">Updated now</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardContent className="p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><DollarSign className="h-5 w-5" /></span>
                  <p className="mt-4 text-sm text-muted-foreground">Income this month</p>
                  <p className="mt-1 text-2xl font-bold">{formatCents(revenueThisMonthCents)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatCents(totalRevenueCents)} total confirmed income</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Calendar className="h-5 w-5" /></span>
                  <p className="mt-4 text-sm text-muted-foreground">Upcoming bookings</p>
                  <p className="mt-1 text-2xl font-bold">{upcomingBookings.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{pendingBookings} waiting for your approval</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><CarIcon className="h-5 w-5" /></span>
                  <p className="mt-4 text-sm text-muted-foreground">Cars</p>
                  <p className="mt-1 text-2xl font-bold">{carsState.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{availableCars} available · {rentedCars} rented</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-700"><Users className="h-5 w-5" /></span>
                  <p className="mt-4 text-sm text-muted-foreground">Customers</p>
                  <p className="mt-1 text-2xl font-bold">{customerCount}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Registered customer accounts</p>
                </CardContent>
              </Card>
            </div>
          </section>

          <Card className={attentionCount > 0 ? "border-amber-200" : "border-emerald-200"}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>{attentionCount > 0 ? "What needs attention" : "Everything is under control"}</CardTitle>
                  <CardDescription>{attentionCount > 0 ? `${attentionCount} items may need you today.` : "There are no urgent actions right now."}</CardDescription>
                </div>
                <Badge variant={attentionCount > 0 ? "secondary" : "outline"}>{attentionCount}</Badge>
              </div>
            </CardHeader>
            {attentionCount > 0 ? (
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <button type="button" onClick={() => selectSection("bookings")} className="flex items-center justify-between rounded-lg border p-4 text-left transition hover:bg-muted/50">
                  <span><span className="block text-sm font-medium">Bookings to approve</span><span className="text-xs text-muted-foreground">Review customer requests</span></span>
                  <Badge variant={pendingBookings > 0 ? "destructive" : "secondary"}>{pendingBookings}</Badge>
                </button>
                <button type="button" onClick={() => selectSection("cars")} className="flex items-center justify-between rounded-lg border p-4 text-left transition hover:bg-muted/50">
                  <span><span className="block text-sm font-medium">Unavailable cars</span><span className="text-xs text-muted-foreground">Check status or maintenance</span></span>
                  <Badge variant={unavailableCars > 0 ? "destructive" : "secondary"}>{unavailableCars}</Badge>
                </button>
                <Link href="/admin/documents" className="flex items-center justify-between rounded-lg border p-4 transition hover:bg-muted/50">
                  <span><span className="block text-sm font-medium">Documents to review</span><span className="text-xs text-muted-foreground">Check customer uploads</span></span>
                  <Badge variant={(documentReviewCount ?? 0) > 0 ? "destructive" : "secondary"}>{documentReviewCount ?? "—"}</Badge>
                </Link>
              </CardContent>
            ) : null}
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
              <CardDescription>Go straight to the work you do most often.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="h-auto py-4 flex-col gap-2">
                      <CarIcon className="w-6 h-6" />
                      <span>Add car</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Add New Car</DialogTitle>
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
                  <span>Review bookings</span>
                  {pendingBookings > 0 && (
                    <Badge variant="destructive" className="absolute top-2 right-2">
                      {pendingBookings}
                    </Badge>
                  )}
                </Button>

                <Button variant="outline" className="h-auto py-4 flex-col gap-2 bg-transparent" asChild>
                  <Link href="/admin/settings">
                    <Users className="w-6 h-6" />
                    <span>Business settings</span>
                  </Link>
                </Button>

                <Button variant="outline" className="h-auto py-4 flex-col gap-2 bg-transparent" asChild>
                  <Link href="/admin/documents">
                    <FileCheck2 className="w-6 h-6" />
                    <span>Review documents</span>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Bookings */}
          <Card>
            <CardHeader>
              <CardTitle>Upcoming bookings</CardTitle>
              <CardDescription>The next pickups that need your attention.</CardDescription>
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
                          {new Date(booking.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:block sm:text-right">
                        <div className="font-bold">{formatCents(booking.totalPrice, booking.currency)}</div>
                        <Badge
                          variant={getBookingStatusBadge(booking.status).variant}
                          className={`${getBookingStatusBadge(booking.status).className} sm:mt-1`}
                        >
                          {booking.status}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
                {upcomingBookings.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">No upcoming bookings</div>
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
            <p className="text-sm font-medium text-primary">Cars</p>
            <h1 className="text-2xl font-bold tracking-tight">Which cars are ready to rent?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Add cars, update availability, and keep their customer details accurate.
            </p>
          </header>
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search cars..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any availability</SelectItem>
                <SelectItem value="AVAILABLE">Available</SelectItem>
                <SelectItem value="LOW_STOCK">Limited availability</SelectItem>
                <SelectItem value="RENTED">Rented</SelectItem>
                <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto">
                  <CarIcon className="w-4 h-4 mr-2" />
                  Add car
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add a car</DialogTitle>
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
                        <Badge
                          variant={
                            car.status === "AVAILABLE"
                              ? "default"
                              : car.status === "LOW_STOCK"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {car.status === "LOW_STOCK" ? "LIMITED AVAILABILITY" : car.status}
                        </Badge>
                      </div>

                      <div className="mb-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Category:</span>
                          <span className="font-medium">{car.category}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Price:</span>
                          <span className="font-bold text-primary">{formatCents(car.price)}/day</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Seats:</span>
                          <span className="font-medium">{car.specs.seats}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Fuel:</span>
                          <span className="font-medium">{car.specs.fuel}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Dialog open={editCarId === car.id} onOpenChange={(open) => setEditCarId(open ? car.id : null)}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Edit Car</DialogTitle>
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
                            if (confirm(`Are you sure you want to delete ${getCarName(car)}?`)) {
                              handleDeleteCar(car.id)
                            }
                          }}
                        >
                          Delete
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
                  <p className="text-muted-foreground">No cars found</p>
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
            <p className="text-sm font-medium text-primary">Bookings</p>
            <h1 className="text-2xl font-bold tracking-tight">Which bookings need attention?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Review customer requests or reserve a car for a direct customer.
            </p>
          </header>
          <Card>
            <CardHeader>
              <CardTitle>Reserve a car for a direct customer</CardTitle>
              <CardDescription>
                Reserve a car for direct customers. Reserved dates are blocked and cannot be booked online.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ManualReservationForm
                cars={carsState}
                onSubmit={handleCreateManualReservation}
                isSubmitting={isPending}
              />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Current manual reservations</h3>
                  <Badge variant="outline">{manualReservationsState.length}</Badge>
                </div>

                {manualReservationsState.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No manual reservations yet.</p>
                ) : filteredManualReservations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No manual reservations match your search.</p>
                ) : (
                  <div className="space-y-3">
                    {filteredManualReservations.map((reservation) => {
                      const car = carsState.find((item) => item.id === reservation.carId)
                      return (
                        <div key={reservation.id} className="rounded-lg border border-border p-3">
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                              <p className="font-semibold">{car ? getCarName(car) : "Unknown car"}</p>
                              <p className="text-sm text-muted-foreground">
                                Reserved for {reservation.customerName} • {reservation.customerPhone}
                              </p>
                              <div className="grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                                <p>Pick-up: {new Date(reservation.pickupDate).toLocaleString()}</p>
                                <p>Drop-off: {new Date(reservation.dropoffDate).toLocaleString()}</p>
                                <p>Price: {formatCents(reservation.totalPrice)}</p>
                                <p>Created: {new Date(reservation.createdAt).toLocaleDateString()}</p>
                              </div>
                            </div>

                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={isPending}
                              onClick={() => handleDeleteManualReservation(reservation.id)}
                            >
                              Remove
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
                placeholder="Search bookings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
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
                              {booking.status}
                            </Badge>
                            <Select
                              value={booking.status}
                              onValueChange={(value) =>
                                handleUpdateBookingStatus(booking.id, value as AdminBooking["status"])
                              }
                            >
                              <SelectTrigger className="w-full sm:w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PENDING">
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    Pending
                                  </div>
                                </SelectItem>
                                <SelectItem value="CONFIRMED">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4" />
                                    Confirmed
                                  </div>
                                </SelectItem>
                                <SelectItem value="IN_PROGRESS">
                                  <div className="flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4" />
                                    In Progress
                                  </div>
                                </SelectItem>
                                <SelectItem value="COMPLETED">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4" />
                                    Completed
                                  </div>
                                </SelectItem>
                                <SelectItem value="CANCELLED">
                                  <div className="flex items-center gap-2">
                                    <XCircle className="w-4 h-4" />
                                    Cancelled
                                  </div>
                                </SelectItem>
                                <SelectItem value="REJECTED">
                                  <div className="flex items-center gap-2">
                                    <XCircle className="w-4 h-4" />
                                    Rejected
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                          <div>
                            <span className="text-muted-foreground">Location:</span>
                            <span className="ml-2 font-medium">{booking.location}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Booking ID:</span>
                            <span className="ml-2 font-medium">#{booking.id.slice(0, 8)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Payment:</span>
                            <span className="ml-2 font-medium">
                              {booking.paymentMethod === "TRANSFER" ? "Bank Transfer" : "Pay at Pickup"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Pick-up:</span>
                            <span className="ml-2 font-medium">
                              {new Date(booking.pickupDate).toLocaleDateString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Drop-off:</span>
                            <span className="ml-2 font-medium">
                              {new Date(booking.dropoffDate).toLocaleDateString()}
                            </span>
                          </div>
                          {booking.guaranteeAmount > 0 && (
                            <div>
                              <span className="text-muted-foreground">Refundable security deposit:</span>
                              <span className="ml-2 font-medium">
                                {formatCents(booking.guaranteeAmount, booking.currency)}
                              </span>
                            </div>
                          )}
                          {booking.insurance && (
                            <div>
                              <span className="text-muted-foreground">Insurance:</span>
                              <span className="ml-2 font-medium">
                                {booking.insurance.name} · {formatCents(booking.insurance.subtotal, booking.currency)}
                              </span>
                            </div>
                          )}
                          {booking.customer && (
                            <div className="sm:col-span-2 rounded-md border p-3 space-y-1">
                              <p className="font-medium">Customer and driver</p>
                              <p>
                                {booking.customer.name} · {booking.customer.email}
                              </p>
                              {booking.customer.phone && <p>Phone: {booking.customer.phone}</p>}
                              {booking.customer.dateOfBirth && (
                                <p>Date of birth: {new Date(booking.customer.dateOfBirth).toLocaleDateString()}</p>
                              )}
                              {booking.customer.licenceNumber && <p>Licence: {booking.customer.licenceNumber}</p>}
                              <p className="text-xs text-muted-foreground">
                                {booking.customer.validatedAt
                                  ? `Checked ${new Date(booking.customer.validatedAt).toLocaleString()}`
                                  : "Saved with this booking"}
                              </p>
                            </div>
                          )}
                          {booking.legalAcceptances.length > 0 && (
                            <div className="sm:col-span-2 rounded-md border p-3 space-y-1">
                              <p className="font-medium">Customer agreements</p>
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
                                  · {acceptance.locale} · accepted {new Date(acceptance.acceptedAt).toLocaleString()} ·{" "}
                                  {acceptance.source}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-border">
                          <span className="text-muted-foreground text-sm">Total Amount</span>
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
                  <p className="text-muted-foreground">No bookings found</p>
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
            <p className="text-sm font-medium text-primary">People</p>
            <h1 className="text-2xl font-bold tracking-tight">Who uses the app?</h1>
            <p className="mt-1 text-sm text-muted-foreground">Find customer accounts and control who can sign in.</p>
          </header>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search people..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
              <DialogTrigger asChild>
                <Button className="sm:w-auto">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add person
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add a person</DialogTitle>
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
                            {user.role === "ADMIN" ? "Team member" : "Customer"}
                          </Badge>
                          <Badge variant={user.isActive ? "outline" : "destructive"}>
                            {user.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <p className="mb-2 break-all text-sm text-muted-foreground">{user.email}</p>
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Bookings:</span>
                            <span className="ml-2 font-bold">{userBookings.length}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Total Spent:</span>
                            <span className="ml-2 font-bold">{formatCents(userRevenue)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Joined:</span>
                            <span className="ml-2 font-medium">{new Date(user.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:flex-col md:items-end">
                        <Button
                          size="sm"
                          variant={user.isActive ? "outline" : "default"}
                          onClick={() => handleToggleUserActive(user)}
                          disabled={isPending || isCurrentAdmin}
                          title={isCurrentAdmin ? "You cannot change your own active status" : undefined}
                          className="w-full sm:w-auto"
                        >
                          {user.isActive ? (
                            <>
                              <UserX className="w-4 h-4 mr-2" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-4 h-4 mr-2" />
                              Activate
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteUser(user)}
                          disabled={isPending || isCurrentAdmin}
                          title={isCurrentAdmin ? "You cannot delete your own account" : undefined}
                          className="w-full sm:w-auto"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
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
                  <p className="text-muted-foreground">No users found</p>
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
            <p className="text-sm font-medium text-primary">Reviews</p>
            <h1 className="text-2xl font-bold tracking-tight">What are customers saying?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Read feedback and remove reviews that should not remain public.
            </p>
          </header>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search reviews, users, cars, booking number..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{reviewsState.length} total</Badge>
              <Badge variant="secondary">{filteredReviews.length} shown</Badge>
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
                        By {review.userName || review.userEmail} ({review.userEmail}) •{" "}
                        {new Date(review.createdAt).toLocaleString()}
                      </p>
                    </div>

                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleDeleteReview(review)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredReviews.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No reviews found</p>
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
            <p className="text-sm font-medium text-primary">Reports</p>
            <h1 className="text-2xl font-bold tracking-tight">How is the business doing?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              See revenue, booking progress, and car availability at a glance.
            </p>
          </header>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Analytics */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue overview</CardTitle>
                <CardDescription>Total earnings breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Revenue</p>
                      <p className="text-xl font-bold sm:text-2xl">{formatCents(totalRevenueCents)}</p>
                    </div>
                    <DollarSign className="w-8 h-8 text-green-500" />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                    <div>
                      <p className="text-sm text-muted-foreground">This Month</p>
                      <p className="text-xl font-bold sm:text-2xl">{formatCents(revenueThisMonthCents)}</p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-blue-500" />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                    <div>
                      <p className="text-sm text-muted-foreground">Average Booking</p>
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
                <CardTitle>Booking progress</CardTitle>
                <CardDescription>Current booking distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-blue-50">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-6 h-6 text-blue-600" />
                      <div>
                        <p className="font-medium text-blue-900">Confirmed</p>
                        <p className="text-sm text-blue-600">{activeBookings} bookings</p>
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-blue-600">{activeBookings}</div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-yellow-50">
                    <div className="flex items-center gap-3">
                      <Clock className="w-6 h-6 text-yellow-600" />
                      <div>
                        <p className="font-medium text-yellow-900">Pending</p>
                        <p className="text-sm text-yellow-600">{pendingBookings} bookings</p>
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-yellow-600">{pendingBookings}</div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-green-50">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                      <div>
                        <p className="font-medium text-green-900">Completed</p>
                        <p className="text-sm text-green-600">{completedBookings} bookings</p>
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
                <CardTitle>Car availability</CardTitle>
                <CardDescription>Fleet availability status</CardDescription>
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
                            {status === "LOW_STOCK" ? "Limited availability" : status.toLowerCase()}
                          </span>
                          <span className="text-sm text-muted-foreground">{count} cars</span>
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
                <CardTitle>Most booked cars</CardTitle>
                <CardDescription>Popular vehicles this month</CardDescription>
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
                          <p className="text-sm text-muted-foreground">{car.bookingCount} bookings</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold sm:text-base">{formatCents(car.price)}</p>
                          <p className="text-xs text-muted-foreground">per day</p>
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
  onSubmit,
  isSubmitting = false,
}: {
  cars: AdminCar[]
  onSubmit: (reservation: ManualReservationFormValues) => void
  isSubmitting?: boolean
}) {
  const formatDatetimeLocal = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    const hours = String(date.getHours()).padStart(2, "0")
    const minutes = String(date.getMinutes()).padStart(2, "0")
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  const createInitialDates = () => {
    const pickup = new Date()
    pickup.setDate(pickup.getDate() + 1)
    pickup.setHours(10, 0, 0, 0)
    const dropoff = new Date(pickup)
    dropoff.setDate(dropoff.getDate() + 2)
    return {
      pickupDate: formatDatetimeLocal(pickup),
      dropoffDate: formatDatetimeLocal(dropoff),
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

  useEffect(() => {
    if (!formData.carId && cars[0]?.id) {
      // Keep the controlled form aligned when the first async car option arrives.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData((prev) => ({ ...prev, carId: cars[0].id }))
    }
  }, [cars, formData.carId])

  const validateForm = () => {
    const errors: string[] = []

    if (!formData.carId) errors.push("Please select a car.")
    if (!formData.customerName.trim()) errors.push("Customer name is required.")
    if (!formData.customerPhone.trim()) errors.push("Customer phone number is required.")
    if (formData.totalPrice < 0 || !Number.isFinite(formData.totalPrice)) {
      errors.push("Price must be 0 or greater.")
    }

    const pickupDate = new Date(formData.pickupDate)
    const dropoffDate = new Date(formData.dropoffDate)

    if (Number.isNaN(pickupDate.getTime()) || Number.isNaN(dropoffDate.getTime())) {
      errors.push("Please select valid pickup and drop-off date/time.")
    } else {
      if (pickupDate <= new Date()) {
        errors.push("Pickup date must be in the future.")
      }
      if (dropoffDate <= pickupDate) {
        errors.push("Drop-off date must be after pickup date.")
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
          <AlertTitle>Missing information</AlertTitle>
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
          <Label htmlFor="reservationCarId">Car</Label>
          <Select
            value={formData.carId}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, carId: value }))}
            disabled={isSubmitting || cars.length === 0}
          >
            <SelectTrigger id="reservationCarId">
              <SelectValue placeholder={cars.length === 0 ? "No cars available" : "Select a car"} />
            </SelectTrigger>
            <SelectContent>
              {cars.map((car) => (
                <SelectItem key={car.id} value={car.id}>
                  {car.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reservationPrice">Price (€)</Label>
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
          <Label htmlFor="reservationCustomerName">Customer Name</Label>
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
          <Label htmlFor="reservationCustomerPhone">Phone Number</Label>
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
          <Label htmlFor="reservationPickupDate">Pick-up Date & Time</Label>
          <Input
            id="reservationPickupDate"
            type="datetime-local"
            value={formData.pickupDate}
            min={formatDatetimeLocal(new Date())}
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
          <Label htmlFor="reservationDropoffDate">Drop-off Date & Time</Label>
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

      <Button type="submit" disabled={isSubmitting || cars.length === 0}>
        {isSubmitting ? "Saving..." : "Reserve Car"}
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
  const [formData, setFormData] = useState<UserFormValues>({
    name: "",
    email: "",
    role: "USER",
  })
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const validateForm = () => {
    const errors: string[] = []
    if (!formData.name.trim()) errors.push("Name is required.")
    if (!formData.email.trim()) errors.push("Email is required.")
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (formData.email.trim() && !emailPattern.test(formData.email.trim())) errors.push("Please enter a valid email.")
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
          <AlertTitle>Missing information</AlertTitle>
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
        <Label htmlFor="newUserName">Full name</Label>
        <Input
          id="newUserName"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="John Doe"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="newUserEmail">Email</Label>
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
        <Label htmlFor="newUserRole">Role</Label>
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
            <SelectItem value="USER">User</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create User"}
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

    if (!data.name.trim()) errors.push("Car name (EN) is required.")
    if (!data.nameDe.trim()) errors.push("Car name (DE) is required.")
    if (!data.category) errors.push("Category is required.")
    if (!Number.isFinite(data.price) || data.price <= 0) errors.push("Price per day must be greater than 0.")
    if (!data.image.trim()) errors.push("Main image URL is required.")
    if (!data.gearbox.trim()) errors.push("Gearbox is required.")
    if (!Number.isFinite(data.seats) || data.seats < 2 || data.seats > 9) errors.push("Seats must be between 2 and 9.")
    if (!data.fuelType.trim()) errors.push("Fuel type is required.")
    if (!data.acceleration.trim()) errors.push("Acceleration is required.")
    if (!Number.isFinite(data.year) || data.year < 1900 || data.year > 2030)
      errors.push("Year must be between 1900 and 2030.")
    if (!data.status) errors.push("Status is required.")
    if (!data.description.trim()) errors.push("Description (EN) is required.")
    if (!data.descriptionDe.trim()) errors.push("Description (DE) is required.")

    return errors
  }

  const validateImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      return "Only image files are supported."
    }
    if (file.size > maxUploadBytes) {
      return "Image is too large. Please upload a file under 4MB."
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
      alert("Failed to upload image. Please try again.")
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
      alert(validateImageFile(invalidFile) || "Invalid image file.")
      event.target.value = ""
      return
    }

    const availableSlots = maxGalleryImages - formData.images.length
    if (availableSlots <= 0) {
      alert(`You can upload up to ${maxGalleryImages} images.`)
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
      alert("Failed to upload one or more images. Please try again.")
    } finally {
      setIsUploading(false)
      event.target.value = ""
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isUploading) {
      alert("Please wait for uploads to finish.")
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
          <AlertTitle>Missing information</AlertTitle>
          <AlertDescription>
            <p>Please complete the following before saving:</p>
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
          <Label htmlFor="name">Car Name (EN)</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nameDe">Car Name (DE)</Label>
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
          <Label htmlFor="subtitle">Subtitle (EN)</Label>
          <Input
            id="subtitle"
            value={formData.subtitle || ""}
            onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subtitleDe">Subtitle (DE)</Label>
          <Input
            id="subtitleDe"
            value={formData.subtitleDe || ""}
            onChange={(e) => setFormData({ ...formData, subtitleDe: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
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
            <SelectItem value="SEDAN">Sedan</SelectItem>
            <SelectItem value="SUV">SUV</SelectItem>
            <SelectItem value="LUXURY">Luxury</SelectItem>
            <SelectItem value="ELECTRIC">Electric</SelectItem>
            <SelectItem value="EV">EV</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="price">Price per Day (EUR)</Label>
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
        <Label htmlFor="image">Main Image URL or Upload</Label>
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
              alt={`${formData.name || "Car"} main`}
              className="h-32 w-full rounded-md object-cover"
            />
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="galleryUpload">Gallery Images (optional)</Label>
        <Input
          id="galleryUpload"
          type="file"
          accept="image/*"
          multiple
          onChange={handleGalleryUpload}
          disabled={isBusy}
        />
        <p className="text-xs text-muted-foreground">Upload up to {maxGalleryImages} images, 4MB max each.</p>
        {formData.images.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {formData.images.map((src, index) => (
              <div key={`${src}-${index}`} className="relative overflow-hidden rounded-md border border-border">
                <img src={src} alt={`${formData.name || "Car"} ${index + 1}`} className="h-24 w-full object-cover" />
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
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="gearbox">Gearbox</Label>
          <Input
            id="gearbox"
            value={formData.gearbox}
            onChange={(e) => setFormData({ ...formData, gearbox: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="seats">Seats</Label>
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
          <Label htmlFor="fuel">Fuel Type</Label>
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
        <Label htmlFor="year">Year</Label>
        <Select
          value={formData.year?.toString() || ""}
          onValueChange={(value) => setFormData({ ...formData, year: Number(value) })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select year" />
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
        <Label htmlFor="status">Status</Label>
        <Select
          value={formData.status}
          onValueChange={(value) => setFormData({ ...formData, status: value as AdminCar["status"] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AVAILABLE">Available</SelectItem>
            <SelectItem value="LOW_STOCK">Low Stock</SelectItem>
            <SelectItem value="RENTED">Rented</SelectItem>
            <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="description">Description (EN)</Label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full min-h-24 px-3 py-2 rounded-md border border-input bg-background"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="descriptionDe">Description (DE)</Label>
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
        {isUploading ? "Uploading..." : isSubmitting ? "Saving..." : initialCar ? "Update Car" : "Add Car"}
      </Button>
    </form>
  )
}
