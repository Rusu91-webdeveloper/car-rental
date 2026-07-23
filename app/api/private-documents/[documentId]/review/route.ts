import { PrivateDocumentError } from "@/lib/private-documents/domain/errors"
import type { DocumentReviewReasonValue } from "@/lib/private-documents/application/repository"
import { loadPrivateDocumentRequestContext } from "@/lib/private-documents/server/request-context"
import { PrismaBookingApplicationRepository } from "@/lib/booking-applications/infrastructure/prisma-repository"
import { dispatchPendingBookingNotificationsForBooking } from "@/lib/booking-notifications"
import { prisma } from "@/lib/db"
import { logger } from "@/lib/logger"
import { sendDocumentReviewDecisionEmail } from "@/lib/email"
import { enforceRateLimit, PHASE8FB_RATE_LIMITS } from "@/lib/rate-limit"
import { revalidatePath } from "next/cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function reviewReasonLabel(value: string | undefined, locale: "de" | "en") {
  if (!value) return undefined
  const labels: Record<string, [string, string]> = {
    UNREADABLE: ["Document is unreadable.", "Das Dokument ist nicht lesbar."],
    CROPPED: ["Important parts of the document are cropped.", "Wichtige Teile des Dokuments sind abgeschnitten."],
    WRONG_DOCUMENT: ["The uploaded file is the wrong document.", "Die hochgeladene Datei ist nicht das richtige Dokument."],
    WRONG_SIDE: ["The wrong side of the document was uploaded.", "Die falsche Seite des Dokuments wurde hochgeladen."],
    EXPIRED: ["The document has expired.", "Das Dokument ist abgelaufen."],
    DETAILS_MISMATCH: ["The document details do not match the application.", "Die Dokumentdaten stimmen nicht mit dem Antrag überein."],
    MISSING_INFORMATION: ["Required information is missing.", "Erforderliche Angaben fehlen."],
    SUSPECTED_ALTERATION: ["The document requires additional verification.", "Das Dokument muss zusätzlich geprüft werden."],
    DUPLICATE: ["The same document was uploaded more than once.", "Dasselbe Dokument wurde mehrfach hochgeladen."],
    OTHER: ["Please follow the reviewer's note.", "Bitte beachten Sie den Hinweis des Prüfteams."],
  }
  return labels[value]?.[locale === "de" ? 1 : 0] ?? value
}

function documentTypeLabel(key: string, fallback: string, locale: "de" | "en") {
  if (locale !== "de") return fallback
  return (
    {
      IDENTITY_CARD: "Personalausweis",
      PASSPORT: "Reisepass",
      DRIVING_LICENCE: "Führerschein",
    }[key] ?? fallback
  )
}

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params
  try {
    const body = (await request.json()) as {
      decision?: unknown
      expectedReviewRevision?: unknown
      reasonCode?: unknown
      safeReviewerNote?: unknown
    }
    if (
      !["APPROVED", "REJECTED", "REPLACEMENT_REQUIRED"].includes(String(body.decision)) ||
      !Number.isSafeInteger(body.expectedReviewRevision) ||
      Number(body.expectedReviewRevision) < 0 ||
      (body.reasonCode !== undefined && typeof body.reasonCode !== "string") ||
      (body.safeReviewerNote !== undefined && typeof body.safeReviewerNote !== "string")
    )
      return Response.json({ code: "DOCUMENT_REVIEW_REQUEST_INVALID" }, { status: 400, headers: { "Cache-Control": "private, no-store" } })
    const context = await loadPrivateDocumentRequestContext(documentId)
    await enforceRateLimit("document:review", context.actor.userId, PHASE8FB_RATE_LIMITS.reviewDecision)
    const common = {
      documentId,
      expectedReviewRevision: Number(body.expectedReviewRevision),
      actor: context.actor,
      permission: context.permission,
      evidence: context.evidence,
      safeReviewerNote: body.safeReviewerNote as string | undefined,
    }
    const document =
      body.decision === "APPROVED"
        ? await context.reviews.approveDocument(common)
        : body.decision === "REJECTED"
          ? await context.reviews.rejectDocument({
              ...common,
              reasonCode: body.reasonCode as DocumentReviewReasonValue | undefined,
            })
          : await context.reviews.requestDocumentReplacement({
              ...common,
              reasonCode: body.reasonCode as DocumentReviewReasonValue | undefined,
            })
    const binding = await prisma.documentUploadSession.findFirst({
      where: { customerDocuments: { some: { id: document.id } } },
      select: { bookingApplicationId: true },
    })
    let finalizedBookingId: string | undefined
    let finalizedBookingStatus: "PENDING" | "CONFIRMED" | undefined
    let confirmationEmailSent: boolean | undefined
    if (binding?.bookingApplicationId) {
      const repository = new PrismaBookingApplicationRepository(prisma)
      const currentApplication = await repository.load(binding.bookingApplicationId)
      if (body.decision !== "APPROVED" && currentApplication && !["FINALIZED", "CANCELLED", "EXPIRED", "REJECTED"].includes(currentApplication.status)) {
        await repository.markCustomerActionRequired({
          applicationId: currentApplication.id,
          customerUserId: currentApplication.customerUserId,
          expectedRevision: currentApplication.revision,
          reason: "DOCUMENT_REPLACEMENT_REQUIRED",
        })
      }
      const readiness = await repository.evaluateReadiness(binding.bookingApplicationId)
      if (body.decision === "APPROVED" && readiness.ready) {
        const readyApplication = await repository.load(binding.bookingApplicationId)
        if (readyApplication?.status === "READY_TO_FINALIZE") {
          const finalized = await repository.finalize({
            applicationId: readyApplication.id,
            customerUserId: readyApplication.customerUserId,
            expectedRevision: readyApplication.revision,
          })
          finalizedBookingId = finalized.bookingId
          if (finalizedBookingId) {
            const finalizedBooking = await prisma.booking.findUnique({
              where: { id: finalizedBookingId },
              select: { status: true, paymentMethod: true },
            })
            finalizedBookingStatus = finalizedBooking?.status === "CONFIRMED" ? "CONFIRMED" : "PENDING"
            await prisma.adminAuditLog.create({
              data: {
                adminId: context.actor.userId,
                action: finalizedBooking?.status === "CONFIRMED" ? "BOOKING_CONFIRMED" : "BOOKING_CREATED",
                targetType: "booking",
                targetId: finalizedBookingId,
                bookingId: finalizedBookingId,
                oldValue: { status: "BOOKING_APPLICATION_DOCUMENT_REVIEW" },
                newValue: {
                  status: finalizedBooking?.status ?? "PENDING",
                  paymentMethod: finalizedBooking?.paymentMethod,
                },
                reason: "All required customer documents were approved.",
              },
            })
            const deliveries = await dispatchPendingBookingNotificationsForBooking(finalizedBookingId)
            confirmationEmailSent = deliveries.some((delivery) => "sent" in delivery)
            if (deliveries.some((delivery) => "error" in delivery))
              logger.error("booking.confirmation_email_failed_after_document_approval", {
                bookingId: finalizedBookingId,
              })
            revalidatePath("/admin")
            revalidatePath("/bookings")
          }
        }
      } else if (body.decision === "REJECTED" || body.decision === "REPLACEMENT_REQUIRED") {
        try {
          const emailContext = await prisma.bookingApplication.findUnique({
            where: { id: binding.bookingApplicationId },
            include: {
              customer: { select: { email: true, name: true } },
              customerDriver: {
                select: { firstName: true, lastName: true, email: true },
              },
              car: { select: { name: true, nameDe: true } },
              documentPolicyConfig: {
                include: {
                  requirements: {
                    where: { documentTypeId: document.documentTypeId },
                    include: { documentType: true, translations: true },
                    take: 1,
                  },
                },
              },
            },
          })
          if (emailContext) {
            const locale = emailContext.locale === "de" ? "de" : "en"
            const customerEmail = emailContext.customerDriver?.email || emailContext.customer.email
            if (customerEmail) {
              const userName =
                [emailContext.customerDriver?.firstName, emailContext.customerDriver?.lastName].filter(Boolean).join(" ") ||
                emailContext.customer.name ||
                customerEmail
              const requirement = emailContext.documentPolicyConfig.requirements[0]
              const documentName = requirement
                ? documentTypeLabel(requirement.documentType.key, requirement.documentType.name, locale)
                : document.documentTypeId
              const formatDate = (value: Date) =>
                new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Europe/Berlin",
                }).format(value)
              const delivery = await sendDocumentReviewDecisionEmail({
                applicationId: emailContext.id,
                to: customerEmail,
                userName,
                carName: locale === "de" ? emailContext.car.nameDe || emailContext.car.name : emailContext.car.name,
                pickupDate: formatDate(emailContext.pickupAt),
                returnDate: formatDate(emailContext.returnAt),
                location: emailContext.pickupLocation,
                locale,
                decision: body.decision,
                documentName,
                reason: (body.safeReviewerNote as string | undefined)?.trim() || reviewReasonLabel(body.reasonCode as string | undefined, locale),
                idempotencyKey: `document-review-${document.id}-${body.decision}-${document.reviewRevision}`,
              })
              if ("error" in delivery) {
                logger.error("document.review_customer_email_failed", {
                  documentId: document.id,
                  applicationId: emailContext.id,
                  decision: body.decision,
                })
              }
            }
          }
        } catch (error) {
          logger.error("document.review_customer_email_failed", {
            documentId: document.id,
            applicationId: binding.bookingApplicationId,
            decision: body.decision,
            error: error instanceof Error ? error.message : "unknown",
          })
        }
      }
    }
    return Response.json(
      {
        documentId: document.id,
        status: document.manualReviewStatus,
        reviewRevision: document.reviewRevision,
        bookingId: finalizedBookingId,
        bookingCreated: Boolean(finalizedBookingId),
        bookingConfirmed: finalizedBookingStatus === "CONFIRMED",
        awaitingPayment: finalizedBookingStatus === "PENDING",
        confirmationEmailSent,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    const code = error instanceof PrivateDocumentError ? error.code : "DOCUMENT_REVIEW_REQUEST_FAILED"
    return Response.json(
      { code },
      {
        status: code.startsWith("RECENT_AUTH_") ? 401 : 409,
        headers: { "Cache-Control": "private, no-store" },
      },
    )
  }
}
