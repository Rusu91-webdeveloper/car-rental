import { redirect } from "@/navigation"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { config } from "@/lib/config"
import { runBookingLifecycleMaintenance } from "@/lib/booking-expiration"
import { getCarReviewStats, getCarReviewStatsMap } from "@/lib/car-review-stats"
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
  const [cars, bookings, users, blockedDates, reviews] = await Promise.all([
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
    prisma.review.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        car: {
          select: {
            id: true,
            name: true,
            nameDe: true,
          },
        },
        booking: {
          select: {
            bookingNumber: true,
          },
        },
      },
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
  const reviewStatsByCar = await getCarReviewStatsMap(cars.map((car) => car.id))

  return (
    <AdminDashboard
      currentUser={{ id: adminUser.id, name: adminUser.name || adminUser.email, email: adminUser.email }}
      cars={cars.map((car: Car) => {
        const stats = getCarReviewStats(reviewStatsByCar, car.id)

        return {
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
          rating: stats.rating,
          reviews: stats.reviewCount,
          description: car.description,
          descriptionDe: car.descriptionDe,
        }
      })}
      bookings={bookings.map((booking: Booking) => ({
        id: booking.id,
        userId: booking.userId,
        carId: booking.carId,
        pickupDate: booking.pickupDate.toISOString(),
        dropoffDate: booking.dropoffDate.toISOString(),
        location: booking.location,
        totalPrice: booking.totalPrice,
        guaranteeAmount: booking.guaranteeAmount,
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
      reviews={reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
        carId: review.carId,
        carName: review.car.name,
        carNameDe: review.car.nameDe,
        bookingNumber: review.booking.bookingNumber,
        userName: review.user.name,
        userEmail: review.user.email,
      }))}
      manualReservations={manualReservations}
    />
  )
}
