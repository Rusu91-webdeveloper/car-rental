import { PrivateDocumentError } from "@/lib/private-documents/domain/errors"
import { loadPrivateDocumentRequestContext } from "@/lib/private-documents/server/request-context"
import { ReauthenticatePanel } from "@/components/private-documents/reauthenticate-panel"
import { DocumentReviewClient } from "./review-client"
import { prisma } from "@/lib/db"
import { Link } from "@/navigation"
import { ArrowLeft, CalendarDays, UserRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"

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
  const caseContext = await prisma.customerDocument.findUnique({
    where: { id: documentId },
    select: {
      uploadSession: {
        select: {
          bookingApplication: {
            select: {
              id: true,
              status: true,
              pickupAt: true,
              returnAt: true,
              customer: { select: { name: true, email: true } },
              car: { select: { name: true, nameDe: true } },
            },
          },
        },
      },
    },
  })
  return {
    document,
    application: caseContext?.uploadSession?.bookingApplication ?? null,
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
  const reauthenticationReturnTo = `/${locale}/admin/documents/${documentId}`
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
        <ReauthenticatePanel returnTo={reauthenticationReturnTo} />
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
      <header className="space-y-4">
        <Link href={state.application ? `/admin/documents/applications/${state.application.id}` : "/admin/documents"} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {state.application ? (locale === "de" ? "Zurück zum Buchungsantrag" : "Back to booking application") : (locale === "de" ? "Zurück zur Prüfliste" : "Back to review queue")}
        </Link>
        <div>
          <p className="text-sm font-medium text-primary">{locale === "de" ? "Dokumentenentscheidung" : "Document decision"}</p>
          <h1 className="text-2xl font-semibold">{locale === "de" ? "Kann dieses Dokument akzeptiert werden?" : "Can this document be accepted?"}</h1>
        </div>
        {state.application ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-muted/20 p-4 text-sm">
            <strong>{locale === "de" ? state.application.car.nameDe || state.application.car.name : state.application.car.name}</strong>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><UserRound className="h-4 w-4" />{state.application.customer.name || state.application.customer.email}</span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><CalendarDays className="h-4 w-4" />{new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(state.application.pickupAt)} – {new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(state.application.returnAt)}</span>
            <Badge variant="secondary">{state.application.status.replaceAll("_", " ").toLowerCase()}</Badge>
          </div>
        ) : null}
      </header>
      <DocumentReviewClient
        document={state.document}
        history={state.history}
        replacements={state.replacements}
        locale={locale}
        returnTo={state.application ? `/admin/documents/applications/${state.application.id}` : "/admin/documents"}
      />
    </main>
  )
}
