import { redirect } from "@/navigation"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { getCarReviewStats, getCarReviewStatsMap } from "@/lib/car-review-stats"
import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { buildOwnerSettingsGuide } from "@/lib/admin/owner-settings-guide"
import { loadOwnerSettingsOverview } from "@/lib/admin/owner-settings-overview"
import { legalContentHash } from "@/lib/legal/content"
import { maskLicenceNumber } from "@/lib/booking-configuration/field-resolver"
import AdminDashboard from "./admin-client"
import type { Car, User } from "@prisma/client"

export const dynamic = "force-dynamic"

const MANUAL_RESERVATION_PREFIX = "manual_reservation::"

type ManualReservationPayload = {
  customerName: string
  customerPhone: string
  totalPrice: number
}

const parseManualReservationPayload = (reason: string | null): ManualReservationPayload | null => {
  if (!reason || !reason.startsWith(MANUAL_RESERVATION_PREFIX)) {
    return null
  }

  try {
    const parsed = JSON.parse(reason.slice(MANUAL_RESERVATION_PREFIX.length))
    if (
      typeof parsed?.customerName === "string" &&
      typeof parsed?.customerPhone === "string" &&
      typeof parsed?.totalPrice === "number"
    ) {
      return {
        customerName: parsed.customerName,
        customerPhone: parsed.customerPhone,
        totalPrice: parsed.totalPrice,
      }
    }
  } catch (error) {
    console.error("[PARSE_MANUAL_RESERVATION_ERROR]", error)
  }

  return null
}

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ section?: string }>
}) {
  const { locale } = await params
  const { section: requestedSection } = await searchParams
  const user = await getCurrentUser()
  const signInUrl = "/sign-in"

  if (!user) {
    redirect({ href: signInUrl, locale })
  }

  // TypeScript doesn't know redirect throws, use non-null assertion
  if (user!.role !== "ADMIN") {
    redirect({ href: "/", locale })
  }

  // At this point, user is guaranteed to be non-null and ADMIN
  const adminUser = user!
  const capabilities = await getBusinessConfigurationCapabilities()

  const [cars, bookings, bookingApplications, users, blockedDates, reviews, companySettings, configurationOverview, documentReviewCount, completedSetupSteps] =
    await Promise.all([
      prisma.car.findMany({
        where: { isDeleted: false },
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          pricingSnapshot: true,
          insuranceSnapshot: true,
          customerDriverSnapshot: capabilities.canViewSensitiveCustomerData,
          legalAcceptances: {
            include: {
              legalDocumentTranslation: {
                include: { legalDocumentVersion: true },
              },
            },
            orderBy: { acceptedAt: "asc" },
          },
        },
      }),
      prisma.bookingApplication.findMany({
        where: {
          bookingId: null,
          status: { notIn: ["FINALIZING", "FINALIZED"] },
        },
        select: {
          id: true,
          customerUserId: true,
          carId: true,
          status: true,
          pickupAt: true,
          returnAt: true,
          pickupLocation: true,
          updatedAt: true,
          pricingQuotes: {
            where: { isCurrent: true },
            select: { grandTotal: true, currency: true },
            take: 1,
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
      }),
      prisma.blockedDate.findMany({
        orderBy: { createdAt: "desc" },
      }),
      prisma.review.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
          car: {
            select: {
              id: true,
              name: true,
              nameDe: true,
            },
          },
          booking: {
            select: {
              bookingNumber: true,
            },
          },
        },
      }),
      prisma.companySettings.findUnique({ where: { id: "company-settings" } }),
      loadOwnerSettingsOverview(),
      capabilities.canViewDocuments
        ? prisma.bookingApplication.count({
            where: { status: "AWAITING_DOCUMENT_REVIEW" },
          })
        : Promise.resolve(null),
      prisma.auditEvent.findMany({
        where: {
          category: "CONFIGURATION",
          action: "owner_setup.step_completed",
          targetType: "OwnerSetupStep",
        },
        distinct: ["targetId"],
        select: { targetId: true },
      }),
    ])

  const manualReservations = blockedDates
    .map((blockedDate) => {
      const payload = parseManualReservationPayload(blockedDate.reason)
      if (!payload) {
        return null
      }

      return {
        id: blockedDate.id,
        carId: blockedDate.carId,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        totalPrice: payload.totalPrice,
        pickupDate: blockedDate.startDate.toISOString(),
        dropoffDate: blockedDate.endDate.toISOString(),
        createdAt: blockedDate.createdAt.toISOString(),
      }
    })
    .filter((reservation): reservation is NonNullable<typeof reservation> => reservation !== null)
  const reviewStatsByCar = await getCarReviewStatsMap(cars.map((car) => car.id))
  const allowedSections = new Set(["overview", "cars", "bookings", "users", "reviews", "analytics"])
  const initialSection = requestedSection && allowedSections.has(requestedSection) ? requestedSection : "overview"
  const settingsGuide = buildOwnerSettingsGuide({
    company: companySettings,
    overview: configurationOverview,
    completedStepIds: completedSetupSteps.map(({ targetId }) => targetId),
    locale,
  })
  const setup = {
    completed: settingsGuide.completed,
    total: settingsGuide.total,
    percent: settingsGuide.percent,
    readyForBookings: settingsGuide.nextStep === null,
    steps: settingsGuide.steps.map((step) => ({
      id: step.id,
      title: step.title,
      description: step.description,
      href: step.href,
      complete: step.state === "complete",
    })),
  }
  const generatedAt = new Date().toISOString()

  return (
    <AdminDashboard
      key={`${initialSection}:${generatedAt}`}
      initialSection={initialSection}
      generatedAt={generatedAt}
      setup={setup}
      documentReviewCount={documentReviewCount}
      canReviewDocuments={capabilities.canViewDocuments}
      currentUser={{
        id: adminUser.id,
        name: adminUser.name || adminUser.email,
        email: adminUser.email,
      }}
      cars={cars.map((car: Car) => {
        const stats = getCarReviewStats(reviewStatsByCar, car.id)

        return {
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
          rating: stats.rating,
          reviews: stats.reviewCount,
          description: car.description,
          descriptionDe: car.descriptionDe,
        }
      })}
      bookings={bookings.map((booking) => ({
        id: booking.id,
        userId: booking.userId,
        carId: booking.carId,
        pickupDate: booking.pickupDate.toISOString(),
        dropoffDate: booking.dropoffDate.toISOString(),
        location: booking.location,
        totalPrice: booking.pricingSnapshot?.grandTotal ?? booking.totalPrice,
        currency: booking.pricingSnapshot?.currency ?? "EUR",
        guaranteeAmount: booking.guaranteeAmount,
        status: booking.status,
        paymentMethod: booking.paymentMethod,
        createdAt: booking.createdAt.toISOString(),
        provenance: {
          configurationReleaseId: booking.pricingSnapshot?.configurationReleaseId ?? null,
          insuranceConfigVersionId: booking.insuranceSnapshot?.insuranceConfigVersionId ?? null,
          customerDriverConfigVersionId: booking.customerDriverSnapshot?.customerDriverConfigVersionId ?? null,
          legalAcceptanceConfigVersionId: booking.legalAcceptances[0]?.legalAcceptanceConfigVersionId ?? null,
        },
        insurance:
          booking.insuranceSnapshot?.showInConfirmation && booking.insuranceSnapshot.selected
            ? {
                name: booking.insuranceSnapshot.customerFacingName,
                subtotal: booking.insuranceSnapshot.subtotal,
              }
            : null,
        customer: booking.customerDriverSnapshot
          ? {
              name: `${booking.customerDriverSnapshot.firstName} ${booking.customerDriverSnapshot.lastName}`.trim(),
              email: booking.customerDriverSnapshot.email,
              phone: booking.customerDriverSnapshot.phone,
              dateOfBirth: booking.customerDriverSnapshot.dateOfBirth?.toISOString() ?? null,
              licenceNumber: maskLicenceNumber(booking.customerDriverSnapshot.licenceNumber),
              validatedAt: booking.customerDriverSnapshot.validatedAt?.toISOString() ?? null,
            }
          : null,
        legalAcceptances: booking.legalAcceptances.map((acceptance) => ({
          id: acceptance.id,
          type: acceptance.documentType,
          title: acceptance.legalDocumentTranslation.title,
          versionNumber: acceptance.documentVersionNumber,
          locale: acceptance.locale,
          translationId: acceptance.legalDocumentTranslationId,
          acceptedAt: acceptance.acceptedAt.toISOString(),
          source: acceptance.source,
          hasExactProvenance: Boolean(acceptance.configurationReleaseId && acceptance.legalAcceptanceConfigVersionId),
          hashVerified:
            acceptance.contentHash === legalContentHash(acceptance.legalDocumentTranslation.canonicalContent),
        })),
      }))}
      bookingApplications={bookingApplications.map((application) => ({
        id: application.id,
        userId: application.customerUserId,
        carId: application.carId,
        status: application.status,
        pickupDate: application.pickupAt.toISOString(),
        dropoffDate: application.returnAt.toISOString(),
        location: application.pickupLocation,
        totalPrice: application.pricingQuotes[0]?.grandTotal ?? null,
        currency: application.pricingQuotes[0]?.currency ?? "EUR",
        updatedAt: application.updatedAt.toISOString(),
      }))}
      users={users.map((item: User) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        role: item.role,
        isActive: item.isActive,
        createdAt: item.createdAt.toISOString(),
      }))}
      reviews={reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
        carId: review.carId,
        carName: review.car.name,
        carNameDe: review.car.nameDe,
        bookingNumber: review.booking.bookingNumber,
        userName: review.user.name,
        userEmail: review.user.email,
      }))}
      manualReservations={manualReservations}
    />
  )
}
