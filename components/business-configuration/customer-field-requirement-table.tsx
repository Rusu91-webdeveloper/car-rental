"use client"
import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { updateCustomerFieldDraftAction } from "@/app/actions/phase6-configuration"
import { completeOwnerSetupStep, ownerSetupSaveLabel } from "@/components/admin/complete-owner-setup-step"
import { resolveEffectiveBookingFields } from "@/lib/booking-configuration/field-resolver"
import type { Phase6AdminPageData } from "@/lib/phase6-admin/types"
export function CustomerFieldRequirementTable({ data, canEdit, nextHref }: { data: Phase6AdminPageData; canEdit: boolean; nextHref?: string }) {
  const draft = data.draftCustomerDriver
  const router = useRouter()
  const [config, setConfig] = useState(draft?.configuration)
  const summary = draft?.changeSummary ?? "Customer information update"
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  if (!draft || !config) return null
  const effective = resolveEffectiveBookingFields(config)
  const save = () =>
    startTransition(async () => {
      const result = await updateCustomerFieldDraftAction({
        versionId: draft.id,
        expectedRevision: draft.revision,
        configuration: config,
        changeSummary: summary,
      })
      if ("error" in result) {
        setMessage(result.error)
        return
      }
      setMessage("Customer information saved.")
      const navigationError = await completeOwnerSetupStep("customer-information", nextHref, router)
      if (navigationError) setMessage(navigationError)
    })
  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">Information customers provide</h2>
        <p className="mt-1 text-sm text-muted-foreground">Some details are always required so you can confirm the booking and the driver.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">Information</th>
                <th className="p-2">Ask for it?</th>
                <th className="p-2">What customers see</th>
                <th className="p-2">Why</th>
              </tr>
            </thead>
            <tbody>
              {effective.map((field) => (
                <tr key={field.key} className="border-b">
                  <td className="p-2 font-medium">{field.label}</td>
                  <td className="p-2">
                    <select
                      className="rounded border p-2"
                      value={config.fields[field.key]}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          fields: {
                            ...config.fields,
                            [field.key]: e.target.value as "REQUIRED" | "OPTIONAL" | "DISABLED",
                          },
                        })
                      }
                      disabled={!canEdit || field.source !== "CONFIGURATION"}
                    >
                      <option value="REQUIRED">Required</option>
                      <option value="OPTIONAL">Optional</option>
                      <option value="DISABLED">Hidden</option>
                    </select>
                  </td>
                  <td className="p-2">{field.visible ? (field.required ? "Required" : "Optional") : "Hidden"}</td>
                  <td className="p-2 text-muted-foreground">{field.reason ?? "Your choice."}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-xl border bg-background p-5">
        {canEdit ? (
          <Button className="mt-3" onClick={save} disabled={pending}>
            {ownerSetupSaveLabel(nextHref)}
          </Button>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">View-only access</p>
        )}
        {message ? <p className="mt-2 text-sm">{message}</p> : null}
      </section>
    </div>
  )
}
