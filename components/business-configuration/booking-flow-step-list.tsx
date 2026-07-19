"use client"
import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { updateBookingWorkflowDraftAction } from "@/app/actions/phase6-configuration"
import { resolveEffectiveBookingFields } from "@/lib/booking-configuration/field-resolver"
import { validateBookingWorkflow } from "@/lib/booking-configuration/workflow"
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
const unavailable = new Set(["DOCUMENTS", "LEGAL_ACCEPTANCE"])
export function BookingFlowStepList({ data, canEdit }: { data: Phase6AdminPageData; canEdit: boolean }) {
  const draft = data.draftWorkflow
  const router = useRouter()
  const [config, setConfig] = useState(draft?.configuration)
  const summary = draft?.changeSummary ?? "Booking journey update"
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  if (!draft || !config || !data.draftInsurance || !data.draftCustomerDriver) return null
  const issues = validateBookingWorkflow({
    workflow: config,
    insurance: data.draftInsurance.configuration,
    fields: resolveEffectiveBookingFields(data.draftCustomerDriver.configuration),
  })
  const save = () =>
    startTransition(async () => {
      const result = await updateBookingWorkflowDraftAction({
        versionId: draft.id,
        expectedRevision: draft.revision,
        configuration: config,
        changeSummary: summary,
      })
      setMessage("error" in result ? result.error : "Booking flow saved.")
      if (!("error" in result)) router.refresh()
    })
  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">Steps customers complete</h2>
        <p className="mt-1 text-sm text-muted-foreground">Required steps protect the information needed to confirm a rental.</p>
        <div className="mt-4 space-y-2">
          {[...config.steps]
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((step) => {
              const locked = unavailable.has(step.step) || ["VEHICLE_AND_DATES", "CUSTOMER_INFORMATION", "DRIVER_INFORMATION", "REVIEW", "CONFIRMATION"].includes(step.step)
              return (
                <div key={step.step} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="font-medium">
                      {step.displayOrder + 1}. {labels[step.step]}
                    </p>
                    {unavailable.has(step.step) ? <p className="text-xs text-muted-foreground">This step is not available yet.</p> : locked ? <p className="text-xs text-muted-foreground">Required for a safe booking.</p> : null}
                  </div>
                  <select
                    className="rounded border p-2 text-sm"
                    value={step.requirement}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        steps: config.steps.map((item) =>
                          item.step === step.step
                            ? {
                                ...item,
                                requirement: e.target.value as typeof item.requirement,
                              }
                            : item,
                        ),
                      })
                    }
                    disabled={!canEdit || locked}
                  >
                    <option value="REQUIRED">Required</option>
                    <option value="OPTIONAL">Optional</option>
                    <option value="HIDDEN">Hidden</option>
                  </select>
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
            Save changes
          </Button>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">View-only access</p>
        )}
        {message ? <p className="mt-2 text-sm">{message}</p> : null}
      </section>
    </div>
  )
}
