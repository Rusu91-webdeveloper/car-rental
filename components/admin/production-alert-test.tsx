"use client"

import { useState, useTransition } from "react"
import { useLocale } from "next-intl"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"

export function ProductionAlertTest() {
  const locale = useLocale()
  const isGerman = locale === "de"
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [evidenceId, setEvidenceId] = useState<string>()
  const [message, setMessage] = useState<string>()

  const sendTest = () =>
    startTransition(async () => {
      setMessage(undefined)
      const response = await fetch("/api/internal/production-readiness/alert-test", {
        method: "POST",
      })
      const result = (await response.json().catch(() => ({}))) as {
        status?: string
        evidenceId?: string
        code?: string
      }
      if (response.ok && result.status === "AWAITING_CONFIRMATION" && result.evidenceId) {
        setEvidenceId(result.evidenceId)
        setMessage(
          isGerman
            ? "Die Test-E-Mail wurde versendet. Prüfen Sie jetzt den Posteingang des Alarmempfängers."
            : "The test email was sent. Check the alert recipient's inbox now.",
        )
        return
      }
      setMessage(
        result.status === "RATE_LIMITED"
          ? isGerman
            ? "Ein Test wurde in der letzten Stunde bereits gestartet."
            : "A test was already started during the last hour."
          : isGerman
            ? "Die Test-E-Mail konnte nicht versendet werden. Prüfen Sie Berechtigungen und E-Mail-Einstellungen."
            : "The test email could not be sent. Check permissions and email settings.",
      )
    })

  const confirm = (delivered: boolean) =>
    startTransition(async () => {
      if (!evidenceId) return
      const response = await fetch(`/api/internal/production-readiness/alert-test/${encodeURIComponent(evidenceId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          result: delivered ? "DELIVERED" : "NOT_DELIVERED",
        }),
      })
      if (!response.ok) {
        setMessage(isGerman ? "Das Testergebnis konnte nicht gespeichert werden." : "The test result could not be saved.")
        return
      }
      setEvidenceId(undefined)
      setMessage(
        delivered
          ? isGerman
            ? "Die E-Mail-Zustellung wurde bestätigt."
            : "Email delivery was confirmed."
          : isGerman
            ? "Die fehlgeschlagene Zustellung wurde gespeichert."
            : "The failed delivery was recorded.",
      )
      router.refresh()
    })

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      {!evidenceId ? (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={sendTest}>
          {pending ? (isGerman ? "Test wird versendet …" : "Sending test…") : isGerman ? "Test-E-Mail versenden" : "Send test email"}
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={() => confirm(true)}>
            {isGerman ? "E-Mail erhalten" : "Email received"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => confirm(false)}>
            {isGerman ? "Nicht erhalten" : "Not received"}
          </Button>
        </div>
      )}
      {message ? (
        <p className="text-xs text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </div>
  )
}
