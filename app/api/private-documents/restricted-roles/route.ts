import {
  RESTRICTED_DOCUMENT_ROLES,
  type RestrictedDocumentRole,
} from "@/lib/private-documents/application/restricted-role-service";
import { PrivateDocumentError } from "@/lib/private-documents/domain/errors";
import { loadRestrictedDocumentActor } from "@/lib/private-documents/server/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: unknown;
      targetUserId?: unknown;
      roleKey?: unknown;
    };
    if (
      !["ASSIGN", "REVOKE"].includes(String(body.action)) ||
      typeof body.targetUserId !== "string" ||
      !RESTRICTED_DOCUMENT_ROLES.includes(
        body.roleKey as RestrictedDocumentRole,
      )
    )
      return Response.json(
        { code: "DOCUMENT_ROLE_REQUEST_INVALID" },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    const context = await loadRestrictedDocumentActor();
    const input = {
      actor: context.actor,
      targetUserId: body.targetUserId,
      roleKey: body.roleKey as RestrictedDocumentRole,
      evidence: context.evidence,
    };
    const result =
      body.action === "ASSIGN"
        ? await context.roles.assign(input)
        : await context.roles.revoke(input);
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const code =
      error instanceof PrivateDocumentError
        ? error.code
        : "DOCUMENT_ROLE_REQUEST_FAILED";
    return Response.json(
      { code },
      {
        status: code.startsWith("RECENT_AUTH_") ? 401 : 403,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
