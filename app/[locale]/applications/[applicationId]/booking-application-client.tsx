"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import {
  cancelSavedBookingApplication,
  confirmRenewedApplicationTerms,
  finalizeSavedBookingApplication,
  submitBookingApplicationForReview,
} from "@/app/actions/booking-applications"
import { replacementPredecessorId } from "@/lib/booking-applications/document-view"
import type { ApplicationReadiness, BookingApplicationView } from "@/lib/booking-applications/domain"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { formatCents } from "@/lib/money"
import { CheckCircle2, CircleX, LoaderCircle } from "lucide-react"
import { formatBookingDateTime } from "@/lib/booking-time-zone"
import { BANK_TRANSFER_MINIMUM_LEAD_HOURS } from "@/lib/constants"
import { hasBankTransferLeadTime } from "@/lib/booking-payment-timing"

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
  failedMessage: string
  interruptedMessage: string
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
        : reject(new Error(`${input.failedMessage} (${request.status}).`))
    request.onerror = () => reject(new Error(input.interruptedMessage))
    request.send(input.file)
  })
}

type UploadFeedback = {
  status: "uploading" | "success" | "error"
  message?: string
}

function customerUploadError(code: string | undefined, locale: string) {
  const copy = (english: string, german: string) => locale === "de" ? german : english
  if (code === "RATE_LIMITED") return copy("Too many upload attempts. Wait a moment, then try again.", "Zu viele Uploadversuche. Warten Sie einen Moment und versuchen Sie es erneut.")
  if (["DOCUMENT_UPLOAD_INCOMPLETE", "DOCUMENT_UPLOAD_NOT_FOUND"].includes(code ?? ""))
    return copy("The file transfer did not finish. Please try again.", "Die Dateiübertragung wurde nicht abgeschlossen. Bitte versuchen Sie es erneut.")
  if (code === "DOCUMENT_UPLOAD_METADATA_MISMATCH")
    return copy("The transferred file could not be verified. Choose the file again and retry.", "Die übertragene Datei konnte nicht geprüft werden. Wählen Sie die Datei erneut aus und versuchen Sie es noch einmal.")
  if (code?.includes("PROVIDER")) return copy("The upload service is temporarily unavailable. Please try again.", "Der Upload-Dienst ist vorübergehend nicht verfügbar. Bitte versuchen Sie es erneut.")
  return copy("The document failed to upload. Please try again.", "Das Dokument konnte nicht hochgeladen werden. Bitte versuchen Sie es erneut.")
}

function localizeReadinessBlocker(code: string, fallback: string) {
  const messages: Record<string, string> = {
    APPLICATION_NOT_FOUND: "Antrag nicht gefunden.",
    APPLICATION_EXPIRED: "Der Antrag ist abgelaufen.",
    CUSTOMER_DATA_INVALID: "Vervollständigen Sie gültige Kunden- und Fahrerdaten.",
    INSURANCE_SELECTION_MISSING: "Wählen Sie eine Versicherungsoption.",
    PAYMENT_SELECTION_MISSING: "Wählen Sie eine Zahlungsmethode.",
    QUOTE_EXPIRED: "Aktualisieren Sie den Mietpreis.",
    QUOTE_CONFIRMATION_REQUIRED: "Bestätigen Sie den aktuellen Mietpreis.",
    LEGAL_TERMS_REQUIRED: "Akzeptieren Sie die aktuellen Mietbedingungen.",
    LEGAL_PRIVACY_REQUIRED: "Bestätigen Sie den aktuellen Datenschutzhinweis.",
    DOCUMENT_APPROVAL_REQUIRED: "Ein Dokument wartet noch auf Freigabe.",
    IDENTITY_DOCUMENT_APPROVAL_REQUIRED: "Ein Personalausweis oder Reisepass muss freigegeben werden.",
  }
  return messages[code] ?? fallback
}

export function BookingApplicationClient({
  locale,
  initialApplication,
  initialReadiness,
  pageRenderedAt,
}: {
  locale: string
  initialApplication: BookingApplicationView
  initialReadiness: ApplicationReadiness
  pageRenderedAt: string
}) {
  const copy = (english: string, german: string) => locale === "de" ? german : english
  const router = useRouter()
  const [application, setApplication] = useState(initialApplication)
  const [readiness, setReadiness] = useState(initialReadiness)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [uploadFeedback, setUploadFeedback] = useState<Record<string, UploadFeedback>>({})
  const [message, setMessage] = useState<string>()
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [isPending, startTransition] = useTransition()
  const applicationRequiresAdvanceTransfer =
    application.paymentMethod === "TRANSFER" || (application.quote?.depositAmount ?? 0) > 0
  const advanceTransferCutoffPassed =
    applicationRequiresAdvanceTransfer &&
    !hasBankTransferLeadTime(new Date(application.pickupAt), new Date(pageRenderedAt))

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
      const errorMessage = copy("Use a PDF, JPEG, or PNG file.", "Verwenden Sie eine PDF-, JPEG- oder PNG-Datei.")
      setUploadFeedback((current) => ({ ...current, [key]: { status: "error", message: errorMessage } }))
      setMessage(errorMessage)
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      const errorMessage = copy("The maximum file size is 10 MiB.", "Die maximale Dateigröße beträgt 10 MiB.")
      setUploadFeedback((current) => ({ ...current, [key]: { status: "error", message: errorMessage } }))
      setMessage(errorMessage)
      return
    }
    try {
      setProgress((current) => ({ ...current, [key]: 1 }))
      setUploadFeedback((current) => ({ ...current, [key]: { status: "uploading" } }))
      const checksum = await sha256(file)
      const uploadIdempotencyKey = [
        "document-upload",
        application.id,
        requirement.documentTypeId,
        side,
        slotNumber,
        crypto.randomUUID().replaceAll("-", "").slice(0, 16),
        replacesDocumentId?.slice(-12) ?? "initial",
      ].join(":")
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
          idempotencyKey: uploadIdempotencyKey,
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
            ? copy("This upload session expired. Restart the application to continue.", "Diese Upload-Sitzung ist abgelaufen. Starten Sie den Antrag neu, um fortzufahren.")
            : copy("An upload intent could not be created.", "Der Upload konnte nicht vorbereitet werden."),
        )
      const delivery = created.uploadTarget.delivery
      let transferError: unknown
      try {
        await uploadWithProgress({
          url:
            delivery.kind === "DIRECT_PUT"
              ? delivery.accessValue
              : `/api/booking-applications/${application.id}/upload-intents/${created.intent.id}/content`,
          method: "PUT",
          file,
          headers: delivery.kind === "DIRECT_PUT" ? delivery.requiredHeaders : { "Content-Type": file.type },
          onProgress: (value) => setProgress((current) => ({ ...current, [key]: value })),
          failedMessage: copy("The file transfer failed", "Die Dateiübertragung ist fehlgeschlagen"),
          interruptedMessage: copy("The file transfer was interrupted.", "Die Dateiübertragung wurde unterbrochen."),
        })
      } catch (error) {
        // A browser can lose the storage response after the bytes arrived. The
        // completion check safely recovers that ambiguous success.
        transferError = error
      }
      const completed = await fetch(
        `/api/booking-applications/${application.id}/upload-intents/${created.intent.id}/complete`,
        { method: "POST" },
      )
      const result = (await completed.json()) as { code?: string }
      if (!completed.ok) {
        const errorMessage = customerUploadError(result.code, locale)
        throw new Error(transferError instanceof Error ? `${errorMessage} ${transferError.message}` : errorMessage)
      }
      setProgress((current) => ({ ...current, [key]: 100 }))
      setUploadFeedback((current) => ({ ...current, [key]: { status: "success" } }))
      setMessage(copy("File verified and queued for manual review.", "Die Datei wurde geprüft und zur manuellen Prüfung eingereiht."))
      reload()
    } catch (error) {
      setProgress((current) => ({ ...current, [key]: 0 }))
      const errorMessage = error instanceof Error ? error.message : copy("The document failed to upload. Please try again.", "Das Dokument konnte nicht hochgeladen werden. Bitte versuchen Sie es erneut.")
      setUploadFeedback((current) => ({ ...current, [key]: { status: "error", message: errorMessage } }))
      setMessage(errorMessage)
    }
  }

  const mutate = (operation: () => Promise<unknown>) => {
    setMessage(undefined)
    startTransition(async () => {
      const result = (await operation()) as {
        error?: string
        applicationId?: string
        application?: BookingApplicationView
        readiness?: ApplicationReadiness
        bookingId?: string
        submittedForReview?: boolean
      }
      if (result.error) {
        const localizedError = locale === "de" && result.error.includes("enough time to verify an advance bank transfer")
          ? "Es bleibt nicht mehr genügend Zeit, um eine Vorauszahlung per Banküberweisung vor der Abholung zu prüfen. Starten Sie eine neue Buchung mit einer verfügbaren Zahlungsart oder einer späteren Abholzeit."
          : result.error
        setMessage(localizedError)
      }
      else if (result.bookingId) router.push(`/bookings?booking_id=${result.bookingId}`)
      else if (result.submittedForReview && result.applicationId)
        router.push(`/bookings?application_id=${result.applicationId}`)
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
        <h1 className="text-2xl font-semibold">{copy("Booking finalized", "Buchung abgeschlossen")}</h1>
        <p className="mt-2 text-muted-foreground">{copy("Your application evidence has been preserved with the booking.", "Ihre Antragsnachweise wurden zusammen mit der Buchung gespeichert.")}</p>
        <Button className="mt-6" onClick={() => router.push(`/bookings?booking_id=${application.bookingId}`)}>
          {copy("View booking", "Buchung anzeigen")}
        </Button>
      </main>
    )

  if (TERMINAL.has(application.status))
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">{copy(`Application ${application.status.toLowerCase()}`, `Antrag ${application.status === "EXPIRED" ? "abgelaufen" : application.status === "CANCELLED" ? "storniert" : "abgelehnt"}`)}</h1>
        <p className="mt-2 text-muted-foreground">{application.terminalReason ?? copy("This application can no longer be changed.", "Dieser Antrag kann nicht mehr geändert werden.")}</p>
      </main>
    )

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 pb-24 sm:p-6">
      <header>
        <p className="text-sm font-medium text-primary">{copy("Saved application", "Gespeicherter Antrag")}</p>
        <h1 className="text-2xl font-semibold">{copy("Identity and licence documents", "Identitäts- und Führerscheindokumente")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {locale === "de" ? "Der Fortschritt wird auf dem Server gespeichert. Der Antrag läuft ab am " : "Progress is saved on the server. Application expires "}
          {formatBookingDateTime(application.expiresAt, locale, application.businessTimeZone)}.
        </p>
      </header>

      <section className="rounded-xl border bg-background p-4">
        <h2 className="font-semibold">{copy("Rental details", "Mietdaten")}</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">{locale === "de" ? "Abholung" : "Pick-up"}</dt><dd>{formatBookingDateTime(application.pickupAt, locale, application.businessTimeZone)}</dd></div>
          <div><dt className="text-muted-foreground">{locale === "de" ? "Rückgabe" : "Return"}</dt><dd>{formatBookingDateTime(application.returnAt, locale, application.businessTimeZone)}</dd></div>
          <div><dt className="text-muted-foreground">{copy("Pick-up and return location", "Abhol- und Rückgabeort")}</dt><dd>{application.pickupLocation}</dd></div>
          {application.quote ? <div><dt className="text-muted-foreground">{copy("Confirmed price", "Bestätigter Preis")}</dt><dd>{formatCents(application.quote.grandTotal, application.quote.currency)}</dd></div> : null}
        </dl>
      </section>

      {application.requirements.filter((value) => value.mode !== "DISABLED").map((requirement) => (
        <section key={requirement.documentTypeId} className="rounded-xl border bg-background p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{requirement.name}</h2>
              <p className="text-sm text-muted-foreground">{requirement.instructions}</p>
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-xs">{requirement.mode === "REQUIRED" ? copy("required", "erforderlich") : copy("optional", "optional")}</span>
          </div>
          <div className="mt-4 space-y-3">
            {Array.from({ length: requirement.fileCount }, (_, index) => index + 1).flatMap((slot) =>
              sides(requirement.sides).map((side) => {
                const current = application.documents.find((document) => document.documentTypeId === requirement.documentTypeId && document.slotNumber === slot && document.side === side)
                const key = `${requirement.documentTypeId}:${slot}:${side}`
                const mustReplace = current && ["REJECTED", "REPLACEMENT_REQUIRED"].includes(current.manualReviewStatus)
                const feedback = uploadFeedback[key]
                const uploadFailed = feedback?.status === "error" || current?.uploadStatus === "FAILED" || current?.uploadStatus === "REJECTED"
                const uploaded = feedback?.status === "success" || current?.manualReviewStatus === "PENDING_REVIEW"
                const approved = current?.manualReviewStatus === "APPROVED"
                return (
                  <div key={key} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{side === "SINGLE" ? copy(`File ${slot}`, `Datei ${slot}`) : `${side === "FRONT" ? copy("front", "Vorderseite") : copy("back", "Rückseite")} · ${copy(`file ${slot}`, `Datei ${slot}`)}`}</p>
                        {feedback?.status === "uploading" ? (
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-blue-700" role="status">
                            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                            {copy("Uploading…", "Wird hochgeladen…")} {progress[key] ?? 0}%
                          </p>
                        ) : uploadFailed ? (
                          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-red-700" role="alert">
                            <CircleX className="h-4 w-4" aria-hidden="true" /> {copy("Upload failed · please try again", "Upload fehlgeschlagen · bitte erneut versuchen")}
                          </p>
                        ) : mustReplace ? (
                          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-red-700" role="alert">
                            <CircleX className="h-4 w-4" aria-hidden="true" /> {copy("Rejected · upload a replacement", "Abgelehnt · Ersatzdatei hochladen")}
                          </p>
                        ) : approved ? (
                          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {copy("Approved", "Freigegeben")}
                          </p>
                        ) : uploaded ? (
                          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {copy("Uploaded · awaiting approval", "Hochgeladen · Freigabe ausstehend")}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">{copy("Not uploaded", "Nicht hochgeladen")}</p>
                        )}
                        {feedback?.status === "error" && feedback.message ? (
                          <p className="mt-1 max-w-md text-xs text-red-700">{feedback.message}</p>
                        ) : null}
                      </div>
                      {!approved && feedback?.status !== "uploading" && feedback?.status !== "success" && (!uploaded || uploadFailed || mustReplace) ? (
                        <label className="cursor-pointer rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                          {uploadFailed ? copy("Try again", "Erneut versuchen") : mustReplace ? copy("Upload replacement", "Ersatzdatei hochladen") : copy("Choose file", "Datei auswählen")}
                          <input
                            className="sr-only"
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              if (file)
                                void upload(
                                  file,
                                  requirement,
                                  side,
                                  slot,
                                  replacementPredecessorId(current),
                                )
                              event.target.value = ""
                            }}
                          />
                        </label>
                      ) : null}
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
          <h2 className="font-semibold">{copy("Before finalization", "Vor dem Abschluss")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {readiness.blockers.map((blocker, index) => <li key={`${blocker.code}:${index}`}>{locale === "de" ? localizeReadinessBlocker(blocker.code, blocker.message) : blocker.message}</li>)}
          </ul>
        </section>
      ) : null}

      {application.status === "AWAITING_DOCUMENT_REVIEW" ? (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
          <h2 className="font-semibold">
            {locale === "de" ? "Dokumente zur Prüfung eingereicht" : "Documents submitted for review"}
          </h2>
          <p className="mt-1 text-sm">
            {locale === "de"
              ? applicationRequiresAdvanceTransfer
                ? `Ihre Buchungsanfrage ist gespeichert. Schließen Sie die Dokumentenprüfung zügig ab: Die Überweisung kann nur bestätigt werden, solange die Abholung noch mindestens ${BANK_TRANSFER_MINIMUM_LEAD_HOURS} Stunden entfernt ist. Danach erhalten Sie eine genaue Zahlungsfrist von bis zu 24 Stunden.`
                : "Ihre Buchungsanfrage ist gespeichert. Nach der Dokumentenfreigabe wird die Buchung mit Zahlung bei Abholung bestätigt."
              : applicationRequiresAdvanceTransfer
                ? `Your request is saved. Complete document review promptly: bank transfer can be finalized only while pick-up is at least ${BANK_TRANSFER_MINIMUM_LEAD_HOURS} hours away. You will then receive an exact payment deadline of up to 24 hours.`
                : "Your request is saved. After document approval, the pay-at-pickup booking will be confirmed."}
          </p>
          <Button className="mt-3" variant="outline" onClick={() => router.push("/bookings")}>
            {locale === "de" ? "Unter „Meine Fahrten“ verfolgen" : "Track in My Trips"}
          </Button>
        </section>
      ) : null}

      {application.status === "READY_TO_FINALIZE" && readiness.ready ? (
        <section className={`rounded-xl border p-4 ${advanceTransferCutoffPassed ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
          <h2 className="font-semibold">{locale === "de" ? "Dokumente freigegeben" : "Documents approved"}</h2>
          <p className="mt-1 text-sm">
            {advanceTransferCutoffPassed
              ? copy(
                  "The advance-transfer cutoff has passed. Start a new booking with an available payment method or choose a later pick-up time.",
                  "Die Frist für Vorauszahlungen per Überweisung ist unterschritten. Starten Sie eine neue Buchung mit einer verfügbaren Zahlungsart oder wählen Sie eine spätere Abholzeit.",
                )
              : locale === "de"
              ? applicationRequiresAdvanceTransfer
                ? "Ihre Dokumente sind freigegeben. Nach dem Abschluss erhalten Sie die genaue Zahlungsfrist per E-Mail und unter „Meine Fahrten“."
                : "Ihre Dokumente sind freigegeben. Die Buchung mit Zahlung bei Abholung wird automatisch bestätigt."
              : applicationRequiresAdvanceTransfer
                ? "Your documents are approved. After finalization, the exact payment deadline will be sent by email and shown in My Trips."
                : "Your documents are approved. The pay-at-pickup booking will be confirmed automatically."}
          </p>
          {advanceTransferCutoffPassed ? (
            <Button className="mt-3" variant="outline" onClick={() => router.push("/cars")}>{copy("Start a new booking", "Neue Buchung starten")}</Button>
          ) : null}
        </section>
      ) : null}

      {application.status === "CUSTOMER_ACTION_REQUIRED" && application.actionRequiredReason !== "DOCUMENT_REPLACEMENT_REQUIRED" ? (
        <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <h2 className="font-semibold">{copy("Review renewed terms", "Aktualisierte Bedingungen prüfen")}</h2>
          <p className="text-sm">{copy("The price or legal evidence changed. Confirm the authoritative replacement before finalization.", "Der Preis oder die rechtlichen Nachweise haben sich geändert. Bestätigen Sie die verbindliche Aktualisierung vor dem Abschluss.")}</p>
          <label className="flex gap-2 text-sm"><Checkbox checked={terms} onCheckedChange={(value) => setTerms(value === true)} />{copy("I accept the current rental terms.", "Ich akzeptiere die aktuellen Mietbedingungen.")}</label>
          <label className="flex gap-2 text-sm"><Checkbox checked={privacy} onCheckedChange={(value) => setPrivacy(value === true)} />{copy("I acknowledge the current privacy notice.", "Ich bestätige den aktuellen Datenschutzhinweis.")}</label>
          <Button disabled={!terms || !privacy || isPending} onClick={() => mutate(() => confirmRenewedApplicationTerms({ applicationId: application.id, expectedRevision: application.revision, rentalTerms: terms, privacyNotice: privacy }))}>{copy("Confirm updated terms", "Aktualisierte Bedingungen bestätigen")}</Button>
        </section>
      ) : null}

      {message ? <p className="rounded-lg border bg-background p-3 text-sm" role="status">{message}</p> : null}

      <div className="flex flex-wrap gap-3">
        {application.status === "AWAITING_DOCUMENT_UPLOAD" ||
        (application.status === "CUSTOMER_ACTION_REQUIRED" && application.actionRequiredReason === "DOCUMENT_REPLACEMENT_REQUIRED") ? (
          <Button disabled={isPending} onClick={() => mutate(() => submitBookingApplicationForReview({ applicationId: application.id, expectedRevision: application.revision }))}>{copy("Submit uploaded files for review", "Hochgeladene Dateien zur Prüfung einreichen")}</Button>
        ) : null}
        {application.status === "READY_TO_FINALIZE" && readiness.ready ? (
          <Button disabled={isPending || advanceTransferCutoffPassed} onClick={() => mutate(() => finalizeSavedBookingApplication({ applicationId: application.id, expectedRevision: application.revision }))}>{locale === "de" ? "Bestätigung jetzt abschließen" : "Complete confirmation now"}</Button>
        ) : null}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={isPending}>
              {locale === "de" ? "Antrag stornieren" : "Cancel application"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{locale === "de" ? "Buchungsantrag wirklich stornieren?" : "Cancel this booking application?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {locale === "de"
                  ? "Diese Aktion ist endgültig. Es wird keine Buchung erstellt und der Antrag kann nicht fortgesetzt werden."
                  : "This is permanent. No booking will be created and this application cannot be continued."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{locale === "de" ? "Zurück" : "Keep application"}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => mutate(() => cancelSavedBookingApplication({ applicationId: application.id, expectedRevision: application.revision }))}
              >
                {locale === "de" ? "Endgültig stornieren" : "Cancel permanently"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  )
}
