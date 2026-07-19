"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface QueueItem {
  documentId: string
  bookingId?: string
  documentTypeId: string
  side: "SINGLE" | "FRONT" | "BACK"
  slotNumber: number
  attemptNumber: number
  status: string
  uploadedAt: Date | string
  pendingAgeMs: number
}

export function DocumentReviewQueue({
  initialItems,
  initialCursor,
}: {
  initialItems: QueueItem[]
  initialCursor?: string
}) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [cursor, setCursor] = useState(initialCursor)
  const [status, setStatus] = useState("PENDING_REVIEW")
  const [minimumAge, setMinimumAge] = useState("0")
  const [message, setMessage] = useState<string>()
  const [isPending, startTransition] = useTransition()

  const load = (next = false) =>
    startTransition(async () => {
      const query = new URLSearchParams({
        status,
        limit: "25",
        minimumPendingAgeMinutes: minimumAge || "0",
      })
      if (next && cursor) query.set("cursor", cursor)
      const response = await fetch(`/api/private-documents/review-queue?${query}`)
      const result = (await response.json()) as {
        items?: QueueItem[]
        nextCursor?: string
        code?: string
      }
      if (!response.ok || !result.items) {
        setMessage(result.code ?? "Queue could not be loaded.")
        return
      }
      setItems(result.items)
      setCursor(result.nextCursor)
      setMessage(undefined)
    })

  return (
    <section className="space-y-4">
      <details className="rounded-xl border bg-background p-4">
        <summary className="cursor-pointer font-medium">Filter the list</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            Status
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-3"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="PENDING_REVIEW">Pending review</option>
              <option value="REJECTED">Rejected</option>
              <option value="REPLACEMENT_REQUIRED">Replacement required</option>
            </select>
          </label>
          <label className="text-sm">
            Waiting at least (minutes)
            <Input
              className="mt-1"
              type="number"
              min="0"
              value={minimumAge}
              onChange={(event) => setMinimumAge(event.target.value)}
            />
          </label>
          <Button className="self-end" disabled={isPending} onClick={() => load(false)}>
            Apply filters
          </Button>
        </div>
      </details>
      {message ? <p className="rounded-lg border p-3 text-sm">{message}</p> : null}
      <div className="overflow-hidden rounded-xl border bg-background">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3">Document</th>
              <th className="p-3">Waiting</th>
              <th className="p-3">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const hours = Math.floor(item.pendingAgeMs / 3_600_000)
              const stale = item.pendingAgeMs >= 24 * 3_600_000
              return (
                <tr className="border-t" key={item.documentId}>
                  <td className="p-3">{friendlyDocumentType(item.documentTypeId)}</td>
                  <td className={`p-3 ${stale ? "font-semibold text-amber-700" : ""}`}>
                    {hours}h{stale ? " · overdue" : ""}
                  </td>
                  <td className="p-3">{item.status.replaceAll("_", " ").toLowerCase()}</td>
                  <td className="p-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/admin/documents/${item.documentId}`)}
                    >
                      Review
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!items.length ? (
          <p className="p-6 text-center text-muted-foreground">No documents match these filters.</p>
        ) : null}
      </div>
      {cursor ? (
        <Button variant="outline" disabled={isPending} onClick={() => load(true)}>
          Next page
        </Button>
      ) : null}
    </section>
  )
}

function friendlyDocumentType(value: string) {
  const labels: Record<string, string> = {
    IDENTITY_CARD: "Identity card",
    PASSPORT: "Passport",
    DRIVING_LICENCE: "Driving licence",
  }
  return labels[value] ?? "Customer document"
}
