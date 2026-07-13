import { PrivateDocumentError } from "@/lib/private-documents/domain/errors";
import type { DocumentReviewReasonValue } from "@/lib/private-documents/application/repository";
import { loadPrivateDocumentRequestContext } from "@/lib/private-documents/server/request-context";

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
    return Response.json(
      {
        documentId: document.id,
        status: document.manualReviewStatus,
        reviewRevision: document.reviewRevision,
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
