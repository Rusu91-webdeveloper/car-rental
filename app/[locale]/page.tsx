import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { getCarReviewStats, getCarReviewStatsMap } from "@/lib/car-review-stats"
import { HomeClient } from "./home-client"
import { getPublicCarPrices } from "@/lib/cars/public-pricing"
import { formatCompanyPickupLocation } from "@/lib/company-pickup-location"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const [user, cars, companySettings, activeGeneralRental] = await Promise.all([
    getCurrentUser(),
    prisma.car.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: "desc" },
    }),
    prisma.companySettings.findUnique({
      where: { id: "company-settings" },
      select: {
        companyAddress: true,
        companyCity: true,
        companyState: true,
        companyZipCode: true,
        companyCountry: true,
      },
    }),
    prisma.businessConfigurationRelease.findFirst({
      where: { status: "ACTIVE" },
      select: { generalRentalConfig: { select: { businessTimeZone: true } } },
    }),
  ])
  const [reviewStatsByCar, publicPrices, savedCarIds] = await Promise.all([
    getCarReviewStatsMap(cars.map((car) => car.id)),
    getPublicCarPrices(prisma, cars),
    user
      ? prisma.savedCar.findMany({
          where: { userId: user.id },
          select: { carId: true },
        })
      : Promise.resolve([]),
  ])


  return (
    <HomeClient
      cars={cars.map((car) => {
        const stats = getCarReviewStats(reviewStatsByCar, car.id)
        const publicPrice = publicPrices.get(car.id)!

        return {
          id: car.id,
          name: car.name,
          nameDe: car.nameDe,
          category: car.category,
          price: publicPrice.price,
          pricingPublished: publicPrice.pricingPublished,
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
          rating: stats.rating,
          reviews: stats.reviewCount,
        }
      })}
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
      signInUrl="/sign-in"
      pickupLocation={formatCompanyPickupLocation(companySettings)}
      businessTimeZone={activeGeneralRental?.generalRentalConfig.businessTimeZone ?? "UTC"}
    />
  )
}
