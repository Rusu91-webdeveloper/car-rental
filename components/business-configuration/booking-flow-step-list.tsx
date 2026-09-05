"use client"
import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { updateBookingWorkflowDraftAction } from "@/app/actions/phase6-configuration"
import { completeOwnerSetupStep, ownerSetupSaveLabel } from "@/components/admin/complete-owner-setup-step"
import { resolveEffectiveBookingFields } from "@/lib/booking-configuration/field-resolver"
import {
  synchronizeConfiguredBookingSteps,
  validateBookingWorkflow,
} from "@/lib/booking-configuration/workflow"
import type {
  DocumentPolicyConfiguration,
  LegalAcceptanceConfiguration,
} from "@/lib/business-configuration/domains"
import type { Phase6AdminPageData } from "@/lib/phase6-admin/types"
import { useLocale } from "next-intl"
const labels = {
  VEHICLE_AND_DATES: "Car and rental dates",
  CUSTOMER_INFORMATION: "Customer information",
  DRIVER_INFORMATION: "Driver information",
  INSURANCE: "Insurance",
  DOCUMENTS: "Documents",
  LEGAL_ACCEPTANCE: "Terms and privacy",
  PAYMENT: "Payment or booking request",
  REVIEW: "Review",
  CONFIRMATION: "Confirmation",
} as const
const configuredLater = {
  DOCUMENTS: {
    label: "Set up in Step 7",
    description: "Choose the documents customers provide in Required documents.",
  },
  LEGAL_ACCEPTANCE: {
    label: "Set up in Step 10",
    description: "Choose the terms customers accept in Legal terms and privacy.",
  },
} as const
export function BookingFlowStepList({
  data,
  documents,
  legal,
  canEdit,
  nextHref,
}: {
  data: Phase6AdminPageData
  documents: DocumentPolicyConfiguration
  legal: LegalAcceptanceConfiguration
  canEdit: boolean
  nextHref?: string
}) {
  const de = useLocale() === "de"
  const stepLabels: Record<keyof typeof labels, string> = de ? {
    VEHICLE_AND_DATES: "Fahrzeug und Mietdaten",
    CUSTOMER_INFORMATION: "Kundeninformationen",
    DRIVER_INFORMATION: "Fahrerinformationen",
    INSURANCE: "Versicherung",
    DOCUMENTS: "Dokumente",
    LEGAL_ACCEPTANCE: "Mietbedingungen und Datenschutz",
    PAYMENT: "Zahlung oder Buchungsanfrage",
    REVIEW: "Überprüfung",
    CONFIRMATION: "Bestätigung",
  } : labels
  const draft = data.draftWorkflow
  const router = useRouter()
  const [config, setConfig] = useState(() =>
    draft && data.draftInsurance
      ? synchronizeConfiguredBookingSteps(draft.configuration, {
          insurance: data.draftInsurance.configuration,
          documents,
          legal,
        })
      : draft?.configuration,
  )
  const summary = draft?.changeSummary ?? "Booking journey update"
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  if (!draft || !config || !data.draftInsurance || !data.draftCustomerDriver) return null
  const issues = validateBookingWorkflow({
    workflow: config,
    insurance: data.draftInsurance.configuration,
    legal,
    fields: resolveEffectiveBookingFields(data.draftCustomerDriver.configuration),
  })
  const matchedSteps = config.steps.filter((step) =>
    draft.configuration.steps.find((item) => item.step === step.step)?.requirement !== step.requirement,
  )
  const insuranceDescription = !data.draftInsurance.configuration.enabled
    ? (de ? "Ausgeblendet, weil die Versicherung in Schritt 3 deaktiviert ist." : "Hidden because insurance is turned off in Step 3.")
    : data.draftInsurance.configuration.selectionMode === "MANDATORY"
      ? (de ? "Erforderlich, weil die Versicherung in Schritt 3 verpflichtend ist." : "Required because insurance is mandatory in Step 3.")
      : (de ? "Optional, weil Kunden die Versicherung in Schritt 3 auswählen." : "Optional because customers choose insurance in Step 3.")
  const save = () =>
    startTransition(async () => {
      const result = await updateBookingWorkflowDraftAction({
        versionId: draft.id,
        expectedRevision: draft.revision,
        configuration: config,
        changeSummary: summary,
      })
      if ("error" in result) {
        setMessage(de ? "Die Buchungsschritte konnten nicht gespeichert werden." : result.error)
        return
      }
      setMessage(de ? "Buchungsschritte gespeichert." : "Booking steps saved.")
      const navigationError = await completeOwnerSetupStep("booking-flow", nextHref, router)
      if (navigationError) setMessage(de ? "Die Buchungsschritte wurden gespeichert, aber der nächste Schritt konnte nicht geöffnet werden." : navigationError)
    })
  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">{de ? "Buchungsseiten für Kunden" : "Customer booking pages"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{de ? "Dies sind die Seiten, die Kunden während der Buchung sehen, nicht die Einrichtungsschritte auf der linken Seite. Abhängige Seiten werden automatisch angepasst." : "These are the pages customers see while booking, not the setup steps shown on the left. We match dependent pages automatically."}</p>
        {matchedSteps.length ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
            <p className="font-medium">{de ? "Abhängige Buchungsseiten wurden automatisch angepasst" : "Dependent booking pages have been matched automatically"}</p>
            <p className="mt-1">
              {matchedSteps.map((step) => stepLabels[step.step]).join(", ")} {de ? "entsprechen jetzt den Einstellungen aus den anderen Schritten. Speichern Sie und fahren Sie fort, um sie zu veröffentlichen." : "now match the settings you completed in the other steps. Save and continue to publish them."}
            </p>
          </div>
        ) : null}
        <div className="mt-4 space-y-2">
          {[...config.steps]
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((step) => {
              const later = step.step === "DOCUMENTS" || step.step === "LEGAL_ACCEPTANCE"
                ? configuredLater[step.step]
                : null
              const locked = later || step.step === "INSURANCE" || ["VEHICLE_AND_DATES", "CUSTOMER_INFORMATION", "DRIVER_INFORMATION", "REVIEW", "CONFIRMATION"].includes(step.step)
              return (
                <div key={step.step} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {de ? "Kundenseite" : "Customer page"} {step.displayOrder + 1}: {stepLabels[step.step]}
                    </p>
                    {later ? (
                      <p className="text-xs text-muted-foreground">{later.description}</p>
                    ) : step.step === "INSURANCE" ? (
                      <p className="text-xs text-muted-foreground">{insuranceDescription}</p>
                    ) : locked ? (
                      <p className="text-xs text-muted-foreground">{de ? "Für eine sichere Buchung erforderlich." : "Required for a safe booking."}</p>
                    ) : null}
                  </div>
                  {later ? (
                    <span className="rounded-full border bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                      {step.requirement === "REQUIRED" ? (de ? "Erforderlich" : "Required") : step.requirement === "OPTIONAL" ? "Optional" : (de ? "Ausgeblendet" : "Hidden")} · {de ? (step.step === "DOCUMENTS" ? "Einrichtung in Schritt 7" : "Einrichtung in Schritt 10") : later.label}
                    </span>
                  ) : (
                    <select
                      className="rounded border p-2 text-sm"
                      value={step.requirement}
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          steps: config.steps.map((item) =>
                            item.step === step.step
                              ? {
                                  ...item,
                                  requirement: event.target.value as typeof item.requirement,
                                }
                              : item,
                          ),
                        })
                      }
                      disabled={!canEdit || Boolean(locked)}
                      aria-label={de ? `Anforderung für ${stepLabels[step.step]}` : `${labels[step.step]} requirement`}
                    >
                      <option value="REQUIRED">{de ? "Erforderlich" : "Required"}</option>
                      <option value="OPTIONAL">Optional</option>
                      <option value="HIDDEN">{de ? "Ausgeblendet" : "Hidden"}</option>
                    </select>
                  )}
                </div>
              )
            })}
        </div>
      </section>
      {issues.length ? (
        <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <h2 className="font-semibold">{de ? "Bitte korrigieren Sie diese Auswahl" : "Please fix these choices"}</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {issues.map((issue) => (
              <li key={issue.code}>{de ? "Eine abhängige Buchungsseite ist noch nicht korrekt eingerichtet." : issue.adminMessage}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="rounded-xl border bg-background p-5">
        {canEdit ? (
          <Button className="mt-3" onClick={save} disabled={pending}>
            {pending ? (de ? "Wird gespeichert und der nächste Schritt geöffnet…" : "Saving and opening the next step…") : ownerSetupSaveLabel(nextHref, de)}
          </Button>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{de ? "Nur Lesezugriff" : "View-only access"}</p>
        )}
        {message ? <p className="mt-2 text-sm" role="status">{message}</p> : null}
      </section>
    </div>
  )
}
