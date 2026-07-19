"use client"
import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { updateBookingWorkflowDraftAction } from "@/app/actions/phase6-configuration"
import { completeOwnerSetupStep, ownerSetupSaveLabel } from "@/components/admin/complete-owner-setup-step"
import { resolveEffectiveBookingFields } from "@/lib/booking-configuration/field-resolver"
import {
  synchronizeInsuranceBookingStep,
  validateBookingWorkflow,
} from "@/lib/booking-configuration/workflow"
import type { Phase6AdminPageData } from "@/lib/phase6-admin/types"
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
export function BookingFlowStepList({ data, canEdit, nextHref }: { data: Phase6AdminPageData; canEdit: boolean; nextHref?: string }) {
  const draft = data.draftWorkflow
  const router = useRouter()
  const [config, setConfig] = useState(() =>
    draft && data.draftInsurance
      ? synchronizeInsuranceBookingStep(draft.configuration, data.draftInsurance.configuration)
      : draft?.configuration,
  )
  const summary = draft?.changeSummary ?? "Booking journey update"
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  if (!draft || !config || !data.draftInsurance || !data.draftCustomerDriver) return null
  const issues = validateBookingWorkflow({
    workflow: config,
    insurance: data.draftInsurance.configuration,
    fields: resolveEffectiveBookingFields(data.draftCustomerDriver.configuration),
  })
  const insuranceWasMatched =
    draft.configuration.steps.find(({ step }) => step === "INSURANCE")?.requirement !==
    config.steps.find(({ step }) => step === "INSURANCE")?.requirement
  const insuranceDescription = !data.draftInsurance.configuration.enabled
    ? "Hidden because insurance is turned off in Step 3."
    : data.draftInsurance.configuration.selectionMode === "MANDATORY"
      ? "Required because insurance is mandatory in Step 3."
      : "Optional because customers choose insurance in Step 3."
  const save = () =>
    startTransition(async () => {
      const result = await updateBookingWorkflowDraftAction({
        versionId: draft.id,
        expectedRevision: draft.revision,
        configuration: config,
        changeSummary: summary,
      })
      if ("error" in result) {
        setMessage(result.error)
        return
      }
      setMessage("Booking steps saved.")
      const navigationError = await completeOwnerSetupStep("booking-flow", nextHref, router)
      if (navigationError) setMessage(navigationError)
    })
  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">Customer booking pages</h2>
        <p className="mt-1 text-sm text-muted-foreground">These are the pages customers see while booking, not the setup steps shown on the left. We match dependent pages automatically.</p>
        {insuranceWasMatched ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
            <p className="font-medium">Insurance has been fixed automatically</p>
            <p className="mt-1">It now matches the choice you saved in Step 3. Save and continue when you are ready.</p>
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
                      Customer page {step.displayOrder + 1}: {labels[step.step]}
                    </p>
                    {later ? (
                      <p className="text-xs text-muted-foreground">{later.description}</p>
                    ) : step.step === "INSURANCE" ? (
                      <p className="text-xs text-muted-foreground">{insuranceDescription}</p>
                    ) : locked ? (
                      <p className="text-xs text-muted-foreground">Required for a safe booking.</p>
                    ) : null}
                  </div>
                  {later ? (
                    <span className="rounded-full border bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                      {later.label}
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
                      aria-label={`${labels[step.step]} requirement`}
                    >
                      <option value="REQUIRED">Required</option>
                      <option value="OPTIONAL">Optional</option>
                      <option value="HIDDEN">Hidden</option>
                    </select>
                  )}
                </div>
              )
            })}
        </div>
      </section>
      {issues.length ? (
        <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <h2 className="font-semibold">Please fix these choices</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {issues.map((issue) => (
              <li key={issue.code}>{issue.adminMessage}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="rounded-xl border bg-background p-5">
        {canEdit ? (
          <Button className="mt-3" onClick={save} disabled={pending}>
            {pending ? "Saving and opening the next step…" : ownerSetupSaveLabel(nextHref)}
          </Button>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">View-only access</p>
        )}
        {message ? <p className="mt-2 text-sm" role="status">{message}</p> : null}
      </section>
    </div>
  )
}
