import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { config } from "@/lib/config"
import { HomeClient } from "./home-client"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const user = await getCurrentUser()
  const cars = await prisma.car.findMany({
    where: { isDeleted: false },
    orderBy: { createdAt: "desc" },
  })

  const savedCarIds = user
    ? await prisma.savedCar.findMany({
        where: { userId: user.id },
        select: { carId: true },
      })
    : []

  return (
    <HomeClient
      cars={cars.map((car) => ({
        id: car.id,
        name: car.name,
        nameDe: car.nameDe,
        category: car.category,
        price: car.price,
        image: car.image,
        status: car.status,
        subtitle: car.subtitle,
        subtitleDe: car.subtitleDe,
        description: car.description,
        descriptionDe: car.descriptionDe,
        year: car.year,
        specs: {
          gearbox: car.gearbox,
          seats: car.seats,
          fuel: car.fuelType,
          acceleration: car.acceleration,
        },
        rating: car.rating,
        reviews: car.reviewCount,
      }))}
      user={
        user
          ? {
              name: user.name || user.email,
              email: user.email,
              role: user.role,
            }
          : null
      }
      savedCarIds={savedCarIds.map((item) => item.carId)}
      signInUrl={config.isDemoMode ? "/login" : "/sign-in"}
    />
  )
}
