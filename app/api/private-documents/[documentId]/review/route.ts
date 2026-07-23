import { PrivateDocumentError } from "@/lib/private-documents/domain/errors";
import type { DocumentReviewReasonValue } from "@/lib/private-documents/application/repository";
import { loadPrivateDocumentRequestContext } from "@/lib/private-documents/server/request-context";
import { PrismaBookingApplicationRepository } from "@/lib/booking-applications/infrastructure/prisma-repository";
import { deliverBookingConfirmation } from "@/lib/booking-confirmation-delivery";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { enforceRateLimit, PHASE8FB_RATE_LIMITS } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  try {
    const body = (await request.json()) as {
      decision?: unknown;
      expectedReviewRevision?: unknown;
      reasonCode?: unknown;
      safeReviewerNote?: unknown;
    };
    if (
      !["APPROVED", "REJECTED", "REPLACEMENT_REQUIRED"].includes(
        String(body.decision),
      ) ||
      !Number.isSafeInteger(body.expectedReviewRevision) ||
      Number(body.expectedReviewRevision) < 0 ||
      (body.reasonCode !== undefined && typeof body.reasonCode !== "string") ||
      (body.safeReviewerNote !== undefined &&
        typeof body.safeReviewerNote !== "string")
    )
      return Response.json(
        { code: "DOCUMENT_REVIEW_REQUEST_INVALID" },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    const context = await loadPrivateDocumentRequestContext(documentId);
    await enforceRateLimit("document:review", context.actor.userId, PHASE8FB_RATE_LIMITS.reviewDecision);
    const common = {
      documentId,
      expectedReviewRevision: Number(body.expectedReviewRevision),
      actor: context.actor,
      permission: context.permission,
      evidence: context.evidence,
      safeReviewerNote: body.safeReviewerNote as string | undefined,
    };
    const document =
      body.decision === "APPROVED"
        ? await context.reviews.approveDocument(common)
        : body.decision === "REJECTED"
          ? await context.reviews.rejectDocument({
              ...common,
              reasonCode: body.reasonCode as
                | DocumentReviewReasonValue
                | undefined,
            })
          : await context.reviews.requestDocumentReplacement({
              ...common,
              reasonCode: body.reasonCode as
                | DocumentReviewReasonValue
                | undefined,
            });
    const binding = await prisma.documentUploadSession.findFirst({
      where: { customerDocuments: { some: { id: document.id } } },
      select: { bookingApplicationId: true },
    });
    let finalizedBookingId: string | undefined;
    let confirmationEmailSent: boolean | undefined;
    if (binding?.bookingApplicationId) {
      const repository = new PrismaBookingApplicationRepository(prisma);
      const readiness = await repository.evaluateReadiness(binding.bookingApplicationId);
      if (body.decision === "APPROVED" && readiness.ready) {
        const readyApplication = await repository.load(binding.bookingApplicationId);
        if (readyApplication?.status === "READY_TO_FINALIZE") {
          const finalized = await repository.finalize({
            applicationId: readyApplication.id,
            customerUserId: readyApplication.customerUserId,
            expectedRevision: readyApplication.revision,
          });
          finalizedBookingId = finalized.bookingId;
          if (finalizedBookingId) {
            await prisma.adminAuditLog.create({
              data: {
                adminId: context.actor.userId,
                action: "BOOKING_CONFIRMED",
                targetType: "booking",
                targetId: finalizedBookingId,
                bookingId: finalizedBookingId,
                oldValue: { status: "BOOKING_APPLICATION_DOCUMENT_REVIEW" },
                newValue: { status: "CONFIRMED" },
                reason: "All required customer documents were approved.",
              },
            });
            const delivery = await deliverBookingConfirmation(finalizedBookingId);
            confirmationEmailSent = !delivery.error;
            if (delivery.error)
              logger.error("booking.confirmation_email_failed_after_document_approval", {
                bookingId: finalizedBookingId,
                error: delivery.error,
              });
            revalidatePath("/admin");
            revalidatePath("/bookings");
          }
        }
      }
    }
    return Response.json(
      {
        documentId: document.id,
        status: document.manualReviewStatus,
        reviewRevision: document.reviewRevision,
        bookingId: finalizedBookingId,
        bookingConfirmed: Boolean(finalizedBookingId),
        confirmationEmailSent,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const code =
      error instanceof PrivateDocumentError
        ? error.code
        : "DOCUMENT_REVIEW_REQUEST_FAILED";
    return Response.json(
      { code },
      {
        status: code.startsWith("RECENT_AUTH_") ? 401 : 409,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
