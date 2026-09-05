"use client"

import type { ConfigurationValidationIssue } from "@/lib/business-configuration/types"
import { useLocale } from "next-intl"

export function PricingIssueList({ issues, title = "What needs attention" }: { issues: ConfigurationValidationIssue[]; title?: string }) {
  const isGerman = useLocale() === "de"
  const translate = (value: string, fallback: string) => {
    if (!isGerman) return value
    const exact: Record<string, string> = {
      "Published legal documents and the live legal policy are ready for booking.":
        "Die veröffentlichten Rechtsdokumente und die aktive Einwilligungsregelung sind für Buchungen bereit.",
      "Review this legal configuration.": "Prüfen Sie diese rechtliche Konfiguration.",
      "This legal draft has unpublished, unvalidated changes.": "Dieser Entwurf enthält unveröffentlichte, noch nicht validierte Änderungen.",
    }
    return exact[value] ?? fallback
  }
  return (
    <section className="rounded-xl border bg-background p-5">
      <h2 className="font-semibold">{isGerman && title === "What needs attention" ? "Was benötigt Aufmerksamkeit?" : title}</h2>
      {issues.length === 0 ? (
        <p className="mt-2 text-sm text-emerald-700">{isGerman ? "Alles sieht gut aus." : "Everything looks good."}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {issues.map((issue, index) => (
            <li
              key={`${issue.code}-${issue.affectedResource ?? "global"}-${index}`}
              className={`rounded-lg border p-3 text-sm ${issue.severity === "BLOCKER" ? "border-destructive/30 bg-destructive/5" : "border-amber-300 bg-amber-50"}`}
            >
              <p className="font-medium">{translate(issue.adminMessage, "Diese Einstellung ist noch nicht vollständig.")}</p>
              {issue.remediation ? <p className="mt-1 text-muted-foreground">{translate(issue.remediation, "Prüfen und vervollständigen Sie diese Einstellung.")}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
