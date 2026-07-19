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
}) {
  const router = useRouter()
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
      const result = (await response.json()) as { code?: string }
      if (!response.ok) {
        if (response.status === 401) window.location.reload()
        setMessage(
          result.code === "DOCUMENT_REVIEW_CONFLICT"
            ? "Another reviewer changed this document. Reload before deciding."
            : (result.code ?? "Decision failed."),
        )
        return
      }
      router.push("/admin/documents")
      router.refresh()
    })

  const sensitiveOperation = (kind: "hold" | "delete") =>
    startTransition(async () => {
      const reason = window.prompt(kind === "hold" ? "Legal-hold reason" : "Deletion request reason")
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
            ? "Legal hold applied."
            : "Deletion request scheduled."
          : (result.code ?? "Sensitive operation failed."),
      )
    })

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="overflow-hidden rounded-xl border bg-neutral-950">
        {document.validation.detectedMimeType === "application/pdf" ? (
          <iframe
            className="h-[70vh] w-full"
            src={`/api/private-documents/${document.documentId}/view`}
            title="Protected document preview"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- protected authenticated stream cannot use the image optimizer.
          <img
            className="max-h-[70vh] w-full object-contain"
            src={`/api/private-documents/${document.documentId}/view`}
            alt="Protected document preview"
          />
        )}
      </section>
      <aside className="space-y-5">
        <details className="rounded-xl border bg-background p-4 text-sm">
          <summary className="cursor-pointer font-semibold">File details</summary>
          <dl className="mt-3 space-y-2">
            <div>
              <dt className="text-muted-foreground">Type</dt>
              <dd>{document.validation.detectedFileType}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Size</dt>
              <dd>{Math.ceil(document.validation.sizeBytes / 1024)} KiB</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Slot</dt>
              <dd>
                {document.side.toLowerCase()} · {document.slotNumber} · attempt {document.attemptNumber}
              </dd>
            </div>
          </dl>
        </details>
        <section className="space-y-3 rounded-xl border bg-background p-4">
          <label className="block text-sm font-medium">
            Reason
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-3"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              {REASONS.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ").toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Note for your team (optional)
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
              Approve
            </Button>
            <Button variant="destructive" disabled={isPending} onClick={() => decide("REJECTED")}>
              Reject
            </Button>
            <Button variant="outline" disabled={isPending} onClick={() => decide("REPLACEMENT_REQUIRED")}>
              Request replacement
            </Button>
          </div>
        </section>
        <section className="rounded-xl border bg-background p-4">
          <h2 className="font-semibold">Review history</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {history.map((item) => (
              <li key={item.id} className="border-t pt-2">
                {item.decision.toLowerCase()} · {item.reasonCode?.toLowerCase() ?? "no reason"}
                <span className="block text-xs text-muted-foreground">
                  {new Date(item.reviewedAt).toLocaleString()}
                </span>
              </li>
            ))}
            {!history.length ? <li className="text-muted-foreground">No prior decisions.</li> : null}
          </ul>
        </section>
        <details className="rounded-xl border bg-background p-4">
          <summary className="cursor-pointer font-semibold">Previous upload attempts</summary>
          <ul className="mt-3 space-y-1 text-sm">
            {replacements.map((item) => (
              <li key={item.id}>
                Attempt {item.attemptNumber} · {item.status.toLowerCase()}
              </li>
            ))}
          </ul>
        </details>
        <details className="space-y-2 rounded-xl border bg-background p-4">
          <summary className="cursor-pointer font-semibold">Advanced document actions</summary>
          <a
            className="block rounded-md border px-3 py-2 text-center text-sm font-medium"
            href={`/api/private-documents/${document.documentId}/download`}
          >
            Download approved document
          </a>
          <Button className="w-full" variant="outline" disabled={isPending} onClick={() => sensitiveOperation("hold")}>
            Apply legal hold
          </Button>
          <Button
            className="w-full"
            variant="destructive"
            disabled={isPending}
            onClick={() => sensitiveOperation("delete")}
          >
            Request deletion
          </Button>
        </details>
      </aside>
    </div>
  )
}
