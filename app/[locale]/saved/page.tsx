import Link from "@/navigation"
import { redirect } from "@/navigation"
import { BottomNav } from "@/components/bottom-nav"
import { CarCard } from "@/components/car-card"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { getCarReviewStats, getCarReviewStatsMap } from "@/lib/car-review-stats"
import { getTranslations } from "next-intl/server"

export const dynamic = "force-dynamic"

export default async function SavedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations()
  const user = await getCurrentUser()
  const signInUrl = "/sign-in"

  if (!user) {
    redirect({ href: signInUrl, locale })
  }

  // TypeScript doesn't know redirect throws
  const currentUser = user!

  const savedCars = await prisma.savedCar.findMany({
    where: { userId: currentUser.id },
    include: { car: true },
    orderBy: { createdAt: "desc" },
  })

  const savedCarsList = savedCars.map((saved) => saved.car)
  const reviewStatsByCar = await getCarReviewStatsMap(savedCarsList.map((car) => car.id))

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(248,250,252,0.95)_0%,rgba(255,255,255,1)_45%,rgba(248,250,252,0.96)_100%)] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">{t("saved.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("cars.subtitle", { count: savedCarsList.length })}</p>
          </div>
          <Link
            href="/cars"
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
            {t("saved.browseCars")}
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 pt-5 sm:px-6">
        {savedCarsList.length === 0 ? (
          <div className="rounded-2xl border border-border/70 bg-card/85 py-16 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold">{t("saved.noSaved")}</h3>
            <p className="mb-6 text-sm text-muted-foreground">{t("saved.explore")}</p>
            <Link
              href="/cars"
              className="inline-flex rounded-xl bg-primary px-6 py-3 font-semibold text-white transition-colors hover:bg-primary/90"
            >
              {t("saved.browseCars")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 pb-4 sm:grid-cols-2 xl:grid-cols-3">
            {savedCarsList.map((car) => {
              const stats = getCarReviewStats(reviewStatsByCar, car.id)

              return (
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
                    rating: stats.rating,
                    reviews: stats.reviewCount,
                  }}
                  isSaved
                  isSignedIn
                  signInUrl={signInUrl}
                />
              )
            })}
          </div>
        )}
      </div>

      <BottomNav active="saved" />
    </div>
  )
}
