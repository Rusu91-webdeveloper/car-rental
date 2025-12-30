import { redirect } from "@/navigation"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { config } from "@/lib/config"
import AdminDashboard from "./admin-client"

export default async function AdminPage() {
  const user = await getCurrentUser()
  const signInUrl = config.isDemoMode ? "/login" : "/sign-in"

  if (!user) {
    redirect(signInUrl)
  }

  if (user.role !== "ADMIN") {
    redirect("/")
  }

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
      currentUser={{ name: user.name || user.email, email: user.email }}
      isDemoMode={config.isDemoMode}
      cars={cars.map((car) => ({
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
      bookings={bookings.map((booking) => ({
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
      users={users.map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        role: item.role,
        createdAt: item.createdAt.toISOString(),
      }))}
    />
  )
}
