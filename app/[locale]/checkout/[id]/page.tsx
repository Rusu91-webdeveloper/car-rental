import { redirect } from "@/navigation"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { getPaymentDetails } from "@/lib/payment-details"
import { getCarReviewStats, getCarReviewStatsMap } from "@/lib/car-review-stats"
import { CheckoutClient } from "./checkout-client"
import { resolvePublicBookingConfiguration } from "@/lib/booking-configuration/runtime"
import { formatCompanyPickupLocation } from "@/lib/company-pickup-location"

export const dynamic = "force-dynamic"

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id, locale } = await params
  const car = await prisma.car.findFirst({
    where: { id, isDeleted: false },
  })

  if (!car) {
    notFound()
  }

  const user = await getCurrentUser()
  const signInUrl = "/sign-in"

  if (!user) {
    // Preserve query params when redirecting to sign-in
    const queryParams = await searchParams
    // Include locale in the redirect URL path
    const redirectPath = `/${locale}/checkout/${id}`
    const currentUrl = new URL(redirectPath, "http://localhost")

    // Add all query params to the redirect URL
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value && typeof value === "string") {
          currentUrl.searchParams.set(key, value)
        }
      })
    }

    const redirectUrl = `${currentUrl.pathname}${currentUrl.search}`
    redirect({
      href: `${signInUrl}?redirect_url=${encodeURIComponent(redirectUrl)}`,
      locale,
    })
  }

  const displayName = locale === "de" ? car.nameDe || car.name : car.name
  const displaySubtitle = locale === "de" ? car.subtitleDe || car.subtitle : car.subtitle
  const reviewStatsByCar = await getCarReviewStatsMap([car.id])
  const reviewStats = getCarReviewStats(reviewStatsByCar, car.id)

  // Payment instructions are display-only; pricing is resolved server-side.
  const [paymentDetails, bookingConfiguration, companySettings] = await Promise.all([
    getPaymentDetails(),
    resolvePublicBookingConfiguration({
      db: prisma,
      vehicleId: car.id,
      locale,
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
  ])
  const pickupLocation = formatCompanyPickupLocation(companySettings)

  return (
    <CheckoutClient
      locale={locale}
      car={{
        id: car.id,
        name: displayName,
        subtitle: displaySubtitle,
        image: car.image,
        rating: reviewStats.rating,
        reviews: reviewStats.reviewCount,
      }}
      signInUrl={signInUrl}
      paymentDetails={paymentDetails}
      bookingConfiguration={bookingConfiguration}
      pickupLocation={pickupLocation}
      initialCustomer={{
        firstName: user!.name?.trim().split(/\s+/)[0] ?? "",
        lastName: user!.name?.trim().split(/\s+/).slice(1).join(" ") ?? "",
        email: user!.email,
      }}
    />
  )
}
