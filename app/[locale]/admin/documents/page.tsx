import { PrivateDocumentError } from "@/lib/private-documents/domain/errors"
import { loadRestrictedDocumentActor } from "@/lib/private-documents/server/request-context"
import { presentReviewQueue, type PresentedReviewQueueItem } from "@/lib/private-documents/application/review-queue-presenter"
import { DocumentReviewQueue } from "./review-queue-client"

export const dynamic = "force-dynamic"

export default async function DocumentReviewQueuePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  let state: { items: PresentedReviewQueueItem[]; nextCursor?: string } | { error: string }
  try {
    const context = await loadRestrictedDocumentActor()
    const queue = await context.reviews.listReviewQueue({
      actor: context.actor,
      limit: 100,
    })
    state = { ...queue, items: await presentReviewQueue(queue.items) }
  } catch (error) {
    state = {
      error: error instanceof PrivateDocumentError ? error.message : "The restricted review queue is unavailable.",
    }
  }
  if ("error" in state)
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold">
          {locale === "de" ? "Dokumentenprüfung nicht verfügbar" : "Document review unavailable"}
        </h1>
        <p className="mt-3 text-muted-foreground">{state.error}</p>
      </main>
    )
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-sm font-medium text-primary">{locale === "de" ? "Buchungsprüfung" : "Booking review"}</p>
        <h1 className="text-2xl font-semibold">
          {locale === "de" ? "Welche Buchungsanträge benötigen eine Entscheidung?" : "Which booking applications need a decision?"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {locale === "de"
            ? "Prüfen Sie Antrag, Fahrerinformationen und alle hochgeladenen Dokumente an einem Ort."
            : "Review the application, driver information and every uploaded document in one place."}
        </p>
      </header>
      <DocumentReviewQueue initialItems={state.items} initialCursor={state.nextCursor} />
    </main>
  )
}
