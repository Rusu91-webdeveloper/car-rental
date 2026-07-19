import { PrivateDocumentError } from "@/lib/private-documents/domain/errors"
import { loadPrivateDocumentRequestContext } from "@/lib/private-documents/server/request-context"
import { ReauthenticatePanel } from "@/components/private-documents/reauthenticate-panel"
import { DocumentReviewClient } from "./review-client"

export const dynamic = "force-dynamic"

async function loadReviewPage(documentId: string) {
  const context = await loadPrivateDocumentRequestContext(documentId)
  const document = await context.reviews.loadDocumentForReview({
    documentId,
    actor: context.actor,
    permission: context.permission,
    evidence: context.evidence,
  })
  const history = await context.reviews.listDocumentReviewHistory({
    documentId,
    actor: context.actor,
    permission: context.permission,
  })
  const replacementHistory = await context.repository.listSessionDocuments(context.scope.uploadSessionId ?? "")
  return {
    document,
    history: history.map((item) => ({
      ...item,
      reviewedAt: item.reviewedAt.toISOString(),
    })),
    replacements: replacementHistory
      .filter(
        (item) =>
          item.documentTypeId === document.documentTypeId &&
          item.slotNumber === document.slotNumber &&
          item.side === document.side,
      )
      .map((item) => ({
        id: item.id,
        attemptNumber: item.attemptNumber,
        status: item.manualReviewStatus,
        replacesDocumentId: item.replacesDocumentId,
      })),
  }
}

export default async function DocumentReviewPage({
  params,
}: {
  params: Promise<{ locale: string; documentId: string }>
}) {
  const { locale, documentId } = await params
  const returnTo = `/${locale}/admin/documents/${documentId}`
  let state: Awaited<ReturnType<typeof loadReviewPage>> | { reauthenticate: true } | { error: string }
  try {
    state = await loadReviewPage(documentId)
  } catch (error) {
    if (error instanceof PrivateDocumentError && error.code.startsWith("RECENT_AUTH_")) state = { reauthenticate: true }
    else
      state = {
        error: error instanceof PrivateDocumentError ? error.message : "Document review is unavailable.",
      }
  }
  if ("reauthenticate" in state)
    return (
      <main className="mx-auto max-w-2xl p-6">
        <ReauthenticatePanel returnTo={returnTo} />
      </main>
    )
  if ("error" in state)
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold">Review unavailable</h1>
        <p className="mt-3 text-muted-foreground">{state.error}</p>
      </main>
    )
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-sm font-medium text-primary">Documents</p>
        <h1 className="text-2xl font-semibold">Can this document be accepted?</h1>
      </header>
      <DocumentReviewClient document={state.document} history={state.history} replacements={state.replacements} />
    </main>
  )
}
