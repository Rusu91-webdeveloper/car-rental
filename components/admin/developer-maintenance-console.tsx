"use client"

import { useState, useTransition } from "react"
import { useLocale } from "next-intl"
import { useRouter } from "@/navigation"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DeveloperMaintenancePreview } from "@/lib/developer-maintenance/service"

const CONFIRMATION = "DELETE ELIGIBLE DATA"

function formatBytes(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

export function DeveloperMaintenanceConsole({
  initialPreview,
}: {
  initialPreview: DeveloperMaintenancePreview
}) {
  const locale = useLocale()
  const isGerman = locale === "de"
  const router = useRouter()
  const [confirmation, setConfirmation] = useState("")
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string>()

  const runCleanup = () =>
    startTransition(async () => {
      try {
        setMessage(undefined)
        const response = await fetch("/api/internal/developer-maintenance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation }),
        })
        const result = (await response.json().catch(() => ({}))) as {
          deletedDocuments?: number
          documentFailures?: unknown[]
          deletedLogs?: {
            auditEvents: number
            adminAuditLogs: number
            workerExecutions: number
          }
          code?: string
        }
        if (!response.ok || !result.deletedLogs) {
          setMessage(
            result.code === "MAINTENANCE_AUTHENTICATION_REQUIRED"
              ? isGerman
                ? "Melden Sie sich erneut mit Google an und versuchen Sie es innerhalb von zehn Minuten erneut."
                : "Sign in with Google again and retry within ten minutes."
              : isGerman
                ? "Die Wartung konnte nicht abgeschlossen werden. Prüfen Sie die Produktionsprotokolle."
                : "Maintenance could not complete. Check the production logs.",
          )
          return
        }
        setOpen(false)
        setConfirmation("")
        setMessage(
          isGerman
            ? `${result.deletedDocuments ?? 0} Dokumentdateien und ${result.deletedLogs.auditEvents + result.deletedLogs.adminAuditLogs + result.deletedLogs.workerExecutions} alte Protokolle wurden entfernt.${result.documentFailures?.length ? ` ${result.documentFailures.length} Dokumente benötigen einen erneuten Versuch.` : ""}`
            : `${result.deletedDocuments ?? 0} document files and ${result.deletedLogs.auditEvents + result.deletedLogs.adminAuditLogs + result.deletedLogs.workerExecutions} old log records were removed.${result.documentFailures?.length ? ` ${result.documentFailures.length} documents need another attempt.` : ""}`,
        )
        router.refresh()
      } catch {
        setMessage(
          isGerman
            ? "Die Wartungsanfrage ist fehlgeschlagen. Versuchen Sie es erneut."
            : "The maintenance request failed. Try again.",
        )
      }
    })

  const totalEligible =
    initialPreview.dueDocuments +
    initialPreview.expiredUploadSessions +
    initialPreview.oldAuditEvents +
    initialPreview.oldAdminAuditLogs +
    initialPreview.oldWorkerExecutions

  return (
    <section className="rounded-xl border border-red-300 bg-red-50/50 p-5 text-card-foreground">
      <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
        {isGerman ? "Nur für Entwickler" : "Developer only"}
      </p>
      <h2 className="mt-1 text-lg font-semibold">
        {isGerman ? "Datenbank- und Dokumentwartung" : "Database and document maintenance"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {isGerman
          ? "Entfernt nur abgelaufene Dokumentdateien ohne aktive Sperre und Protokolle außerhalb der festen Aufbewahrungsfristen. Minimale Lösch- und Buchungsnachweise bleiben erhalten."
          : "Removes only expired document files without an active legal hold and logs beyond the fixed retention windows. Minimal deletion and booking evidence remains."}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label={isGerman ? "Fällige Dokumente" : "Due documents"} value={`${initialPreview.dueDocuments} · ${formatBytes(initialPreview.dueDocumentBytes)}`} />
        <Metric label={isGerman ? "Abgelaufene Sitzungen" : "Expired sessions"} value={String(initialPreview.expiredUploadSessions)} />
        <Metric label={`AuditEvent > ${initialPreview.policy.auditEventRetentionDays}d`} value={String(initialPreview.oldAuditEvents)} />
        <Metric label={`WorkerExecution > ${initialPreview.policy.workerExecutionRetentionDays}d`} value={String(initialPreview.oldWorkerExecutions)} />
        <Metric label={`AdminAuditLog > ${initialPreview.policy.adminAuditLogRetentionDays}d`} value={String(initialPreview.oldAdminAuditLogs)} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <AlertDialog open={open} onOpenChange={(next) => {
          setOpen(next)
          if (!next) setConfirmation("")
        }}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" disabled={pending || totalEligible === 0}>
              {pending
                ? isGerman ? "Wartung läuft …" : "Running maintenance…"
                : isGerman ? "Fällige Daten löschen" : "Delete eligible data"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{isGerman ? "Unwiderrufliche Wartung bestätigen" : "Confirm irreversible maintenance"}</AlertDialogTitle>
              <AlertDialogDescription>
                {isGerman
                  ? `Pro Durchlauf werden höchstens ${initialPreview.policy.documentBatchSize} Dokumentdateien und ${initialPreview.policy.logBatchSize} Einträge je Protokolltyp gelöscht. Aktive gesetzliche Sperren werden nie gelöscht.`
                  : `Each run deletes at most ${initialPreview.policy.documentBatchSize} document files and ${initialPreview.policy.logBatchSize} rows per log type. Active legal holds are never deleted.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <label className="text-sm font-medium">
              {isGerman ? `Geben Sie „${CONFIRMATION}“ ein` : `Type “${CONFIRMATION}”`}
              <Input className="mt-2 font-mono" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
            </label>
            <AlertDialogFooter>
              <AlertDialogCancel>{isGerman ? "Abbrechen" : "Cancel"}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={confirmation !== CONFIRMATION || pending}
                onClick={(event) => {
                  event.preventDefault()
                  runCleanup()
                }}
              >
                {isGerman ? "Dauerhaft löschen" : "Delete permanently"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <p className="text-xs text-muted-foreground">
          {isGerman ? "Erfordert eine Google-Anmeldung innerhalb der letzten zehn Minuten." : "Requires a Google sign-in within the last ten minutes."}
        </p>
      </div>
      {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold">{value}</p>
    </div>
  )
}
