import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { requireAdmin } from "@/lib/auth"
import { getProductionHealthReport } from "@/lib/production/health"
import { getLocale } from "next-intl/server"
import { ProductionAlertTest } from "@/components/admin/production-alert-test"

export const dynamic = "force-dynamic"

const statusClass = {
  READY: "bg-emerald-100 text-emerald-900",
  PENDING: "bg-blue-100 text-blue-900",
  STALE: "bg-amber-100 text-amber-900",
  MANUAL_VERIFICATION_REQUIRED: "bg-amber-100 text-amber-900",
  BLOCKED: "bg-red-100 text-red-900",
  FAILING: "bg-red-100 text-red-900",
  NOT_CONFIGURED: "bg-slate-200 text-slate-900",
} as const
const statusLabel = {
  READY: ["Ready", "Bereit"],
  PENDING: ["Checking", "Wird geprüft"],
  STALE: ["Check needed", "Prüfung erforderlich"],
  MANUAL_VERIFICATION_REQUIRED: ["Check needed", "Prüfung erforderlich"],
  BLOCKED: ["Action needed", "Aktion erforderlich"],
  FAILING: ["Not working", "Nicht funktionsfähig"],
  NOT_CONFIGURED: ["Set up needed", "Einrichtung erforderlich"],
} as const
const checkLabels: Record<string, [string, string]> = {
  database: ["Can the app save bookings?", "Kann die App Buchungen speichern?"],
  configuration: ["Are business settings published?", "Sind die Geschäftseinstellungen veröffentlicht?"],
  pricing: ["Can customers see valid prices?", "Sehen Kunden gültige Preise?"],
  legal: ["Are terms and privacy available?", "Sind Mietbedingungen und Datenschutz verfügbar?"],
  blob: ["Are customer documents stored privately?", "Werden Kundendokumente geschützt gespeichert?"],
  oidc: ["Is private document access protected?", "Ist der Zugriff auf private Dokumente geschützt?"],
  ownership: ["Does every system task have an owner?", "Hat jede Systemaufgabe eine verantwortliche Person?"],
  monitoring: ["Will someone be warned about problems?", "Wird bei Problemen eine verantwortliche Person informiert?"],
  recovery: ["Can business data be restored?", "Können Geschäftsdaten wiederhergestellt werden?"],
  workers: ["Are automatic housekeeping tasks running?", "Laufen die automatischen Wartungsaufgaben?"],
  roles: ["Do the right people have document access?", "Haben die richtigen Personen Zugriff auf Dokumente?"],
  "review-queue": ["Are document reviews up to date?", "Sind die Dokumentenprüfungen aktuell?"],
  retention: ["Are expired documents being removed?", "Werden abgelaufene Dokumente entfernt?"],
  audit: ["Are important actions being recorded?", "Werden wichtige Aktionen protokolliert?"],
  emails: ["Can the app send email?", "Kann die App E-Mails versenden?"],
}

const remediationDe: Record<string, string> = {
  database: "Stellen Sie die Datenbankverbindung wieder her und prüfen Sie den Status erneut.",
  configuration: "Validieren und aktivieren Sie eine Geschäftskonfiguration.",
  pricing: "Veröffentlichen Sie einen validierten Preissatz und verbinden Sie ihn mit der aktiven Konfiguration.",
  legal: "Veröffentlichen Sie validierte Mietbedingungen und Datenschutzhinweise.",
  blob: "Prüfen Sie den privaten Speicher, die Region Frankfurt und den OIDC-Zugriff.",
  oidc: "Aktivieren Sie die Vercel-Systemvariablen für die Produktionsbereitstellung.",
  ownership: "Tragen Sie Verantwortliche für Produktion, Alarmierung, Wiederherstellung und Wartung ein.",
  monitoring: "Versenden Sie eine Test-E-Mail und bestätigen Sie den Empfang.",
  recovery: "Führen Sie die dokumentierte Sicherungs- und Wiederherstellungsprüfung durch.",
  workers: "Aktivieren und prüfen Sie alle geplanten Wartungsaufgaben.",
  roles: "Weisen Sie die Rollen Dokumentenprüfung, Dokumentsicherheit und Aufbewahrung zu.",
  "review-queue": "Bearbeiten Sie überfällige Dokumentenprüfungen.",
  retention: "Prüfen und bearbeiten Sie fällige Löschvorgänge.",
  audit: "Stellen Sie sicher, dass sicherheitsrelevante Aktionen protokolliert werden.",
  emails: "Konfigurieren Sie Resend und eine verifizierte Absenderadresse.",
}

export default async function ProductionHealthPage() {
  await requireAdmin()
  const locale = await getLocale()
  const isGerman = locale === "de"
  const languageIndex = isGerman ? 1 : 0
  const report = await getProductionHealthReport()
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <AdminPageHeader
        eyebrow={isGerman ? "Systemstatus" : "System status"}
        title={isGerman ? "Ist das Unternehmen bereit, Buchungen anzunehmen?" : "Is the business ready to take bookings?"}
        description={`${report.status === "READY" ? (isGerman ? "Alles ist bereit." : "Everything is ready.") : isGerman ? "Einige Punkte benötigen Aufmerksamkeit." : "Some items need attention."} ${isGerman ? "Zuletzt geprüft" : "Last checked"} ${new Date(report.generatedAt).toLocaleString(isGerman ? "de-DE" : "en-GB", { timeZone: "Europe/Berlin" })}.`}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {report.checks.map((item) => (
          <section key={item.key} className="rounded-xl border bg-card p-5 text-card-foreground">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-medium">{checkLabels[item.key]?.[languageIndex] ?? item.label}</h2>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[item.status]}`}>
                {statusLabel[item.status][languageIndex]}
              </span>
            </div>
            {item.status !== "READY" ? (
              <div className="mt-4 text-sm">
                <p className="font-medium">{isGerman ? "Was ist zu tun?" : "What to do"}</p>
                <p className="mt-1 text-muted-foreground">{isGerman ? (remediationDe[item.key] ?? item.remediation) : item.remediation}</p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-emerald-700">{isGerman ? "Keine Aktion erforderlich." : "No action needed."}</p>
            )}
            <details className="mt-4 text-xs text-muted-foreground">
              <summary className="cursor-pointer">{isGerman ? "Technische Details" : "Technical details"}</summary>
              <p className="mt-2">{isGerman ? `${checkLabels[item.key]?.[1] ?? item.label} ${statusLabel[item.status][1]}.` : item.evidence}</p>
              {item.lastVerifiedAt ? (
                <p className="mt-1">
                  {isGerman ? "Zuletzt bestätigt" : "Last confirmed"}:{" "}
                  {new Date(item.lastVerifiedAt).toLocaleString(isGerman ? "de-DE" : "en-GB", { timeZone: "Europe/Berlin" })}
                </p>
              ) : null}
            </details>
            {item.key === "monitoring" ? <ProductionAlertTest /> : null}
          </section>
        ))}
      </div>
    </main>
  )
}
