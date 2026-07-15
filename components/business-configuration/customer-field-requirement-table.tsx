"use client"
import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateCustomerFieldDraftAction } from "@/app/actions/phase6-configuration"
import { resolveEffectiveBookingFields } from "@/lib/booking-configuration/field-resolver"
import type { Phase6AdminPageData } from "@/lib/phase6-admin/types"
export function CustomerFieldRequirementTable({ data, canEdit }: { data: Phase6AdminPageData; canEdit: boolean }) {
  const draft = data.draftCustomerDriver
  const router = useRouter()
  const [config, setConfig] = useState(draft?.configuration)
  const [summary, setSummary] = useState(draft?.changeSummary ?? "Customer field requirements update")
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
      setMessage("error" in result ? result.error : "Customer field modes saved.")
      if (!("error" in result)) router.refresh()
    })
  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">Supported booking fields</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          System and driver dependencies override unsafe hidden choices. No custom fields or scripts are supported.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">Field</th>
                <th className="p-2">Configured mode</th>
                <th className="p-2">Effective behavior</th>
                <th className="p-2">Reason</th>
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
                  <td className="p-2 text-muted-foreground">{field.reason ?? "Configured by administrator."}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-xl border bg-background p-5">
        <Input value={summary} onChange={(e) => setSummary(e.target.value)} disabled={!canEdit} />
        {canEdit ? (
          <Button className="mt-3" onClick={save} disabled={pending}>
            Save field requirements
          </Button>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Read-only access</p>
        )}
        {message ? <p className="mt-2 text-sm">{message}</p> : null}
      </section>
    </div>
  )
}
