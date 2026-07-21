"use client"

import Image from "next/image"
import { useLocale } from "next-intl"
import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { formatCents } from "@/lib/money"
import { ArrowRight, CalendarDays, Clock3, FileCheck2, Files, MapPin, UserRound } from "lucide-react"

interface ApplicationSummary {
  id: string
  status: string
  customerName: string
  customerEmail: string
  carName: string
  carNameDe: string | null
  carImage: string
  pickupAt: Date | string
  returnAt: Date | string
  location: string
  grandTotal: number | null
  currency: string
  totalDocuments: number
  approvedDocuments: number
  pendingDocuments: number
  actionRequiredDocuments: number
}

interface QueueItem {
  documentId: string
  bookingId?: string
  documentTypeId: string
  documentTypeKey: string
  documentTypeName: string
  side: "SINGLE" | "FRONT" | "BACK"
  slotNumber: number
  attemptNumber: number
  status: string
  uploadedAt: Date | string
  pendingAgeMs: number
  application?: ApplicationSummary
}

interface ReviewCase {
  key: string
  application?: ApplicationSummary
  items: QueueItem[]
}

function groupIntoCases(items: QueueItem[]) {
  const groups = new Map<string, ReviewCase>()
  for (const item of items) {
    const key = item.application?.id ?? `document-${item.documentId}`
    const current = groups.get(key)
    if (current) current.items.push(item)
    else groups.set(key, { key, application: item.application, items: [item] })
  }
  return Array.from(groups.values())
}

export function DocumentReviewQueue({
  initialItems,
  initialCursor,
}: {
  initialItems: QueueItem[]
  initialCursor?: string
}) {
  const router = useRouter()
  const locale = useLocale()
  const tr = (english: string, german: string) => (locale === "de" ? german : english)
  const [items, setItems] = useState(initialItems)
  const [cursor, setCursor] = useState(initialCursor)
  const [status, setStatus] = useState("PENDING_REVIEW")
  const [minimumAge, setMinimumAge] = useState("0")
  const [message, setMessage] = useState<string>()
  const [isPending, startTransition] = useTransition()
  const cases = groupIntoCases(items)
  const oldestAgeMs = items.reduce((oldest, item) => Math.max(oldest, item.pendingAgeMs), 0)

  const formatDateTime = (value: Date | string) =>
    new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Berlin",
    }).format(new Date(value))

  const load = (next = false) =>
    startTransition(async () => {
      const query = new URLSearchParams({
        status,
        limit: "100",
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
        setMessage(result.code ?? tr("Queue could not be loaded.", "Die Prüfliste konnte nicht geladen werden."))
        return
      }
      setItems(result.items)
      setCursor(result.nextCursor)
      setMessage(undefined)
    })

  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Files className="h-5 w-5" /></span>
            <div><p className="text-2xl font-bold">{cases.length}</p><p className="text-xs text-muted-foreground">{tr("Applications in this queue", "Anträge in dieser Prüfliste")}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><FileCheck2 className="h-5 w-5" /></span>
            <div><p className="text-2xl font-bold">{items.length}</p><p className="text-xs text-muted-foreground">{tr("Documents needing a decision", "Dokumente mit Entscheidungsbedarf")}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Clock3 className="h-5 w-5" /></span>
            <div><p className="text-2xl font-bold">{Math.floor(oldestAgeMs / 3_600_000)}h</p><p className="text-xs text-muted-foreground">{tr("Oldest waiting document", "Ältestes wartendes Dokument")}</p></div>
          </CardContent>
        </Card>
      </div>

      <details className="rounded-xl border bg-background p-4">
        <summary className="cursor-pointer font-medium">{tr("Filter applications", "Anträge filtern")}</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            {tr("Document status", "Dokumentstatus")}
            <select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="PENDING_REVIEW">{tr("Pending review", "Prüfung ausstehend")}</option>
              <option value="REJECTED">{tr("Rejected", "Abgelehnt")}</option>
              <option value="REPLACEMENT_REQUIRED">{tr("Replacement required", "Ersatz erforderlich")}</option>
            </select>
          </label>
          <label className="text-sm">
            {tr("Waiting at least (minutes)", "Mindestens wartend (Minuten)")}
            <Input className="mt-1" type="number" min="0" value={minimumAge} onChange={(event) => setMinimumAge(event.target.value)} />
          </label>
          <Button className="self-end" disabled={isPending} onClick={() => load(false)}>
            {isPending ? tr("Loading…", "Wird geladen…") : tr("Apply filters", "Filter anwenden")}
          </Button>
        </div>
      </details>

      {message ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{message}</p> : null}

      <div className="space-y-4">
        {cases.map((reviewCase) => {
          const application = reviewCase.application
          const oldestItem = reviewCase.items.reduce((oldest, item) => Math.max(oldest, item.pendingAgeMs), 0)
          const progress = application?.totalDocuments
            ? Math.round((application.approvedDocuments / application.totalDocuments) * 100)
            : 0
          const carName = application
            ? locale === "de" ? application.carNameDe || application.carName : application.carName
            : tr("Booking application", "Buchungsantrag")

          return (
            <Card key={reviewCase.key} className="overflow-hidden transition-shadow hover:shadow-md">
              <CardHeader className="border-b bg-muted/20 p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  {application ? (
                    <Image src={application.carImage || "/placeholder.svg"} alt={carName} width={112} height={80} className="h-24 w-full rounded-xl object-cover sm:h-20 sm:w-28" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{carName}</h2>
                      <Badge variant="secondary">{application ? applicationStatusLabel(application.status, locale) : tr("Legacy document", "Altdokument")}</Badge>
                      {oldestItem >= 24 * 3_600_000 ? <Badge variant="destructive">{tr("Overdue", "Überfällig")}</Badge> : null}
                    </div>
                    {application ? (
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5"><UserRound className="h-4 w-4" />{application.customerName} · {application.customerEmail}</span>
                        <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{formatDateTime(application.pickupAt)} – {formatDateTime(application.returnAt)}</span>
                        <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{application.location}</span>
                      </div>
                    ) : null}
                  </div>
                  {application?.grandTotal !== null && application?.grandTotal !== undefined ? (
                    <div className="lg:text-right"><p className="text-xs text-muted-foreground">{tr("Confirmed quote", "Bestätigtes Angebot")}</p><p className="text-lg font-bold">{formatCents(application.grandTotal, application.currency)}</p></div>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                {application ? (
                  <div className="mb-5 grid gap-4 rounded-xl border bg-background p-4 md:grid-cols-[1fr_auto] md:items-center">
                    <div>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium">{tr("Document review progress", "Fortschritt der Dokumentenprüfung")}</span>
                        <span>{application.approvedDocuments}/{application.totalDocuments} {tr("approved", "freigegeben")}</span>
                      </div>
                      <Progress className="mt-2" value={progress} />
                      <p className="mt-2 text-xs text-muted-foreground">
                        {application.pendingDocuments} {tr("pending", "ausstehend")}
                        {application.actionRequiredDocuments > 0 ? ` · ${application.actionRequiredDocuments} ${tr("need customer action", "benötigen eine Kundenaktion")}` : ""}
                      </p>
                    </div>
                    <Button onClick={() => router.push(`/admin/documents/applications/${application.id}`)}>
                      {tr("Review application", "Antrag prüfen")} <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {reviewCase.items.map((item) => (
                    <button key={item.documentId} type="button" onClick={() => router.push(`/admin/documents/${item.documentId}`)} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50">
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{documentTypeLabel(item.documentTypeKey, item.documentTypeName, locale)}</span><span className="block text-xs text-muted-foreground">{friendlySide(item.side, locale)} · {tr("file", "Datei")} {item.slotNumber}</span></span>
                      <Badge variant="outline">{Math.floor(item.pendingAgeMs / 3_600_000)}h</Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        })}

        {!cases.length ? (
          <Card><CardContent className="p-10 text-center"><FileCheck2 className="mx-auto h-10 w-10 text-emerald-600" /><h2 className="mt-3 font-semibold">{tr("Nothing needs review", "Keine Prüfung erforderlich")}</h2><p className="mt-1 text-sm text-muted-foreground">{tr("No applications match these filters.", "Keine Anträge entsprechen diesen Filtern.")}</p></CardContent></Card>
        ) : null}
      </div>

      {cursor ? <Button variant="outline" disabled={isPending} onClick={() => load(true)}>{tr("Next page", "Nächste Seite")}</Button> : null}
    </section>
  )
}

function friendlySide(side: QueueItem["side"], locale: string) {
  if (side === "FRONT") return locale === "de" ? "Vorderseite" : "Front"
  if (side === "BACK") return locale === "de" ? "Rückseite" : "Back"
  return locale === "de" ? "Einzeldokument" : "Single file"
}

function documentTypeLabel(typeKey: string, fallback: string, locale: string) {
  if (locale !== "de") return fallback
  const labels: Record<string, string> = {
    IDENTITY_CARD: "Personalausweis",
    PASSPORT: "Reisepass",
    DRIVING_LICENCE: "Führerschein",
  }
  return labels[typeKey] ?? fallback
}

function applicationStatusLabel(status: string, locale: string) {
  const labels: Record<string, [string, string]> = {
    DRAFT: ["Draft", "Entwurf"],
    AWAITING_DOCUMENT_UPLOAD: ["Awaiting documents", "Dokumente ausstehend"],
    AWAITING_DOCUMENT_REVIEW: ["Awaiting review", "Prüfung ausstehend"],
    CUSTOMER_ACTION_REQUIRED: ["Customer action required", "Kundenaktion erforderlich"],
    READY_TO_FINALIZE: ["Ready to finalize", "Bereit zum Abschluss"],
    FINALIZED: ["Finalized", "Abgeschlossen"],
    EXPIRED: ["Expired", "Abgelaufen"],
    CANCELLED: ["Cancelled", "Storniert"],
    REJECTED: ["Rejected", "Abgelehnt"],
  }
  return labels[status]?.[locale === "de" ? 1 : 0] ?? status
}
