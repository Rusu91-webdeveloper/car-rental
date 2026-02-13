import Link from "@/navigation"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { config } from "@/lib/config"
import { formatCents } from "@/lib/money"
import { SaveCarButton } from "@/components/save-car-button"
import { CarImageCarousel } from "@/components/car-image-carousel"
import { ShareButton } from "@/components/share-button"
import { getTranslations } from "next-intl/server"
import { BookNowButton } from "./book-now-button"
import { CarAvailabilityCalendar } from "./car-availability-calendar"

export const dynamic = "force-dynamic"

export default async function CarDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id, locale } = await params
  const t = await getTranslations({ locale })
  const car = await prisma.car.findFirst({
    where: { id, isDeleted: false },
  })

  if (!car) {
    notFound()
  }

  const [recentReviews, ratingBuckets, reviewAggregate] = await Promise.all([
    prisma.review.findMany({
      where: { carId: car.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        user: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.review.groupBy({
      by: ["rating"],
      where: { carId: car.id },
      _count: {
        _all: true,
      },
    }),
    prisma.review.aggregate({
      where: { carId: car.id },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ])

  const user = await getCurrentUser()
  const savedCar = user
    ? await prisma.savedCar.findUnique({
        where: {
          userId_carId: {
            userId: user.id,
            carId: car.id,
          },
        },
      })
    : null

  const signInUrl = "/sign-in"
  const galleryImages = [car.image, ...(car.images || [])].filter(Boolean)
  const shareUrl = `${config.appUrl.replace(/\/$/, "")}/${locale}/cars/${car.id}`
  const displayName = locale === "de" ? car.nameDe || car.name : car.name
  const displaySubtitle = locale === "de" ? car.subtitleDe || car.subtitle : car.subtitle
  const displayDescription = locale === "de" ? car.descriptionDe || car.description : car.description
  const statusKey =
    car.status === "AVAILABLE"
      ? "available"
      : car.status === "LOW_STOCK"
        ? "lowStock"
        : car.status === "MAINTENANCE"
          ? "maintenance"
          : car.status === "RENTED"
            ? "rented"
            : null
  const statusLabel = statusKey ? t(`carStatus.${statusKey}`) : car.status.replace("_", " ")

  const ratingCountMap = new Map<number, number>(ratingBuckets.map((bucket) => [bucket.rating, bucket._count._all]))
  const liveReviewCount = reviewAggregate._count._all
  const liveRating = reviewAggregate._avg.rating ? Number(reviewAggregate._avg.rating.toFixed(1)) : 0
  const reviewBreakdown = [5, 4, 3, 2, 1].map((stars) => {
    const count = ratingCountMap.get(stars) ?? 0
    const percentage = liveReviewCount > 0 ? Math.round((count / liveReviewCount) * 100) : 0
    return { stars, percentage }
  })

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/20 via-background to-background pb-28 sm:pb-32">
      {/* Image Gallery */}
      <div className="mx-auto w-full max-w-7xl px-3 pt-3 sm:px-4 sm:pt-5 lg:px-8">
        <CarImageCarousel images={galleryImages} alt={displayName}>
          <div className="absolute inset-x-0 top-0 z-30 p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <Link
                href="/"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-background/90 backdrop-blur-sm shadow-lg"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="flex gap-2">
                <ShareButton
                  url={shareUrl}
                  title={displayName}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-background/90 backdrop-blur-sm shadow-lg"
                />
                <SaveCarButton
                  carId={car.id}
                  isSaved={Boolean(savedCar)}
                  isSignedIn={Boolean(user)}
                  signInUrl={signInUrl}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-background/90 backdrop-blur-sm shadow-lg disabled:opacity-60"
                  iconClassName={`w-6 h-6 ${savedCar ? "fill-red-500 stroke-red-500" : "fill-none stroke-gray-600"}`}
                />
              </div>
            </div>
          </div>
        </CarImageCarousel>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="mb-1 text-2xl font-bold sm:text-3xl">{displayName}</h1>
            <p className="text-muted-foreground text-sm">{displaySubtitle}</p>
          </div>
          <span
            className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${
              car.status === "AVAILABLE"
                ? "bg-green-50 text-success"
                : car.status === "LOW_STOCK"
                  ? "bg-orange-50 text-warning"
                  : car.status === "MAINTENANCE"
                    ? "bg-red-50 text-error"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {statusLabel}
          </span>
        </div>

        {/* Rating */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4 text-warning" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
            </svg>
            <span className="font-semibold">{liveRating}</span>
          </div>
          <span className="text-muted-foreground text-sm">({t("car.reviews", { count: liveReviewCount })})</span>
        </div>

        {/* Car Specifications */}
        <div className="mb-6">
          <h2 className="font-semibold mb-3">{t("car.specifications")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="p-4 bg-muted rounded-xl">
              <div className="text-primary mb-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                  />
                </svg>
              </div>
              <p className="text-xs text-muted-foreground mb-1">{t("car.gearbox")}</p>
              <p className="font-semibold">{car.gearbox}</p>
            </div>
            <div className="p-4 bg-muted rounded-xl">
              <div className="text-primary mb-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <p className="text-xs text-muted-foreground mb-1">{t("car.fuel")}</p>
              <p className="font-semibold">{car.fuelType}</p>
            </div>
            <div className="p-4 bg-muted rounded-xl">
              <div className="text-primary mb-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <p className="text-xs text-muted-foreground mb-1">{t("car.capacity")}</p>
              <p className="font-semibold">{t("car.seats", { count: car.seats })}</p>
            </div>
            <div className="p-4 bg-muted rounded-xl">
              <div className="text-primary mb-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
              </div>
              <p className="text-xs text-muted-foreground mb-1">{t("car.accelerationLabel")}</p>
              <p className="font-semibold">{car.acceleration}</p>
            </div>
          </div>
        </div>

        {/* About */}
        {displayDescription && (
          <div className="mb-6">
            <h2 className="font-semibold mb-3">{t("car.about")}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{displayDescription}</p>
          </div>
        )}

        {/* Availability Calendar */}
        <CarAvailabilityCalendar carId={car.id} />

        {/* Reviews */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">{t("car.reviewsTitle")}</h2>
          </div>

          <div className="p-6 bg-muted rounded-xl">
            <div className="text-center mb-4">
              <div className="text-4xl font-bold mb-2">{liveRating}</div>
              <div className="flex items-center justify-center gap-1 mb-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg key={star} className="w-5 h-5 text-warning" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{t("car.basedOnReviews", { count: liveReviewCount })}</p>
            </div>

            <div className="space-y-2">
              {reviewBreakdown.map(({ stars, percentage }) => (
                <div key={stars} className="flex items-center gap-3">
                  <span className="text-sm w-2">{stars}</span>
                  <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                    <div
                      className="h-full bg-foreground rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-10 text-right">{percentage}%</span>
                </div>
              ))}
            </div>
          </div>

          {liveReviewCount > 0 ? (
            <details className="mt-4 rounded-xl border border-border bg-background p-4">
              <summary className="cursor-pointer list-none font-medium flex items-center justify-between">
                <span>{t("car.readReviews", { count: liveReviewCount })}</span>
                <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>

              <div className="mt-4 space-y-3">
                {recentReviews.map((review) => (
                  <article key={review.id} className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-sm font-semibold">{review.user.name || t("car.verifiedCustomer")}</p>
                      <time className="text-xs text-muted-foreground">
                        {new Date(review.createdAt).toLocaleDateString(locale, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                    </div>
                    <div className="flex items-center gap-1 mb-2">
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
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{review.comment}</p>
                  </article>
                ))}

                {liveReviewCount > recentReviews.length && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    {t("car.showingRecentReviews", { shown: recentReviews.length, total: liveReviewCount })}
                  </p>
                )}
              </div>
            </details>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{t("car.noReviewsYet")}</p>
          )}
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div>
            <div className="text-xl font-bold sm:text-2xl">
              {formatCents(car.price)}
              <span className="text-sm font-normal text-muted-foreground sm:text-base"> / {t("car.pricePerDay")}</span>
            </div>
          </div>
          <BookNowButton
            carId={car.id}
            signInUrl={signInUrl}
            isSignedIn={Boolean(user)}
            label={t("common.bookNow")}
          />
        </div>
      </div>
    </div>
  )
}
