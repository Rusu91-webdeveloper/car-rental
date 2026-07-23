"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"

const REASONS = [
  "UNREADABLE",
  "CROPPED",
  "WRONG_DOCUMENT",
  "WRONG_SIDE",
  "EXPIRED",
  "DETAILS_MISMATCH",
  "MISSING_INFORMATION",
  "SUSPECTED_ALTERATION",
  "DUPLICATE",
  "OTHER",
]

export function DocumentReviewClient({
  document,
  history,
  replacements,
  locale,
  returnTo,
}: {
  document: {
    documentId: string
    documentTypeId: string
    side: string
    slotNumber: number
    attemptNumber: number
    reviewRevision: number
    validation: {
      detectedMimeType: string
      detectedFileType: string
      sizeBytes: number
    }
  }
  history: Array<{
    id: string
    decision: string
    reasonCode?: string
    safeReviewerNote?: string
    reviewedAt: string
    decisionVersion: number
  }>
  replacements: Array<{
    id: string
    attemptNumber: number
    status: string
    replacesDocumentId?: string
  }>
  locale: string
  returnTo: string
}) {
  const router = useRouter()
  const tr = (english: string, german: string) => (locale === "de" ? german : english)
  const [reason, setReason] = useState("UNREADABLE")
  const [note, setNote] = useState("")
  const [message, setMessage] = useState<string>()
  const [isPending, startTransition] = useTransition()

  const decide = (decision: "APPROVED" | "REJECTED" | "REPLACEMENT_REQUIRED") =>
    startTransition(async () => {
      const response = await fetch(`/api/private-documents/${document.documentId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          expectedReviewRevision: document.reviewRevision,
          reasonCode: decision === "APPROVED" ? undefined : reason,
          safeReviewerNote: note || undefined,
        }),
      })
      const result = (await response.json()) as {
        code?: string
        bookingConfirmed?: boolean
        confirmationEmailSent?: boolean
      }
      if (!response.ok) {
        if (response.status === 401) window.location.reload()
        setMessage(
          result.code === "DOCUMENT_REVIEW_CONFLICT"
            ? tr("Another reviewer changed this document. Reload before deciding.", "Ein anderer Prüfer hat dieses Dokument geändert. Laden Sie die Seite vor der Entscheidung neu.")
            : (result.code ?? tr("Decision failed.", "Die Entscheidung konnte nicht gespeichert werden.")),
        )
        return
      }
      const confirmationQuery = result.bookingConfirmed
        ? `?confirmationEmail=${result.confirmationEmailSent === false ? "failed" : "sent"}`
        : ""
      router.push(`${returnTo}${confirmationQuery}`)
      router.refresh()
    })

  const sensitiveOperation = (kind: "hold" | "delete") =>
    startTransition(async () => {
      const reason = window.prompt(kind === "hold" ? tr("Legal-hold reason", "Grund für die rechtliche Aufbewahrung") : tr("Deletion request reason", "Grund für die Löschanfrage"))
      if (!reason) return
      const response = await fetch(
        `/api/private-documents/${document.documentId}/${kind === "hold" ? "legal-hold" : "deletion"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(kind === "hold" ? { reason } : { reason, idempotencyKey: crypto.randomUUID() }),
        },
      )
      const result = (await response.json()) as { code?: string }
      if (response.status === 401) window.location.reload()
      setMessage(
        response.ok
          ? kind === "hold"
            ? tr("Legal hold applied.", "Rechtliche Aufbewahrung aktiviert.")
            : tr("Deletion request scheduled.", "Löschanfrage wurde eingeplant.")
          : (result.code ?? tr("Sensitive operation failed.", "Der sensible Vorgang ist fehlgeschlagen.")),
      )
    })

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="overflow-hidden rounded-xl border bg-neutral-950">
        {document.validation.detectedMimeType === "application/pdf" ? (
          <iframe
            className="h-[70vh] w-full"
            src={`/api/private-documents/${document.documentId}/view`}
            title={tr("Protected document preview", "Geschützte Dokumentvorschau")}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- protected authenticated stream cannot use the image optimizer.
          <img
            className="max-h-[70vh] w-full object-contain"
            src={`/api/private-documents/${document.documentId}/view`}
            alt={tr("Protected document preview", "Geschützte Dokumentvorschau")}
          />
        )}
      </section>
      <aside className="space-y-5">
        <details className="rounded-xl border bg-background p-4 text-sm">
          <summary className="cursor-pointer font-semibold">{tr("File details", "Dateidetails")}</summary>
          <dl className="mt-3 space-y-2">
            <div>
              <dt className="text-muted-foreground">{tr("Type", "Typ")}</dt>
              <dd>{document.validation.detectedFileType}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{tr("Size", "Größe")}</dt>
              <dd>{Math.ceil(document.validation.sizeBytes / 1024)} KiB</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{tr("Slot", "Position")}</dt>
              <dd>
                {document.side.toLowerCase()} · {document.slotNumber} · {tr("attempt", "Versuch")} {document.attemptNumber}
              </dd>
            </div>
          </dl>
        </details>
        <section className="space-y-3 rounded-xl border bg-background p-4">
          <label className="block text-sm font-medium">
            {tr("Reason", "Grund")}
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-3"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              {REASONS.map((value) => (
                <option key={value} value={value}>
                  {reviewReason(value, locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            {tr("Note for your team (optional)", "Notiz für Ihr Team (optional)")}
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border bg-background p-3"
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {message ? <p className="text-sm text-red-700">{message}</p> : null}
          <div className="grid gap-2">
            <Button disabled={isPending} onClick={() => decide("APPROVED")}>
              {tr("Approve document", "Dokument freigeben")}
            </Button>
            <Button variant="destructive" disabled={isPending} onClick={() => decide("REJECTED")}>
              {tr("Reject document", "Dokument ablehnen")}
            </Button>
            <Button variant="outline" disabled={isPending} onClick={() => decide("REPLACEMENT_REQUIRED")}>
              {tr("Request replacement", "Ersatz anfordern")}
            </Button>
          </div>
        </section>
        <section className="rounded-xl border bg-background p-4">
          <h2 className="font-semibold">{tr("Review history", "Prüfverlauf")}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {history.map((item) => (
              <li key={item.id} className="border-t pt-2">
                {reviewDecision(item.decision, locale)} · {item.reasonCode ? reviewReason(item.reasonCode, locale) : tr("no reason", "kein Grund")}
                <span className="block text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(item.reviewedAt))}
                </span>
              </li>
            ))}
            {!history.length ? <li className="text-muted-foreground">{tr("No prior decisions.", "Keine früheren Entscheidungen.")}</li> : null}
          </ul>
        </section>
        <details className="rounded-xl border bg-background p-4">
          <summary className="cursor-pointer font-semibold">{tr("Previous upload attempts", "Frühere Upload-Versuche")}</summary>
          <ul className="mt-3 space-y-1 text-sm">
            {replacements.map((item) => (
              <li key={item.id}>
                {tr("Attempt", "Versuch")} {item.attemptNumber} · {item.status.toLowerCase()}
              </li>
            ))}
          </ul>
        </details>
        <details className="space-y-2 rounded-xl border bg-background p-4">
          <summary className="cursor-pointer font-semibold">{tr("Advanced document actions", "Erweiterte Dokumentaktionen")}</summary>
          <a
            className="block rounded-md border px-3 py-2 text-center text-sm font-medium"
            href={`/api/private-documents/${document.documentId}/download`}
          >
            {tr("Download approved document", "Freigegebenes Dokument herunterladen")}
          </a>
          <Button className="w-full" variant="outline" disabled={isPending} onClick={() => sensitiveOperation("hold")}>
            {tr("Apply legal hold", "Rechtliche Aufbewahrung aktivieren")}
          </Button>
          <Button
            className="w-full"
            variant="destructive"
            disabled={isPending}
            onClick={() => sensitiveOperation("delete")}
          >
            {tr("Request deletion", "Löschung anfordern")}
          </Button>
        </details>
      </aside>
    </div>
  )
}

function reviewDecision(value: string, locale: string) {
  const labels: Record<string, [string, string]> = {
    APPROVED: ["Approved", "Freigegeben"],
    REJECTED: ["Rejected", "Abgelehnt"],
    REPLACEMENT_REQUIRED: ["Replacement requested", "Ersatz angefordert"],
  }
  return labels[value]?.[locale === "de" ? 1 : 0] ?? value
}

function reviewReason(value: string, locale: string) {
  const english = value.replaceAll("_", " ").toLowerCase()
  if (locale !== "de") return english
  const labels: Record<string, string> = {
    UNREADABLE: "Unleserlich",
    CROPPED: "Beschnitten",
    WRONG_DOCUMENT: "Falsches Dokument",
    WRONG_SIDE: "Falsche Seite",
    EXPIRED: "Abgelaufen",
    DETAILS_MISMATCH: "Angaben stimmen nicht überein",
    MISSING_INFORMATION: "Fehlende Informationen",
    SUSPECTED_ALTERATION: "Verdacht auf Veränderung",
    DUPLICATE: "Duplikat",
    OTHER: "Sonstiges",
  }
  return labels[value] ?? value
}
