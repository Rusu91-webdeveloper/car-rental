import { redirect } from "@/navigation"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { config } from "@/lib/config"
import { getPaymentDetails } from "@/lib/payment-details"
import { CheckoutClient } from "./checkout-client"

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
    redirect({ href: `${signInUrl}?redirect_url=${encodeURIComponent(redirectUrl)}`, locale })
  }

  const displayName = locale === "de" ? car.nameDe || car.name : car.name
  const displaySubtitle = locale === "de" ? car.subtitleDe || car.subtitle : car.subtitle

  // Fetch payment details and company settings
  const paymentDetails = await getPaymentDetails()
  const companySettings = await prisma.companySettings.findUnique({
    where: { id: "company-settings" },
  })

  return (
    <CheckoutClient
      car={{
        id: car.id,
        name: displayName,
        subtitle: displaySubtitle,
        image: car.image,
        price: car.price,
        rating: car.rating,
        reviews: car.reviewCount,
      }}
      signInUrl={signInUrl}
      paymentDetails={paymentDetails}
      companySettings={{
        companyName: companySettings?.companyName || "Car Rental Company",
        supportEmail: companySettings?.supportEmail || "support@rentcar.com",
        depositPercentage: companySettings?.depositPercentage ?? 0.2,
        guaranteePercentage: companySettings?.guaranteePercentage ?? 0,
        taxRate: companySettings?.taxRate ?? 0,
        taxIncluded: companySettings?.taxIncluded ?? false,
      }}
    />
  )
}
