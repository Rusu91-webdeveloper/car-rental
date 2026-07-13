"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import {
  cancelSavedBookingApplication,
  confirmRenewedApplicationTerms,
  finalizeSavedBookingApplication,
  submitBookingApplicationForReview,
} from "@/app/actions/booking-applications"
import type { ApplicationReadiness, BookingApplicationView } from "@/lib/booking-applications/domain"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { formatCents } from "@/lib/money"

const TERMINAL = new Set(["FINALIZED", "EXPIRED", "CANCELLED", "REJECTED"])

function sides(value: "SINGLE_FILE" | "FRONT_AND_BACK") {
  return value === "FRONT_AND_BACK" ? (["FRONT", "BACK"] as const) : (["SINGLE"] as const)
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function uploadWithProgress(input: {
  url: string
  file: File
  method: string
  headers?: Record<string, string>
  onProgress: (value: number) => void
}) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open(input.method, input.url)
    for (const [name, value] of Object.entries(input.headers ?? {})) request.setRequestHeader(name, value)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) input.onProgress(Math.round((event.loaded / event.total) * 100))
    }
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error("The file could not be transferred."))
    request.onerror = () => reject(new Error("The file transfer was interrupted."))
    request.send(input.file)
  })
}

export function BookingApplicationClient({
  locale,
  initialApplication,
  initialReadiness,
}: {
  locale: string
  initialApplication: BookingApplicationView
  initialReadiness: ApplicationReadiness
}) {
  const router = useRouter()
  const [application, setApplication] = useState(initialApplication)
  const [readiness, setReadiness] = useState(initialReadiness)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [message, setMessage] = useState<string>()
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [isPending, startTransition] = useTransition()

  const reload = () => {
    router.refresh()
    window.setTimeout(() => window.location.reload(), 100)
  }

  const upload = async (
    file: File,
    requirement: BookingApplicationView["requirements"][number],
    side: "SINGLE" | "FRONT" | "BACK",
    slotNumber: number,
    replacesDocumentId?: string,
  ) => {
    const key = `${requirement.documentTypeId}:${slotNumber}:${side}`
    setMessage(undefined)
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setMessage("Use a PDF, JPEG, or PNG file.")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage("The maximum file size is 10 MiB.")
      return
    }
    try {
      setProgress((current) => ({ ...current, [key]: 1 }))
      const checksum = await sha256(file)
      const response = await fetch(`/api/booking-applications/${application.id}/upload-intents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentTypeId: requirement.documentTypeId,
          side,
          slotNumber,
          originalFileName: file.name,
          declaredMimeType: file.type,
          expectedSizeBytes: file.size,
          expectedChecksumSha256: checksum,
          idempotencyKey: crypto.randomUUID(),
          replacesDocumentId,
        }),
      })
      const created = (await response.json()) as {
        intent?: { id: string }
        uploadTarget?: {
          delivery:
            | { kind: "LOCAL_STAGED" }
            | { kind: "DIRECT_PUT"; accessValue: string; method: "PUT"; requiredHeaders: Record<string, string> }
        }
        code?: string
      }
      if (!response.ok || !created.intent || !created.uploadTarget)
        throw new Error(
          created.code === "DOCUMENT_SESSION_EXPIRED"
            ? "This upload session expired. Restart the application to continue."
            : "An upload intent could not be created.",
        )
      const delivery = created.uploadTarget.delivery
      await uploadWithProgress({
        url:
          delivery.kind === "DIRECT_PUT"
            ? delivery.accessValue
            : `/api/booking-applications/${application.id}/upload-intents/${created.intent.id}/content`,
        method: "PUT",
        file,
        headers: delivery.kind === "DIRECT_PUT" ? delivery.requiredHeaders : { "Content-Type": file.type },
        onProgress: (value) => setProgress((current) => ({ ...current, [key]: value })),
      })
      const completed = await fetch(
        `/api/booking-applications/${application.id}/upload-intents/${created.intent.id}/complete`,
        { method: "POST" },
      )
      const result = (await completed.json()) as { code?: string }
      if (!completed.ok) throw new Error(result.code ?? "Server verification failed.")
      setMessage("File verified and queued for manual review.")
      reload()
    } catch (error) {
      setProgress((current) => ({ ...current, [key]: 0 }))
      setMessage(error instanceof Error ? error.message : "Upload failed.")
    }
  }

  const mutate = (operation: () => Promise<unknown>) => {
    setMessage(undefined)
    startTransition(async () => {
      const result = (await operation()) as {
        error?: string
        application?: BookingApplicationView
        readiness?: ApplicationReadiness
        bookingId?: string
      }
      if (result.error) setMessage(result.error)
      else if (result.bookingId) router.push(`/bookings?booking_id=${result.bookingId}`)
      else {
        if (result.application) setApplication(result.application)
        if (result.readiness) setReadiness(result.readiness)
        reload()
      }
    })
  }

  if (application.status === "FINALIZED")
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Booking finalized</h1>
        <p className="mt-2 text-muted-foreground">Your application evidence has been preserved with the booking.</p>
        <Button className="mt-6" onClick={() => router.push(`/bookings?booking_id=${application.bookingId}`)}>
          View booking
        </Button>
      </main>
    )

  if (TERMINAL.has(application.status))
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Application {application.status.toLowerCase()}</h1>
        <p className="mt-2 text-muted-foreground">{application.terminalReason ?? "This application can no longer be changed."}</p>
      </main>
    )

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 pb-24 sm:p-6">
      <header>
        <p className="text-sm font-medium text-primary">Saved application</p>
        <h1 className="text-2xl font-semibold">Identity and licence documents</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Progress is saved on the server. Application expires {application.expiresAt.toLocaleString(locale)}.
        </p>
      </header>

      <section className="rounded-xl border bg-background p-4">
        <h2 className="font-semibold">Rental evidence</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Pick-up</dt><dd>{application.pickupAt.toLocaleString(locale)}</dd></div>
          <div><dt className="text-muted-foreground">Return</dt><dd>{application.returnAt.toLocaleString(locale)}</dd></div>
          <div><dt className="text-muted-foreground">Shared location</dt><dd>{application.pickupLocation}</dd></div>
          {application.quote ? <div><dt className="text-muted-foreground">Confirmed quote</dt><dd>{formatCents(application.quote.grandTotal, application.quote.currency)}</dd></div> : null}
        </dl>
      </section>

      {application.requirements.filter((value) => value.mode !== "DISABLED").map((requirement) => (
        <section key={requirement.documentTypeId} className="rounded-xl border bg-background p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{requirement.name}</h2>
              <p className="text-sm text-muted-foreground">{requirement.instructions}</p>
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-xs">{requirement.mode.toLowerCase()}</span>
          </div>
          <div className="mt-4 space-y-3">
            {Array.from({ length: requirement.fileCount }, (_, index) => index + 1).flatMap((slot) =>
              sides(requirement.sides).map((side) => {
                const current = application.documents.find((document) => document.documentTypeId === requirement.documentTypeId && document.slotNumber === slot && document.side === side)
                const key = `${requirement.documentTypeId}:${slot}:${side}`
                const mustReplace = current && ["REJECTED", "REPLACEMENT_REQUIRED"].includes(current.manualReviewStatus)
                return (
                  <div key={key} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{side === "SINGLE" ? `File ${slot}` : `${side.toLowerCase()} · file ${slot}`}</p>
                        <p className="text-xs text-muted-foreground">
                          {current ? current.manualReviewStatus.replaceAll("_", " ").toLowerCase() : "Not uploaded"}
                        </p>
                      </div>
                      {current?.manualReviewStatus === "APPROVED" ? (
                        <span className="text-sm font-medium text-emerald-700">Approved</span>
                      ) : (
                        <label className="cursor-pointer rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                          {mustReplace ? "Upload replacement" : current ? "Re-upload" : "Choose file"}
                          <input
                            className="sr-only"
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              if (file) void upload(file, requirement, side, slot, mustReplace ? current.id : undefined)
                            }}
                          />
                        </label>
                      )}
                    </div>
                    {(progress[key] ?? 0) > 0 && (progress[key] ?? 0) < 100 ? <Progress className="mt-3" value={progress[key]} /> : null}
                  </div>
                )
              }),
            )}
          </div>
        </section>
      ))}

      {!readiness.ready ? (
        <section className="rounded-xl border bg-muted/30 p-4">
          <h2 className="font-semibold">Before finalization</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {readiness.blockers.map((blocker, index) => <li key={`${blocker.code}:${index}`}>{blocker.message}</li>)}
          </ul>
        </section>
      ) : null}

      {application.status === "CUSTOMER_ACTION_REQUIRED" ? (
        <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <h2 className="font-semibold">Review renewed terms</h2>
          <p className="text-sm">The price or legal evidence changed. Confirm the server-authoritative replacement before finalization.</p>
          <label className="flex gap-2 text-sm"><Checkbox checked={terms} onCheckedChange={(value) => setTerms(value === true)} />I accept the current rental terms.</label>
          <label className="flex gap-2 text-sm"><Checkbox checked={privacy} onCheckedChange={(value) => setPrivacy(value === true)} />I acknowledge the current privacy notice.</label>
          <Button disabled={!terms || !privacy || isPending} onClick={() => mutate(() => confirmRenewedApplicationTerms({ applicationId: application.id, expectedRevision: application.revision, rentalTerms: terms, privacyNotice: privacy }))}>Confirm renewed evidence</Button>
        </section>
      ) : null}

      {message ? <p className="rounded-lg border bg-background p-3 text-sm" role="status">{message}</p> : null}

      <div className="flex flex-wrap gap-3">
        {application.status === "AWAITING_DOCUMENT_UPLOAD" ? (
          <Button disabled={isPending} onClick={() => mutate(() => submitBookingApplicationForReview({ applicationId: application.id, expectedRevision: application.revision }))}>Submit uploaded files for review</Button>
        ) : null}
        {application.status === "READY_TO_FINALIZE" && readiness.ready ? (
          <Button disabled={isPending} onClick={() => mutate(() => finalizeSavedBookingApplication({ applicationId: application.id, expectedRevision: application.revision }))}>Finalize booking</Button>
        ) : null}
        <Button variant="outline" disabled={isPending} onClick={() => mutate(() => cancelSavedBookingApplication({ applicationId: application.id, expectedRevision: application.revision }))}>Cancel application</Button>
      </div>
    </main>
  )
}
