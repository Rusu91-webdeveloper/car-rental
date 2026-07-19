import { PrivateDocumentError } from "@/lib/private-documents/domain/errors"
import { loadRestrictedDocumentActor } from "@/lib/private-documents/server/request-context"
import { DocumentReviewQueue } from "./review-queue-client"

export const dynamic = "force-dynamic"

export default async function DocumentReviewQueuePage() {
  let state:
    | Awaited<ReturnType<Awaited<ReturnType<typeof loadRestrictedDocumentActor>>["reviews"]["listReviewQueue"]>>
    | { error: string }
  try {
    const context = await loadRestrictedDocumentActor()
    state = await context.reviews.listReviewQueue({
      actor: context.actor,
      limit: 25,
    })
  } catch (error) {
    state = {
      error: error instanceof PrivateDocumentError ? error.message : "The restricted review queue is unavailable.",
    }
  }
  if ("error" in state)
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold">Document review unavailable</h1>
        <p className="mt-3 text-muted-foreground">{state.error}</p>
      </main>
    )
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-sm font-medium text-primary">Documents</p>
        <h1 className="text-2xl font-semibold">Which documents need a decision?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review customer uploads and either approve them or ask for a replacement.
        </p>
      </header>
      <DocumentReviewQueue initialItems={state.items} initialCursor={state.nextCursor} />
    </main>
  )
}
