import { streamPrivateDocument } from "@/lib/private-documents/server/stream-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  return streamPrivateDocument({ documentId, purpose: "VIEW" });
}
