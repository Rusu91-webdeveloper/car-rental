import Link from "@/navigation"
import { redirect } from "@/navigation"
import { BottomNav } from "@/components/bottom-nav"
import { CarCard } from "@/components/car-card"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { config } from "@/lib/config"
import { getTranslations } from "next-intl/server"

export default async function SavedPage() {
  const t = await getTranslations()
  const user = await getCurrentUser()
  const signInUrl = config.isDemoMode ? "/login" : "/sign-in"

  if (!user) {
    redirect(signInUrl)
  }

  const savedCars = await prisma.savedCar.findMany({
    where: { userId: user.id },
    include: { car: true },
    orderBy: { createdAt: "desc" },
  })

  const savedCarsList = savedCars.map((saved) => saved.car)

  return (
    <div className="min-h-screen bg-muted pb-20">
      {/* Header */}
      <header className="bg-background px-4 py-4 border-b border-border sticky top-0 z-10">
        <h1 className="text-xl font-bold">{t("saved.title")}</h1>
      </header>

      <div className="p-4">
        {savedCarsList.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">{t("saved.noSaved")}</h3>
            <p className="text-muted-foreground text-sm mb-6">{t("saved.explore")}</p>
            <Link
              href="/"
              className="inline-flex px-6 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-colors"
            >
              Browse Cars
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {savedCarsList.map((car) => (
              <CarCard
                key={car.id}
                car={{
                  id: car.id,
                  name: car.name,
                  nameDe: car.nameDe,
                  category: car.category,
                  price: car.price,
                  image: car.image,
                  status: car.status,
                  specs: {
                    gearbox: car.gearbox,
                    seats: car.seats,
                    fuel: car.fuelType,
                    acceleration: car.acceleration,
                  },
                  rating: car.rating,
                  reviews: car.reviewCount,
                }}
                isSaved
                isSignedIn
                signInUrl={signInUrl}
              />
            ))}
          </div>
        )}
      </div>

      <BottomNav active="saved" />
    </div>
  )
}
