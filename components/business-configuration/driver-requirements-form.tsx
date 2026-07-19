"use client"
import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { updateDriverRequirementsDraftAction } from "@/app/actions/phase6-configuration"
import { evaluateDriverEligibility } from "@/lib/booking-configuration/driver-eligibility"
import type { Phase6AdminPageData } from "@/lib/phase6-admin/types"
export function DriverRequirementsForm({ data, canEdit }: { data: Phase6AdminPageData; canEdit: boolean }) {
  const draft = data.draftCustomerDriver
  const router = useRouter()
  const [config, setConfig] = useState(draft?.configuration)
  const summary = draft?.changeSummary ?? "Driver rules update"
  const [birth, setBirth] = useState("2000-01-01")
  const [issue, setIssue] = useState("2020-01-01")
  const [expiry, setExpiry] = useState("2035-01-01")
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  if (!draft || !config) return null
  const eligibility = evaluateDriverEligibility({
    rules: config,
    customer: {
      dateOfBirth: birth,
      licenceNumber: "MASKED-1234",
      licenceIssueDate: issue,
      licenceExpiryDate: expiry,
      licenceIssuingCountry: "DE",
    },
    pickupAt: new Date("2030-06-01T10:00:00Z"),
    returnAt: new Date("2030-06-10T10:00:00Z"),
    businessTimeZone: "Europe/Berlin",
    evaluatedAt: new Date("2030-01-01T00:00:00Z"),
  })
  const save = () =>
    startTransition(async () => {
      const result = await updateDriverRequirementsDraftAction({
        versionId: draft.id,
        expectedRevision: draft.revision,
        configuration: config,
        changeSummary: summary,
      })
      setMessage("error" in result ? result.error : "Driver requirements saved.")
      if (!("error" in result)) router.refresh()
    })
  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-background p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum driver age" hint={`Driver must be at least ${config.minimumDriverAge} on pickup.`}>
            <Input
              type="number"
              min={18}
              max={99}
              value={config.minimumDriverAge}
              onChange={(e) =>
                setConfig({
                  ...config,
                  minimumDriverAge: Number(e.target.value),
                })
              }
              disabled={!canEdit}
            />
          </Field>
          <Field label="Maximum driver age (optional)" hint="Leave empty when no maximum applies.">
            <Input
              type="number"
              min={18}
              max={120}
              value={config.maximumDriverAge ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  maximumDriverAge: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              disabled={!canEdit}
            />
          </Field>
          <Field label="Minimum time holding a licence (months)" hint={`${config.minimumLicenceHeldMonths} months at pickup.`}>
            <Input
              type="number"
              min={0}
              max={1200}
              value={config.minimumLicenceHeldMonths}
              onChange={(e) =>
                setConfig({
                  ...config,
                  minimumLicenceHeldMonths: Number(e.target.value),
                })
              }
              disabled={!canEdit}
            />
          </Field>
          <label className="flex gap-2 rounded border p-3 text-sm">
            <Checkbox checked={config.licenceMustCoverRentalEnd} onCheckedChange={(v) => setConfig({ ...config, licenceMustCoverRentalEnd: v === true })} disabled={!canEdit} />
            Licence must remain valid through return
          </label>
        </div>
        <details className="mt-4 rounded-lg border p-4 text-sm">
          <summary className="cursor-pointer font-medium">Advanced country restrictions</summary>
          <div className="mt-4">
            <Field label="Allowed licence countries" hint="Enter two-letter country codes separated by commas, such as RO, DE. Leave empty to accept any country.">
              <Input
                value={config.allowedLicenceCountries.join(", ")}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    allowedLicenceCountries: e.target.value
                      .split(",")
                      .map((v) => v.trim().toUpperCase())
                      .filter(Boolean),
                  })
                }
                disabled={!canEdit}
              />
            </Field>
          </div>
        </details>
      </section>
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">Would this example driver be allowed?</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Date of birth" hint="Sample only">
            <Input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
          </Field>
          <Field label="Licence issue date" hint="Sample only">
            <Input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} />
          </Field>
          <Field label="Licence expiry date" hint="Sample only">
            <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
        </div>
        <p className={`mt-3 font-medium ${eligibility.eligible ? "text-emerald-700" : "text-destructive"}`}>{eligibility.eligible ? `Eligible · age ${eligibility.ageAtPickup} · licence held ${eligibility.licenceHeldMonthsAtPickup} months` : eligibility.issues[0]?.message}</p>
      </section>
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
function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </label>
  )
}
