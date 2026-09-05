"use client"

import { useState, useTransition } from "react"
import { updatePaymentDetails } from "@/app/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface PaymentDetailsValue {
  bankName: string
  accountName: string
  accountNumber: string
  swiftCode: string
  iban: string | null
  guaranteePercentage: number
}

export function PaymentDetailsForm({ value }: { value: PaymentDetailsValue }) {
  const [form, setForm] = useState({
    bankName: value.bankName,
    accountName: value.accountName,
    accountNumber: value.accountNumber,
    swiftCode: value.swiftCode,
    iban: value.iban ?? "",
    guaranteePercent: Math.round(value.guaranteePercentage * 100),
  })
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="space-y-5 rounded-xl border bg-background p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault()
        startTransition(async () => {
          const result = await updatePaymentDetails({
            bankName: form.bankName,
            accountName: form.accountName,
            accountNumber: form.accountNumber,
            swiftCode: form.swiftCode,
            iban: form.iban,
            guaranteePercentage: form.guaranteePercent / 100,
          })
          setMessage("error" in result ? result.error : "Payment details saved.")
        })
      }}
    >
      <div><h2 className="font-semibold">Bank transfer details</h2><p className="mt-1 text-sm text-muted-foreground">Shown on the booking page and in confirmations when bank transfer is used.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["bankName", "accountName", "accountNumber", "swiftCode", "iban"] as const).map((field) => {
          const labels = { bankName: "Bank name", accountName: "Account holder", accountNumber: "Account number", swiftCode: "SWIFT / BIC", iban: "IBAN" }
          return <div key={field} className="space-y-2"><Label htmlFor={field}>{labels[field]}</Label><Input id={field} value={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} required /></div>
        })}
      </div>
      <div className="border-t pt-5"><h3 className="font-medium">Security deposit</h3><p className="mt-1 text-sm text-muted-foreground">The booking deposit is configured in the published payment choices below. This setting is the separate refundable damage guarantee.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="guarantee">Refundable damage deposit</Label><div className="relative"><Input id="guarantee" type="number" min={0} max={100} value={form.guaranteePercent} onChange={(event) => setForm((current) => ({ ...current, guaranteePercent: Number(event.target.value) }))} /><span className="absolute right-3 top-2 text-sm text-muted-foreground">%</span></div><p className="text-xs text-muted-foreground">Refundable amount held against damage or extra charges.</p></div>
      </div>
      <div className="flex items-center gap-3"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save payment details"}</Button>{message ? <p className="text-sm text-muted-foreground" role="status">{message}</p> : null}</div>
    </form>
  )
}
