import { redirect } from "@/navigation"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { config } from "@/lib/config"
import { cancelExpiredBookings } from "@/lib/booking-expiration"
import AdminDashboard from "./admin-client"
import type { Car, Booking, User } from "@prisma/client"

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const user = await getCurrentUser()
  const signInUrl = config.isDemoMode ? "/login" : "/sign-in"

  if (!user) {
    redirect({ href: signInUrl, locale })
  }

  // TypeScript doesn't know redirect throws, use non-null assertion
  if (user!.role !== "ADMIN") {
    redirect({ href: "/", locale })
  }

  // At this point, user is guaranteed to be non-null and ADMIN
  const adminUser = user!

  await cancelExpiredBookings()
  const [cars, bookings, users] = await Promise.all([
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
  ])

  return (
    <AdminDashboard
      currentUser={{ name: adminUser.name || adminUser.email, email: adminUser.email }}
      isDemoMode={config.isDemoMode}
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
        createdAt: booking.createdAt.toISOString(),
      }))}
      users={users.map((item: User) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        role: item.role,
        createdAt: item.createdAt.toISOString(),
      }))}
    />
  )
}
