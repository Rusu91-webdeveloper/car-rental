"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { updateBusinessProfile } from "@/app/actions/settings"
import { completeOwnerSetupStep, ownerSetupSaveLabel } from "@/components/admin/complete-owner-setup-step"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface BusinessProfileValue {
  companyName: string
  companyEmail: string
  companyPhone: string | null
  companyAddress: string | null
  companyCity: string | null
  companyState: string | null
  companyZipCode: string | null
  companyCountry: string | null
  managingDirector: string | null
  commercialRegister: string | null
  registerCourt: string | null
  vatId: string | null
  responsiblePerson: string | null
  currency: string
  currencySymbol: string
}

export function BusinessProfileForm({ value, nextHref }: { value: BusinessProfileValue; nextHref?: string }) {
  const router = useRouter()
  const [form, setForm] = useState({
    companyName: "Qujo Autovermietung GmbH",
    companyEmail: value.companyEmail,
    companyPhone: value.companyPhone ?? "",
    companyAddress: value.companyAddress ?? "",
    companyCity: value.companyCity ?? "",
    companyState: value.companyState ?? "",
    companyZipCode: value.companyZipCode ?? "",
    companyCountry: value.companyCountry ?? "",
    managingDirector: value.managingDirector ?? "",
    commercialRegister: value.commercialRegister ?? "",
    registerCourt: value.registerCourt ?? "",
    vatId: value.vatId ?? "",
    responsiblePerson: value.responsiblePerson ?? "",
    currency: value.currency,
    currencySymbol: value.currencySymbol,
  })
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  const set = (field: keyof typeof form, nextValue: string) => setForm((current) => ({ ...current, [field]: nextValue }))

  return (
    <form
      className="space-y-6 rounded-xl border bg-background p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault()
        startTransition(async () => {
          const result = await updateBusinessProfile(form)
          if ("error" in result) {
            setMessage(result.error)
            return
          }
          setMessage("Business details saved.")
          const navigationError = await completeOwnerSetupStep("business-profile", nextHref, router)
          if (navigationError) setMessage(navigationError)
        })
      }}
    >
      <div>
        <h2 className="font-semibold">Business profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">Shown on customer pages, emails, and legal contact areas.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Registered business name" htmlFor="company-name"><Input id="company-name" value={form.companyName} readOnly aria-readonly="true" className="bg-muted" required /></Field>
        <Field label="Contact email" htmlFor="company-email"><Input id="company-email" type="email" value={form.companyEmail} onChange={(event) => set("companyEmail", event.target.value)} required /></Field>
        <Field label="Phone" htmlFor="company-phone"><Input id="company-phone" value={form.companyPhone} onChange={(event) => set("companyPhone", event.target.value)} /></Field>
        <Field label="Street address" htmlFor="company-address"><Input id="company-address" value={form.companyAddress} onChange={(event) => set("companyAddress", event.target.value)} /></Field>
        <Field label="City" htmlFor="company-city"><Input id="company-city" value={form.companyCity} onChange={(event) => set("companyCity", event.target.value)} /></Field>
        <Field label="State or region" htmlFor="company-state"><Input id="company-state" value={form.companyState} onChange={(event) => set("companyState", event.target.value)} /></Field>
        <Field label="Postal code" htmlFor="company-postcode"><Input id="company-postcode" value={form.companyZipCode} onChange={(event) => set("companyZipCode", event.target.value)} /></Field>
        <Field label="Country" htmlFor="company-country"><Input id="company-country" value={form.companyCountry} onChange={(event) => set("companyCountry", event.target.value)} /></Field>
      </div>
      <details open className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-medium">Legal details for the Impressum</summary>
        <p className="mt-2 text-xs text-muted-foreground">Enter the exact details from the commercial register. Empty fields are never replaced with sample data.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Managing director" htmlFor="managing-director"><Input id="managing-director" value={form.managingDirector} onChange={(event) => set("managingDirector", event.target.value)} /></Field>
          <Field label="Commercial register number" htmlFor="commercial-register"><Input id="commercial-register" placeholder="e.g. HRB …" value={form.commercialRegister} onChange={(event) => set("commercialRegister", event.target.value)} /></Field>
          <Field label="Register court" htmlFor="register-court"><Input id="register-court" value={form.registerCourt} onChange={(event) => set("registerCourt", event.target.value)} /></Field>
          <Field label="VAT identification number" htmlFor="vat-id"><Input id="vat-id" value={form.vatId} onChange={(event) => set("vatId", event.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Editorially responsible person (only if applicable)" htmlFor="responsible-person"><Input id="responsible-person" value={form.responsiblePerson} onChange={(event) => set("responsiblePerson", event.target.value)} /></Field></div>
        </div>
      </details>
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-medium">Currency display</summary>
        <p className="mt-2 text-xs text-muted-foreground">Used for new car prices and customer-facing totals.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Currency code" htmlFor="currency"><Input id="currency" maxLength={3} value={form.currency} onChange={(event) => set("currency", event.target.value)} /></Field>
          <Field label="Currency symbol" htmlFor="currency-symbol"><Input id="currency-symbol" maxLength={5} value={form.currencySymbol} onChange={(event) => set("currencySymbol", event.target.value)} /></Field>
        </div>
      </details>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : ownerSetupSaveLabel(nextHref)}</Button>
        {message ? <p className="text-sm text-muted-foreground" role="status">{message}</p> : null}
      </div>
    </form>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>
}
