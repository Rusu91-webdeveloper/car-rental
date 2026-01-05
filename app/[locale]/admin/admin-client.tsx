"use client"

import type React from "react"
import { useState, useTransition, useEffect } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "@/navigation"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { formatCents } from "@/lib/money"
import { createCar as createCarAction, updateCar as updateCarAction, deleteCar as deleteCarAction } from "@/app/actions/cars"
import { updateBookingStatus } from "@/app/actions/bookings"
import { getCompanySettings, updateCompanySettings } from "@/app/actions/settings"
import {
  LayoutDashboard,
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
  Settings,
  LogOut,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

interface AdminUser {
  id: string
  name: string | null
  email: string
  role: "ADMIN" | "USER"
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
  status: "PENDING" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "REJECTED"
  createdAt: string
}

export default function AdminDashboard({
  currentUser,
  cars,
  bookings,
  users,
}: {
  currentUser: { name: string; email: string }
  cars: AdminCar[]
  bookings: AdminBooking[]
  users: AdminUser[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [carsState, setCarsState] = useState<AdminCar[]>(cars)
  const [bookingsState, setBookingsState] = useState<AdminBooking[]>(bookings)
  const [usersState] = useState<AdminUser[]>(users)
  const [activeTab, setActiveTab] = useState("overview")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editCarId, setEditCarId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [settings, setSettings] = useState<any>(null)
  const [isLoadingSettings, setIsLoadingSettings] = useState(false)
  const locale = useLocale()
  const t = useTranslations()

  const getLocalizedText = (valueEn: string, valueDe?: string | null) => {
    return locale === "de" ? valueDe || valueEn : valueEn
  }

  const getCarName = (car: Pick<AdminCar, "name" | "nameDe">) => getLocalizedText(car.name, car.nameDe)
  const getCarSubtitle = (car: Pick<AdminCar, "subtitle" | "subtitleDe">) =>
    locale === "de" ? car.subtitleDe || car.subtitle : car.subtitle
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

  const totalRevenueCents = bookingsState.reduce((sum, booking) => sum + booking.totalPrice, 0)
  const activeBookings = bookingsState.filter((b) => b.status === "CONFIRMED").length
  const pendingBookings = bookingsState.filter((b) => b.status === "PENDING").length
  const completedBookings = bookingsState.filter((b) => b.status === "COMPLETED").length
  const availableCars = carsState.filter((c) => c.status === "AVAILABLE").length
  const revenueThisMonthCents = bookingsState
    .filter((b) => {
      const bookingDate = new Date(b.createdAt)
      const now = new Date()
      return bookingDate.getMonth() === now.getMonth() && bookingDate.getFullYear() === now.getFullYear()
    })
    .reduce((sum, booking) => sum + booking.totalPrice, 0)

  // Load settings when settings tab is opened
  useEffect(() => {
    if (activeTab === "settings" && !settings && !isLoadingSettings) {
      setIsLoadingSettings(true)
      getCompanySettings().then((result) => {
        if (result?.success && result.settings) {
          setSettings(result.settings)
        }
        setIsLoadingSettings(false)
      })
    }
  }, [activeTab, settings, isLoadingSettings])

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

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/" })
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
        })

        if (result?.car) {
          setCarsState((prev) => [mapCar(result.car), ...prev])
          setIsAddDialogOpen(false)
        } else if (result?.error) {
          alert(result.error)
        }
      } catch (error) {
        console.error(error)
        alert("Failed to create car. Please try again.")
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
        })

        if (result?.car) {
          setCarsState((prev) => prev.map((car) => (car.id === carId ? mapCar(result.car) : car)))
          setEditCarId((current) => (current === carId ? null : current))
        } else if (result?.error) {
          alert(result.error)
        }
      } catch (error) {
        console.error(error)
        alert("Failed to update car. Please try again.")
      }
    })
  }

  const handleDeleteCar = (carId: string) => {
    startTransition(async () => {
      const result = await deleteCarAction(carId)
      if (result?.error) {
        alert(result.error)
        return
      }
      setCarsState((prev) => prev.filter((car) => car.id !== carId))
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

  return (
    <div className="min-h-screen bg-muted flex">
      {/* Sidebar Navigation */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-background border-r border-border fixed h-full overflow-y-auto">
        <div className="p-6 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <CarIcon className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">RentCar Admin</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Administrator Panel</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 min-h-0">
          <button
            onClick={() => setActiveTab("overview")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              activeTab === "overview" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="font-medium">Overview</span>
          </button>

          <button
            onClick={() => setActiveTab("cars")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              activeTab === "cars" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
            }`}
          >
            <CarIcon className="w-5 h-5" />
            <span className="font-medium">Cars</span>
            <Badge variant="secondary" className="ml-auto">
              {carsState.length}
            </Badge>
          </button>

          <button
            onClick={() => setActiveTab("bookings")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              activeTab === "bookings" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
            }`}
          >
            <Calendar className="w-5 h-5" />
            <span className="font-medium">Bookings</span>
            {pendingBookings > 0 && (
              <Badge variant="destructive" className="ml-auto">
                {pendingBookings}
              </Badge>
            )}
          </button>

          <button
            onClick={() => setActiveTab("users")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              activeTab === "users" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="font-medium">Users</span>
            <Badge variant="secondary" className="ml-auto">
              {usersState.length}
            </Badge>
          </button>

          <button
            onClick={() => setActiveTab("analytics")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              activeTab === "analytics" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="font-medium">Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              activeTab === "settings" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium">Settings</span>
          </button>
        </nav>

        <div className="p-4 border-t border-border flex-shrink-0 bg-background">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64">
        {/* Mobile Header */}
        <header className="bg-background px-4 py-4 border-b border-border sticky top-0 z-10 lg:hidden">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">Admin Dashboard</h1>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </header>

        {/* Desktop Header */}
        <header className="hidden lg:block bg-background px-8 py-6 border-b border-border sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold mb-1">
                {activeTab === "overview" && "Dashboard Overview"}
                {activeTab === "cars" && "Car Management"}
                {activeTab === "bookings" && "Booking Management"}
                {activeTab === "users" && "User Management"}
                {activeTab === "analytics" && "Analytics & Reports"}
                {activeTab === "settings" && "Company Settings"}
              </h1>
              <p className="text-sm text-muted-foreground">{t("admin.subtitle", { name: currentUser.name })}</p>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={handleLogout} className="mr-2" title="Logout">
                <LogOut className="w-5 h-5" />
              </Button>
              <div className="text-right">
                <p className="text-sm font-medium">{currentUser.name}</p>
                <p className="text-xs text-muted-foreground">Administrator</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-8">
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <DollarSign className="w-8 h-8 text-green-500" />
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    </div>
                    <div className="text-2xl font-bold mb-1">{formatCents(totalRevenueCents)}</div>
                    <div className="text-sm text-muted-foreground">Total Revenue</div>
                    <div className="text-xs text-green-600 mt-2">{formatCents(revenueThisMonthCents)} this month</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <Calendar className="w-8 h-8 text-blue-500" />
                      <Badge variant="secondary">{activeBookings}</Badge>
                    </div>
                    <div className="text-2xl font-bold mb-1">{bookingsState.length}</div>
                    <div className="text-sm text-muted-foreground">Total Bookings</div>
                    <div className="text-xs text-muted-foreground mt-2">{pendingBookings} pending approval</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <CarIcon className="w-8 h-8 text-purple-500" />
                      <Badge variant="secondary">{availableCars}</Badge>
                    </div>
                    <div className="text-2xl font-bold mb-1">{carsState.length}</div>
                    <div className="text-sm text-muted-foreground">Total Cars</div>
                    <div className="text-xs text-green-600 mt-2">{availableCars} available now</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <Users className="w-8 h-8 text-orange-500" />
                    </div>
                    <div className="text-2xl font-bold mb-1">{usersState.length}</div>
                    <div className="text-sm text-muted-foreground">Total Users</div>
                    <div className="text-xs text-muted-foreground mt-2">
                      {usersState.filter((u) => u.role === "ADMIN").length} administrators
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                  <CardDescription>Common administrative tasks</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                      <DialogTrigger asChild>
                        <Button className="h-auto py-4 flex-col gap-2">
                          <CarIcon className="w-6 h-6" />
                          <span>Add New Car</span>
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
                      className="h-auto py-4 flex-col gap-2 bg-transparent"
                      onClick={() => setActiveTab("bookings")}
                    >
                      <AlertCircle className="w-6 h-6" />
                      <span>Pending Bookings</span>
                      {pendingBookings > 0 && (
                        <Badge variant="destructive" className="absolute top-2 right-2">
                          {pendingBookings}
                        </Badge>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      className="h-auto py-4 flex-col gap-2 bg-transparent"
                      onClick={() => setActiveTab("analytics")}
                    >
                      <BarChart3 className="w-6 h-6" />
                      <span>View Analytics</span>
                    </Button>

                    <Button
                      variant="outline"
                      className="h-auto py-4 flex-col gap-2 bg-transparent"
                      onClick={() => setActiveTab("users")}
                    >
                      <Users className="w-6 h-6" />
                      <span>Manage Users</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Bookings */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Bookings</CardTitle>
                  <CardDescription>Latest booking requests and updates</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {bookingsState.slice(0, 5).map((booking) => {
                      const car = carsState.find((c) => c.id === booking.carId)
                      const bookingUser = usersState.find((u) => u.id === booking.userId)
                      if (!car || !bookingUser) return null

                      return (
                        <div
                          key={booking.id}
                          className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                        >
                          <img
                            src={car.image || "/placeholder.svg"}
                            alt={getCarName(car)}
                            className="w-16 h-16 rounded-lg object-cover"
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
                          <div className="text-right">
                            <div className="font-bold">{formatCents(booking.totalPrice)}</div>
                            <Badge
                              variant={getBookingStatusBadge(booking.status).variant}
                              className={`mt-1 ${getBookingStatusBadge(booking.status).className}`}
                            >
                              {booking.status}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                    {bookingsState.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">No bookings yet</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Cars Tab */}
          {activeTab === "cars" && (
            <div className="space-y-4">
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
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="AVAILABLE">Available</SelectItem>
                    <SelectItem value="LOW_STOCK">Low Stock</SelectItem>
                    <SelectItem value="RENTED">Rented</SelectItem>
                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full sm:w-auto">
                      <CarIcon className="w-4 h-4 mr-2" />
                      Add New Car
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
              </div>

              {/* Cars Grid */}
              <div className="grid gap-4">
                {filteredCars.map((car) => (
                  <Card key={car.id}>
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <img
                          src={car.image || "/placeholder.svg"}
                          alt={getCarName(car)}
                          className="w-32 h-32 rounded-lg object-cover"
                        />
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
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
                              {car.status}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-sm mb-3">
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

                          <div className="flex gap-2">
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
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="font-bold text-lg">{getCarName(car)}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {(bookingUser.name || bookingUser.email) + " • " + bookingUser.email}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
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
                                  <SelectTrigger className="w-36">
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

                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Location:</span>
                                <span className="ml-2 font-medium">{booking.location}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Booking ID:</span>
                                <span className="ml-2 font-medium">#{booking.id.slice(0, 8)}</span>
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
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-border">
                              <span className="text-muted-foreground text-sm">Total Amount</span>
                              <span className="text-xl font-bold">{formatCents(booking.totalPrice)}</span>
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
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="grid gap-3">
                {usersState
                  .filter(
                    (u) =>
                      (u.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                      u.email.toLowerCase().includes(searchTerm.toLowerCase()),
                  )
                  .map((user) => {
                    const userBookings = bookingsState.filter((b) => b.userId === user.id)
                    const userRevenue = userBookings.reduce((sum, b) => sum + b.totalPrice, 0)

                    return (
                      <Card key={user.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xl font-bold">
                              {(user.name || user.email).charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-bold text-lg">{user.name || user.email}</h3>
                                <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">{user.email}</p>
                              <div className="flex gap-4 text-sm">
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
                                  <span className="ml-2 font-medium">
                                    {new Date(user.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === "analytics" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue Analytics */}
                <Card>
                  <CardHeader>
                    <CardTitle>Revenue Overview</CardTitle>
                    <CardDescription>Total earnings breakdown</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Revenue</p>
                          <p className="text-2xl font-bold">{formatCents(totalRevenueCents)}</p>
                        </div>
                        <DollarSign className="w-8 h-8 text-green-500" />
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                        <div>
                          <p className="text-sm text-muted-foreground">This Month</p>
                          <p className="text-2xl font-bold">{formatCents(revenueThisMonthCents)}</p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-blue-500" />
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                        <div>
                          <p className="text-sm text-muted-foreground">Average Booking</p>
                          <p className="text-2xl font-bold">
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
                    <CardTitle>Booking Status</CardTitle>
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
                    <CardTitle>Car Utilization</CardTitle>
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
                              <span className="text-sm font-medium">{status}</span>
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
                    <CardTitle>Most Booked Cars</CardTitle>
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
                            <div className="flex-1">
                              <p className="font-medium">{getCarName(car)}</p>
                              <p className="text-sm text-muted-foreground">{car.bookingCount} bookings</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold">{formatCents(car.price)}</p>
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

          {/* Settings Tab */}
          {activeTab === "settings" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Company Settings</CardTitle>
                  <CardDescription>Manage your company information, payment details, and configuration</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingSettings ? (
                    <div className="text-center py-8">Loading settings...</div>
                  ) : (
                    <SettingsForm
                      settings={settings}
                      onSave={async (data) => {
                        const result = await updateCompanySettings(data)
                        if (result?.success) {
                          setSettings(result.settings)
                          alert("Settings saved successfully!")
                        } else {
                          alert(result?.error || "Failed to save settings")
                        }
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Mobile Tab Navigation */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border px-4 py-3 z-20">
          <div className="flex items-center justify-around">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex flex-col items-center gap-1 ${
                activeTab === "overview" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="text-xs">Overview</span>
            </button>
            <button
              onClick={() => setActiveTab("cars")}
              className={`flex flex-col items-center gap-1 ${
                activeTab === "cars" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <CarIcon className="w-5 h-5" />
              <span className="text-xs">Cars</span>
            </button>
            <button
              onClick={() => setActiveTab("bookings")}
              className={`flex flex-col items-center gap-1 relative ${
                activeTab === "bookings" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {pendingBookings > 0 && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[10px] text-white flex items-center justify-center">
                  {pendingBookings}
                </div>
              )}
              <Calendar className="w-5 h-5" />
              <span className="text-xs">Bookings</span>
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`flex flex-col items-center gap-1 ${
                activeTab === "users" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Users className="w-5 h-5" />
              <span className="text-xs">Users</span>
            </button>
          </div>
        </div>
      </main>
    </div>
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
  const maxGalleryImages = 10
  const maxUploadBytes = 4 * 1024 * 1024

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
    return data as { cloudName: string; apiKey: string; timestamp: number; signature: string; folder: string }
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
    onSubmit(formData)
  }

  const isBusy = isSubmitting || isUploading

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          onValueChange={(value) => setFormData({ ...formData, category: value as AdminCar["category"] })}
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
            <img src={formData.image} alt={`${formData.name || "Car"} main`} className="h-32 w-full rounded-md object-cover" />
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
        <p className="text-xs text-muted-foreground">
          Upload up to {maxGalleryImages} images, 4MB max each.
        </p>
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

      <div className="grid grid-cols-2 gap-4">
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

      <div className="grid grid-cols-2 gap-4">
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

// Settings Form Component
function SettingsForm({ settings, onSave }: { settings: any; onSave: (data: any) => Promise<void> }) {
  const [formData, setFormData] = useState({
    // Company Information
    companyName: settings?.companyName || "",
    companyEmail: settings?.companyEmail || "",
    companyPhone: settings?.companyPhone || "",
    companyAddress: settings?.companyAddress || "",
    companyCity: settings?.companyCity || "",
    companyState: settings?.companyState || "",
    companyZipCode: settings?.companyZipCode || "",
    companyCountry: settings?.companyCountry || "",
    
    // Legal Information (for Impressum/Imprint)
    managingDirector: settings?.managingDirector || "",
    commercialRegister: settings?.commercialRegister || "",
    registerCourt: settings?.registerCourt || "",
    vatId: settings?.vatId || "",
    responsiblePerson: settings?.responsiblePerson || "",
    
    // Bank/Payment Details
    bankName: settings?.bankName || "",
    accountName: settings?.accountName || "",
    accountNumber: settings?.accountNumber || "",
    swiftCode: settings?.swiftCode || "",
    iban: settings?.iban || "",
    
    // Tax Configuration
    taxRate: settings?.taxRate ?? 0,
    taxIncluded: settings?.taxIncluded ?? false,
    depositPercentage: settings?.depositPercentage ?? 0.2,
    
    // Email Configuration
    supportEmail: settings?.supportEmail || "",
    adminEmail: settings?.adminEmail || "",
    
    // Additional Settings
    currency: settings?.currency || "EUR",
    currencySymbol: settings?.currencySymbol || "€",
  })

  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await onSave(formData)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Company Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Company Information</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name *</Label>
            <Input
              id="companyName"
              value={formData.companyName}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyEmail">Company Email *</Label>
            <Input
              id="companyEmail"
              type="email"
              value={formData.companyEmail}
              onChange={(e) => setFormData({ ...formData, companyEmail: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyPhone">Phone Number</Label>
            <Input
              id="companyPhone"
              value={formData.companyPhone}
              onChange={(e) => setFormData({ ...formData, companyPhone: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyAddress">Address</Label>
            <Input
              id="companyAddress"
              value={formData.companyAddress}
              onChange={(e) => setFormData({ ...formData, companyAddress: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyCity">City</Label>
            <Input
              id="companyCity"
              value={formData.companyCity}
              onChange={(e) => setFormData({ ...formData, companyCity: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyState">State/Province</Label>
            <Input
              id="companyState"
              value={formData.companyState}
              onChange={(e) => setFormData({ ...formData, companyState: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyZipCode">Zip/Postal Code</Label>
            <Input
              id="companyZipCode"
              value={formData.companyZipCode}
              onChange={(e) => setFormData({ ...formData, companyZipCode: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyCountry">Country</Label>
            <Input
              id="companyCountry"
              value={formData.companyCountry}
              onChange={(e) => setFormData({ ...formData, companyCountry: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Legal Information (for Impressum) */}
      <div className="space-y-4 border-t pt-6">
        <h3 className="text-lg font-semibold">Legal Information (Impressum)</h3>
        <p className="text-sm text-muted-foreground">
          This information will be displayed on the Impressum page and footer.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="managingDirector">Managing Director</Label>
            <Input
              id="managingDirector"
              value={formData.managingDirector}
              onChange={(e) => setFormData({ ...formData, managingDirector: e.target.value })}
              placeholder="Max Mustermann"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vatId">VAT ID</Label>
            <Input
              id="vatId"
              value={formData.vatId}
              onChange={(e) => setFormData({ ...formData, vatId: e.target.value })}
              placeholder="DE123456789"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="commercialRegister">Commercial Register (HRB)</Label>
            <Input
              id="commercialRegister"
              value={formData.commercialRegister}
              onChange={(e) => setFormData({ ...formData, commercialRegister: e.target.value })}
              placeholder="HRB 123456 B"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="registerCourt">Register Court</Label>
            <Input
              id="registerCourt"
              value={formData.registerCourt}
              onChange={(e) => setFormData({ ...formData, registerCourt: e.target.value })}
              placeholder="Amtsgericht Berlin-Charlottenburg"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="responsiblePerson">Responsible Person (for Content)</Label>
            <Input
              id="responsiblePerson"
              value={formData.responsiblePerson}
              onChange={(e) => setFormData({ ...formData, responsiblePerson: e.target.value })}
              placeholder="Max Mustermann, Musterstraße 123, 10115 Berlin, Deutschland"
            />
          </div>
        </div>
      </div>

      {/* Bank/Payment Details */}
      <div className="space-y-4 border-t pt-6">
        <h3 className="text-lg font-semibold">Bank & Payment Details</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bankName">Bank Name *</Label>
            <Input
              id="bankName"
              value={formData.bankName}
              onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accountName">Account Name *</Label>
            <Input
              id="accountName"
              value={formData.accountName}
              onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accountNumber">Account Number *</Label>
            <Input
              id="accountNumber"
              value={formData.accountNumber}
              onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="swiftCode">SWIFT Code *</Label>
            <Input
              id="swiftCode"
              value={formData.swiftCode}
              onChange={(e) => setFormData({ ...formData, swiftCode: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="iban">IBAN</Label>
            <Input
              id="iban"
              value={formData.iban}
              onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Tax & Payment Configuration */}
      <div className="space-y-4 border-t pt-6">
        <h3 className="text-lg font-semibold">Tax & Payment Configuration</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="taxRate">Tax Rate (0-1, e.g., 0.19 for 19%)</Label>
            <Input
              id="taxRate"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={formData.taxRate}
              onChange={(e) => setFormData({ ...formData, taxRate: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="depositPercentage">Deposit Percentage (0-1, e.g., 0.2 for 20%)</Label>
            <Input
              id="depositPercentage"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={formData.depositPercentage}
              onChange={(e) => setFormData({ ...formData, depositPercentage: parseFloat(e.target.value) || 0.2 })}
            />
          </div>
          <div className="space-y-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="taxIncluded"
              checked={formData.taxIncluded}
              onChange={(e) => setFormData({ ...formData, taxIncluded: e.target.checked })}
              className="w-4 h-4"
            />
            <Label htmlFor="taxIncluded" className="cursor-pointer">Tax included in displayed prices</Label>
          </div>
        </div>
      </div>

      {/* Email Configuration */}
      <div className="space-y-4 border-t pt-6">
        <h3 className="text-lg font-semibold">Email Configuration</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="supportEmail">Support Email *</Label>
            <Input
              id="supportEmail"
              type="email"
              value={formData.supportEmail}
              onChange={(e) => setFormData({ ...formData, supportEmail: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adminEmail">Admin Email *</Label>
            <Input
              id="adminEmail"
              type="email"
              value={formData.adminEmail}
              onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
              required
            />
          </div>
        </div>
      </div>

      {/* Currency Settings */}
      <div className="space-y-4 border-t pt-6">
        <h3 className="text-lg font-semibold">Currency Settings</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="currency">Currency Code (e.g., EUR, USD)</Label>
            <Input
              id="currency"
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currencySymbol">Currency Symbol (e.g., €, $)</Label>
            <Input
              id="currencySymbol"
              value={formData.currencySymbol}
              onChange={(e) => setFormData({ ...formData, currencySymbol: e.target.value })}
            />
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save Settings"}
      </Button>
    </form>
  )
}
