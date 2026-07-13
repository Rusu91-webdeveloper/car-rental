import { prisma } from "@/lib/db";
import { PrivateDocumentError } from "../domain/errors";
import { loadPrivateDocumentRequestContext } from "./request-context";

function safeExtension(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  return "jpg";
}

function errorStatus(code: string) {
  if (code.startsWith("RECENT_AUTH_")) return 401;
  if (code === "DOCUMENT_ACCESS_DENIED") return 403;
  if (code === "DOCUMENT_UPLOAD_NOT_FOUND") return 404;
  return 409;
}

export async function streamPrivateDocument(input: {
  documentId: string;
  purpose: "VIEW" | "DOWNLOAD";
}) {
  let contextLoaded = false;
  try {
    const context = await loadPrivateDocumentRequestContext(input.documentId);
    contextLoaded = true;
    const { document, read } = await context.access.open({
      documentId: input.documentId,
      actor: context.actor,
      permission: context.permission,
      purpose: input.purpose,
      evidence: context.evidence,
      recentAuthMaximumAgeMs: context.recentAuthMaximumAgeMs,
      scope: context.scope,
    });
    const contentType = document.validation.detectedMimeType;
    const disposition = input.purpose === "DOWNLOAD" ? "attachment" : "inline";
    const filename = `document-${document.id}.${safeExtension(contentType)}`;
    return new Response(read.stream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(read.metadata.sizeBytes),
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    if (!contextLoaded)
      await prisma.auditEvent
        .create({
          data: {
            category: "DOCUMENT",
            action:
              input.purpose === "DOWNLOAD"
                ? "document.download_denied"
                : "document.view_denied",
            targetType: "CustomerDocument",
            targetId: input.documentId,
            metadata: { reason: "AUTHENTICATION_OR_SCOPE_DENIED" },
          },
        })
        .catch(() => undefined);
    const code =
      error instanceof PrivateDocumentError
        ? error.code
        : "DOCUMENT_PROVIDER_OPERATION_FAILED";
    return Response.json(
      { code, message: "Private document access was denied." },
      {
        status: errorStatus(code),
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
}
