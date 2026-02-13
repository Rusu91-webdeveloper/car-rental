import { redirect } from "@/navigation"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { config } from "@/lib/config"
import { runBookingLifecycleMaintenance } from "@/lib/booking-expiration"
import AdminDashboard from "./admin-client"
import type { Car, Booking, User } from "@prisma/client"

export const dynamic = "force-dynamic"

const MANUAL_RESERVATION_PREFIX = "manual_reservation::"

type ManualReservationPayload = {
  customerName: string
  customerPhone: string
  totalPrice: number
}

const parseManualReservationPayload = (reason: string | null): ManualReservationPayload | null => {
  if (!reason || !reason.startsWith(MANUAL_RESERVATION_PREFIX)) {
    return null
  }

  try {
    const parsed = JSON.parse(reason.slice(MANUAL_RESERVATION_PREFIX.length))
    if (
      typeof parsed?.customerName === "string" &&
      typeof parsed?.customerPhone === "string" &&
      typeof parsed?.totalPrice === "number"
    ) {
      return {
        customerName: parsed.customerName,
        customerPhone: parsed.customerPhone,
        totalPrice: parsed.totalPrice,
      }
    }
  } catch (error) {
    console.error("[PARSE_MANUAL_RESERVATION_ERROR]", error)
  }

  return null
}

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const user = await getCurrentUser()
  const signInUrl = "/sign-in"

  if (!user) {
    redirect({ href: signInUrl, locale })
  }

  // TypeScript doesn't know redirect throws, use non-null assertion
  if (user!.role !== "ADMIN") {
    redirect({ href: "/", locale })
  }

  // At this point, user is guaranteed to be non-null and ADMIN
  const adminUser = user!

  await runBookingLifecycleMaintenance()
  const [cars, bookings, users, blockedDates] = await Promise.all([
    prisma.car.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: "desc" },
    }),
    prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    }),
    prisma.blockedDate.findMany({
      orderBy: { createdAt: "desc" },
    }),
  ])

  const manualReservations = blockedDates
    .map((blockedDate) => {
      const payload = parseManualReservationPayload(blockedDate.reason)
      if (!payload) {
        return null
      }

      return {
        id: blockedDate.id,
        carId: blockedDate.carId,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        totalPrice: payload.totalPrice,
        pickupDate: blockedDate.startDate.toISOString(),
        dropoffDate: blockedDate.endDate.toISOString(),
        createdAt: blockedDate.createdAt.toISOString(),
      }
    })
    .filter((reservation): reservation is NonNullable<typeof reservation> => reservation !== null)

  return (
    <AdminDashboard
      currentUser={{ id: adminUser.id, name: adminUser.name || adminUser.email, email: adminUser.email }}
      cars={cars.map((car: Car) => ({
        id: car.id,
        name: car.name,
        nameDe: car.nameDe,
        subtitle: car.subtitle,
        subtitleDe: car.subtitleDe,
        category: car.category,
        price: car.price,
        image: car.image,
        images: car.images,
        status: car.status,
        specs: {
          gearbox: car.gearbox,
          seats: car.seats,
          fuel: car.fuelType,
          acceleration: car.acceleration,
        },
        year: car.year,
        rating: car.rating,
        reviews: car.reviewCount,
        description: car.description,
        descriptionDe: car.descriptionDe,
      }))}
      bookings={bookings.map((booking: Booking) => ({
        id: booking.id,
        userId: booking.userId,
        carId: booking.carId,
        pickupDate: booking.pickupDate.toISOString(),
        dropoffDate: booking.dropoffDate.toISOString(),
        location: booking.location,
        totalPrice: booking.totalPrice,
        status: booking.status,
        paymentMethod: booking.paymentMethod,
        createdAt: booking.createdAt.toISOString(),
      }))}
      users={users.map((item: User) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        role: item.role,
        isActive: item.isActive,
        createdAt: item.createdAt.toISOString(),
      }))}
      manualReservations={manualReservations}
    />
  )
}
