import { redirect } from "@/navigation"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { evaluateBookingApplicationReadiness, resumeBookingApplication } from "@/lib/booking-applications/service"
import { BookingApplicationError } from "@/lib/booking-applications/errors"
import { PrismaBookingApplicationRepository } from "@/lib/booking-applications/infrastructure/prisma-repository"
import { BookingApplicationClient } from "./booking-application-client"

export const dynamic = "force-dynamic"

export default async function BookingApplicationPage({
  params,
}: {
  params: Promise<{ locale: string; applicationId: string }>
}) {
  const { locale, applicationId } = await params
  const user = await getCurrentUser()
  if (!user)
    redirect({
      href: `/sign-in?redirect_url=${encodeURIComponent(`/${locale}/applications/${applicationId}`)}`,
      locale,
    })
  const repository = new PrismaBookingApplicationRepository(prisma)
  let state:
    | {
        application: NonNullable<Awaited<ReturnType<typeof repository.load>>>
        readiness: Awaited<ReturnType<typeof evaluateBookingApplicationReadiness>>
      }
    | { error: string }
  try {
    await resumeBookingApplication(repository, {
      applicationId,
      customerUserId: user!.id,
    })
    const readiness = await evaluateBookingApplicationReadiness(repository, applicationId)
    const application = await repository.load(applicationId)
    if (!application) throw new Error("Application disappeared")
    state = { application, readiness }
  } catch (error) {
    if (error instanceof BookingApplicationError) state = { error: error.message }
    else throw error
  }
  if ("error" in state)
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold">{locale === "de" ? "Antrag nicht verfügbar" : "Application unavailable"}</h1>
        <p className="mt-3 text-muted-foreground">
          {locale === "de" ? "Dieser Buchungsantrag kann derzeit nicht geöffnet werden. Bitte kehren Sie zu Ihren Buchungen zurück oder wenden Sie sich an den Support." : state.error}
        </p>
      </main>
    )
  return (
    <BookingApplicationClient
      locale={locale}
      initialApplication={state.application}
      initialReadiness={state.readiness}
    />
  )
}
