import { PrivateDocumentError } from "@/lib/private-documents/domain/errors";
import { loadRestrictedDocumentActor } from "@/lib/private-documents/server/request-context";
import { presentReviewQueue } from "@/lib/private-documents/application/review-queue-presenter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const context = await loadRestrictedDocumentActor();
    const status = url.searchParams.get("status");
    const statuses = status
      ? status
          .split(",")
          .filter((value): value is "PENDING_REVIEW" | "REJECTED" | "REPLACEMENT_REQUIRED" =>
            ["PENDING_REVIEW", "REJECTED", "REPLACEMENT_REQUIRED"].includes(
              value,
            ),
          )
      : undefined;
    const result = await context.reviews.listReviewQueue({
      actor: context.actor,
      statuses,
      documentTypeId: url.searchParams.get("documentTypeId") ?? undefined,
      bookingId: url.searchParams.get("bookingId") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      minimumPendingAgeMs:
        url.searchParams.get("minimumPendingAgeMinutes") === null
          ? undefined
          : Math.max(
              0,
              Number(url.searchParams.get("minimumPendingAgeMinutes")) *
                60_000,
            ),
      limit: Number(url.searchParams.get("limit") ?? 25),
    });
    return Response.json({ ...result, items: await presentReviewQueue(result.items) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const code =
      error instanceof PrivateDocumentError
        ? error.code
        : "DOCUMENT_REVIEW_QUEUE_UNAVAILABLE";
    return Response.json(
      { code },
      {
        status: code === "DOCUMENT_ACCESS_DENIED" ? 403 : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
