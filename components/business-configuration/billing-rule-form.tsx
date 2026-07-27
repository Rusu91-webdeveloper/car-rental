"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { updatePricingRulesAction } from "@/app/actions/pricing-configuration"
import { completeOwnerSetupStep, ownerSetupSaveLabel } from "@/components/admin/complete-owner-setup-step"
import type { PricingBillingConfiguration } from "@/lib/business-configuration/domains"
import type { PricingAdminPageData } from "@/lib/pricing-admin/types"
import { PricingStrategySelector } from "./pricing-strategy-selector"
import { UnsavedChangesWarning } from "./unsaved-changes-warning"

export function BillingRuleForm({ data, canManage, nextHref }: { data: PricingAdminPageData; canManage: boolean; nextHref?: string }) {
  const router = useRouter()
  const draft = data.draftPricing
  const [configuration, setConfiguration] = useState<PricingBillingConfiguration | undefined>(draft?.configuration)
  const [timeZone, setTimeZone] = useState(data.businessTimeZone)
  const changeSummary = draft?.changeSummary ?? "Rental duration update"
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  if (!draft || !configuration)
    return (
      <section className="rounded-xl border bg-background p-6">
        <h2 className="font-semibold">Start editing first</h2>
        <p className="mt-2 text-sm text-muted-foreground">Use “Edit current prices” above to unlock these choices.</p>
      </section>
    )
  const set = <K extends keyof PricingBillingConfiguration>(field: K, value: PricingBillingConfiguration[K]) => setConfiguration((current) => (current ? { ...current, [field]: value } : current))
  const minimumBookingDays = Math.max(1, Math.ceil(configuration.minimumRentalMinutes / 1_440))
  const setMinimumBookingDays = (days: number) => {
    const safeDays = Math.min(365, Math.max(1, Math.round(days) || 1))
    setConfiguration((current) => current ? {
      ...current,
      minimumRentalMinutes: safeDays * 1_440,
      minimumChargeDays: safeDays,
    } : current)
  }
  const dirty = JSON.stringify(configuration) !== JSON.stringify(draft.configuration) || timeZone !== data.businessTimeZone
  const save = () =>
    startTransition(async () => {
      if (dirty) {
        const result = await updatePricingRulesAction({
          pricingVersionId: draft.id,
          expectedRevision: draft.revision,
          configuration,
          changeSummary,
          businessTimeZone: timeZone,
        })
        if ("error" in result) {
          setMessage(result.error)
          return
        }
      }
      setMessage("Rental rules saved.")
      const navigationError = await completeOwnerSetupStep("rental-rules", nextHref, router)
      if (navigationError) setMessage(navigationError)
    })
  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">Essential booking rules</h2>
        <p className="mt-1 text-sm text-muted-foreground">These rules apply automatically to every car.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Minimum booking length" explanation="Customers cannot continue with a shorter booking." example="2 means at least two full days." live={display(data.livePricing ? Math.ceil(data.livePricing.configuration.minimumRentalMinutes / 1_440) : undefined)}>
            <div className="relative">
              <Input type="number" min={1} max={365} value={minimumBookingDays} onChange={(event) => setMinimumBookingDays(Number(event.target.value))} disabled={!canManage || pending} />
              <span className="pointer-events-none absolute right-3 top-2 text-sm text-muted-foreground">days</span>
            </div>
          </Field>
          <Field label="Tax rate" explanation="The percentage included in or added to every rental price." example="10 means 10%." live={display(data.livePricing ? data.livePricing.configuration.taxRateBps / 100 : undefined)}>
            <div className="relative">
              <Input type="number" min={0} max={100} step="0.01" value={configuration.taxRateBps / 100} onChange={(event) => set("taxRateBps", Math.round(Number(event.target.value) * 100))} disabled={!canManage || pending} />
              <span className="pointer-events-none absolute right-3 top-2 text-sm text-muted-foreground">%</span>
            </div>
          </Field>
        </div>
        <div className="mt-4">
          <Toggle label="Car prices already include tax" description="Turn this on when the price entered for each car already contains tax." checked={configuration.pricesIncludeTax} onChange={(value) => set("pricesIncludeTax", value)} disabled={!canManage || pending} live={data.livePricing?.configuration.pricesIncludeTax} />
        </div>
      </section>
      <details className="rounded-xl border bg-background p-5">
        <summary className="cursor-pointer font-semibold">Advanced rental calculation</summary>
        <p className="mt-2 text-sm text-muted-foreground">Most businesses can keep these defaults.</p>
        <div className="mt-4 space-y-5">
          <PricingStrategySelector value={configuration.mixedDurationStrategy} onChange={(value) => set("mixedDurationStrategy", value)} disabled={!canManage || pending} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Toggle label="Weekly pricing available" description="Cars still need a weekly price." checked={configuration.weeklyPricingEnabled} onChange={(value) => set("weeklyPricingEnabled", value)} disabled={!canManage || pending} live={data.livePricing?.configuration.weeklyPricingEnabled} />
            <Toggle label="Monthly pricing available" description="Cars still need a monthly price." checked={configuration.monthlyPricingEnabled} onChange={(value) => set("monthlyPricingEnabled", value)} disabled={!canManage || pending} live={data.livePricing?.configuration.monthlyPricingEnabled} />
            <Field label="Business timezone" explanation="Used to interpret pickup and return times." example="Europe/Bucharest" live={data.liveBusinessTimeZone}>
              <Input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} disabled={!canManage || !data.draftRelease || pending} />
            </Field>
            <Field label="What counts as a rental day?" explanation="Choose how partial days are charged." example="Each started 24-hour period." live={display(data.livePricing?.configuration.billableDayRule)}>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={configuration.billableDayRule} onChange={(event) => set("billableDayRule", event.target.value as PricingBillingConfiguration["billableDayRule"])} disabled={!canManage || pending}>
                <option value="STARTED_24_HOUR_PERIODS">Each started 24-hour period</option>
                <option value="CALENDAR_DAYS">Each calendar date</option>
                <option value="PICKUP_TIME_BOUNDARY">Each time the pickup hour passes</option>
              </select>
            </Field>
            <Field label="Late-return grace period" explanation="Minutes before another day is charged. This never extends the agreed return time or authorizes continued use." example="30 minutes." live={display(data.livePricing?.configuration.gracePeriodMinutes)}>
              <Input type="number" min={0} max={720} value={configuration.gracePeriodMinutes} onChange={(event) => set("gracePeriodMinutes", Number(event.target.value))} disabled={!canManage || pending} />
            </Field>
            <Field label="Preparation buffer" explanation="Minutes reserved after the mandatory 1-hour late-return safety margin for inspection, cleaning and preparation." example="120 minutes gives a 3-hour total block." live={display(data.livePricing?.configuration.preparationBufferMinutes)}>
              <div className="relative">
                <Input type="number" min={0} max={720} value={configuration.preparationBufferMinutes} onChange={(event) => set("preparationBufferMinutes", Number(event.target.value))} disabled={!canManage || pending} />
                <span className="pointer-events-none absolute right-3 top-2 text-sm text-muted-foreground">minutes</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Total scheduling block: {60 + configuration.preparationBufferMinutes} minutes.
              </p>
            </Field>
            <Field label="Days in a monthly price" explanation="Choose whether a monthly price covers 28 or 30 days." example="30 days." live={display(data.livePricing?.configuration.rentalMonthDefinition)}>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={configuration.rentalMonthDefinition} onChange={(event) => set("rentalMonthDefinition", event.target.value as "FIXED_28_DAYS" | "FIXED_30_DAYS")} disabled={!canManage || pending}>
                <option value="FIXED_28_DAYS">28 days</option>
                <option value="FIXED_30_DAYS">30 days</option>
              </select>
            </Field>
          </div>
        </div>
      </details>
      <section className="rounded-xl border bg-background p-5">
        <div className="flex items-center gap-3">
          {canManage ? (
            <Button onClick={save} disabled={pending || (!dirty && !nextHref)}>
              {ownerSetupSaveLabel(nextHref)}
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">View-only access</span>
          )}
          <UnsavedChangesWarning active={dirty} />
        </div>
        {message ? <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{message}</p> : null}
      </section>
    </div>
  )
}

function display(value: unknown) {
  return value === undefined ? "Not configured" : String(value).replaceAll("_", " ").toLowerCase()
}
function Field({ label, explanation, example, live, children }: { label: string; explanation: string; example: string; live?: string; children: React.ReactNode }) {
  return (
    <label className="rounded-lg border p-4 text-sm">
      <span className="font-medium">{label}</span>
      <span className="mt-1 block text-muted-foreground">{explanation}</span>
      <span className="mt-2 block text-xs text-muted-foreground">Example: {example}</span>
      {live ? <span className="my-2 block text-xs text-muted-foreground">Current: {live}</span> : null}
      {children}
    </label>
  )
}
function Toggle({ label, description, checked, onChange, disabled, live }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; live?: boolean }) {
  return (
    <label className="flex gap-3 rounded-lg border p-4">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} disabled={disabled} />
      <span>
        <span className="font-medium">{label}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
        <span className="mt-2 block text-xs text-muted-foreground">Current: {live === undefined ? "Not configured" : live ? "Enabled" : "Disabled"}</span>
      </span>
    </label>
  )
}
