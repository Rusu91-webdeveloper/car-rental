"use client"
import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { updateInsuranceDraftAction } from "@/app/actions/phase6-configuration"
import { formatAdminMoneyInput } from "@/lib/pricing-admin/money-input"
import type { Phase6AdminPageData } from "@/lib/phase6-admin/types"
import { formatCents } from "@/lib/money"

export function InsuranceConfigurationForm({ data, canEdit }: { data: Phase6AdminPageData; canEdit: boolean }) {
  const draft = data.draftInsurance
  const router = useRouter()
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  const [config, setConfig] = useState(draft?.configuration)
  const [price, setPrice] = useState(formatAdminMoneyInput(draft?.configuration.pricePerDay))
  const [summary, setSummary] = useState(draft?.changeSummary ?? "Insurance update")
  if (!draft || !config) return null
  const save = () =>
    startTransition(async () => {
      const result = await updateInsuranceDraftAction({
        versionId: draft.id,
        expectedRevision: draft.revision,
        changeSummary: summary,
        configuration: { ...config, pricePerDay: price },
      })
      setMessage("error" in result ? result.error : "Insurance draft saved.")
      if (!("error" in result)) router.refresh()
    })
  const set = <K extends keyof typeof config>(key: K, value: (typeof config)[K]) =>
    setConfig((current) => (current ? { ...current, [key]: value } : current))
  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-background p-5">
        <label className="flex gap-3">
          <Checkbox
            checked={config.enabled}
            onCheckedChange={(value) => {
              const enabled = value === true
              setConfig((current) =>
                current
                  ? {
                      ...current,
                      enabled,
                      showCustomerSelection: enabled && current.selectionMode === "OPTIONAL",
                      preselectedByDefault: false,
                    }
                  : current,
              )
            }}
            disabled={!canEdit}
          />
          <span>
            <span className="font-medium">Offer Vollkasko insurance</span>
            <span className="block text-sm text-muted-foreground">
              Enable customers to add full insurance during booking.
            </span>
          </span>
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Customer-facing name">
            <Input
              value={config.customerFacingName}
              onChange={(event) => set("customerFacingName", event.target.value)}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Short description">
            <Input
              value={config.shortDescription ?? ""}
              onChange={(event) => set("shortDescription", event.target.value)}
              disabled={!canEdit}
            />
          </Field>
          <Field label={`Price per billable day (${data.currency})`}>
            <Input
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              disabled={!canEdit || !config.enabled}
            />
          </Field>
          <Field label="How should insurance work?">
            <select
              className="w-full rounded-md border p-2"
              value={config.selectionMode}
              onChange={(event) => {
                const mode = event.target.value as "OPTIONAL" | "MANDATORY"
                setConfig((current) =>
                  current
                    ? {
                        ...current,
                        selectionMode: mode,
                        showCustomerSelection: current.enabled && mode === "OPTIONAL",
                        preselectedByDefault: false,
                      }
                    : current,
                )
              }}
              disabled={!canEdit || !config.enabled}
            >
              <option value="OPTIONAL">Optional — customer chooses</option>
              <option value="MANDATORY">Required — included for eligible bookings</option>
            </select>
          </Field>
          <Field label="Tax treatment">
            <select
              className="w-full rounded-md border p-2"
              value={config.taxTreatment}
              onChange={(event) => set("taxTreatment", event.target.value as typeof config.taxTreatment)}
              disabled={!canEdit}
            >
              <option value="INHERIT_RENTAL">Same as rental price</option>
              <option value="TAX_INCLUDED">Tax included</option>
              <option value="TAX_EXCLUDED">Tax excluded</option>
            </select>
          </Field>
          <Field label="Vehicle availability">
            <select
              className="w-full rounded-md border p-2"
              value={config.availabilityScope}
              onChange={(event) => set("availabilityScope", event.target.value as typeof config.availabilityScope)}
              disabled={!canEdit}
            >
              <option value="ALL_VEHICLES">Every vehicle</option>
              <option value="SELECTED_VEHICLES">Selected vehicles only</option>
            </select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-5">
          <Toggle
            label="Show in confirmations"
            checked={config.showInConfirmation}
            onChange={(value) => set("showInConfirmation", value)}
            disabled={!canEdit}
          />
          <Toggle
            label="Visible customer choice"
            checked={config.showCustomerSelection}
            onChange={(value) => set("showCustomerSelection", value)}
            disabled={!canEdit || !config.enabled || config.selectionMode !== "OPTIONAL"}
          />
          <Toggle
            label="Preselected by default"
            checked={config.preselectedByDefault}
            onChange={(value) => set("preselectedByDefault", value)}
            disabled={!canEdit || !config.showCustomerSelection}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Preselection records initial UI state only; it is not customer-consent evidence.
        </p>
      </section>
      {config.availabilityScope === "SELECTED_VEHICLES" ? (
        <section className="rounded-xl border bg-background p-5">
          <h2 className="font-semibold">Eligible vehicles</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.vehicles.map((vehicle) => (
              <label key={vehicle.id} className="flex gap-2 rounded border p-3 text-sm">
                <Checkbox
                  checked={config.vehicleIds.includes(vehicle.id)}
                  onCheckedChange={(value) =>
                    set(
                      "vehicleIds",
                      value === true
                        ? [...config.vehicleIds, vehicle.id]
                        : config.vehicleIds.filter((id) => id !== vehicle.id),
                    )
                  }
                  disabled={!canEdit}
                />
                {vehicle.name} <span className="text-muted-foreground">({vehicle.status})</span>
              </label>
            ))}
          </div>
        </section>
      ) : null}
      {data.insuranceQuoteExample ? (
        <section className="rounded-xl border bg-background p-5">
          <h2 className="font-semibold">Example quote impact</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Authoritative engine example for {data.insuranceQuoteExample.billableDays} billable days.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
            <div>
              <span className="block text-muted-foreground">Not selected</span>
              {formatCents(data.insuranceQuoteExample.unselectedGrandTotal, data.currency)}
            </div>
            <div>
              <span className="block text-muted-foreground">Insurance</span>
              {formatCents(data.insuranceQuoteExample.insuranceSubtotal, data.currency)}
            </div>
            <div>
              <span className="block text-muted-foreground">Selected</span>
              {formatCents(data.insuranceQuoteExample.selectedGrandTotal, data.currency)}
            </div>
          </div>
        </section>
      ) : null}
      <section className="rounded-xl border bg-background p-5">
        <Field label="Change summary">
          <Input value={summary} onChange={(event) => setSummary(event.target.value)} disabled={!canEdit} />
        </Field>
        {canEdit ? (
          <Button className="mt-3" onClick={save} disabled={pending}>
            Save insurance draft
          </Button>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Read-only access</p>
        )}
        {message ? <p className="mt-3 text-sm">{message}</p> : null}
      </section>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  )
}
function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="flex gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} disabled={disabled} />
      {label}
    </label>
  )
}
