import { redirect } from "@/navigation"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { config } from "@/lib/config"
import { CheckoutClient } from "./checkout-client"

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id, locale } = await params
  const car = await prisma.car.findFirst({
    where: { id, isDeleted: false },
  })

  if (!car) {
    notFound()
  }

  const user = await getCurrentUser()
  const signInUrl = config.isDemoMode ? "/login" : "/sign-in"

  if (!user) {
    redirect(signInUrl)
  }

  const displayName = locale === "de" ? car.nameDe || car.name : car.name
  const displaySubtitle = locale === "de" ? car.subtitleDe || car.subtitle : car.subtitle

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
    />
  )
}
