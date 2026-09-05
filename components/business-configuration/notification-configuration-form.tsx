"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateOwnerPaymentDraft } from "@/app/actions/notification-configuration"
import { completeOwnerSetupStep, ownerSetupSaveLabel } from "@/components/admin/complete-owner-setup-step"
import type { loadNotificationConfigurationPage, ManualPaymentMethod } from "@/lib/notification-configuration/service"
import { useLocale } from "next-intl"

type PageData = Awaited<ReturnType<typeof loadNotificationConfigurationPage>>
const methods: Array<{
  method: ManualPaymentMethod
  label: string
  description: string
}> = [
  {
    method: "BANK_TRANSFER",
    label: "Bank Transfer",
    description: "Send bank and reference instructions; no transfer is processed here.",
  },
  {
    method: "CASH_ON_PICKUP",
    label: "Cash at Pickup",
    description: "Tell the customer what to bring and where to pay.",
  },
]

interface PaymentProfileValue {
  bankName: string
  accountName: string
  accountNumber: string
  swiftCode: string
  iban: string | null
  guaranteePercentage: number
}

export function PaymentInstructionForm({ data, paymentProfile, canEdit, nextHref }: { data: PageData; paymentProfile: PaymentProfileValue; canEdit: boolean; nextHref?: string }) {
  const de = useLocale() === "de"
  const draft = data.draftPayment
  const source = draft?.configuration ?? data.activePayment?.configuration
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string>()
  const summary = draft?.changeSummary ?? "Payment instructions update"
  const [defaultMethod, setDefaultMethod] = useState<ManualPaymentMethod>(methods.some(({ method }) => method === source?.defaultMethod) ? (source!.defaultMethod as ManualPaymentMethod) : "BANK_TRANSFER")
  const [enabled, setEnabled] = useState<ManualPaymentMethod[]>(methods.filter(({ method }) => source?.methods.some((item) => item.method === method && item.enabled)).map(({ method }) => method))
  const [depositEnabled, setDepositEnabled] = useState(source?.depositMode !== "NONE")
  const [depositPercentage, setDepositPercentage] = useState(
    source?.depositMode === "PERCENTAGE_BPS" ? Math.round(source.depositValue / 100) : 20,
  )
  const [profile, setProfile] = useState({
    bankName: paymentProfile.bankName,
    accountName: paymentProfile.accountName,
    accountNumber: paymentProfile.accountNumber,
    swiftCode: paymentProfile.swiftCode,
    iban: paymentProfile.iban ?? "",
    guaranteePercent: Math.round(paymentProfile.guaranteePercentage * 100),
  })
  const initialInstructions = useMemo(() => Object.fromEntries(methods.flatMap(({ method }) => data.supportedLocales.map((locale) => [`${method}:${locale}`, source?.instructions.find((item) => item.method === method && item.locale === locale)?.instructions ?? ""]))), [data.supportedLocales, source])
  const [instructions, setInstructions] = useState<Record<string, string>>(initialInstructions)
  if (!source) return <p className="text-sm text-muted-foreground">{de ? "Richten Sie zuerst die Zahlungsnachrichten ein." : "Set up payment messages first."}</p>
  return (
    <section className="rounded-xl border bg-background p-5">
      <h2 className="font-semibold">{de ? "Zahlungsarten für Kunden" : "Payment choices shown to customers"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{de ? "Diese Hinweise erscheinen in der Buchungsbestätigung. Zahlungen werden außerhalb dieser App abgeschlossen." : "These instructions appear in the booking confirmation. Payments are completed outside this app."}</p>
      <div className="mt-5 rounded-lg border p-4">
        <h3 className="font-medium">{de ? "Bankverbindung und Sicherheitsleistung" : "Bank transfer and security details"}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{de ? "Bankdaten sind erforderlich, wenn Überweisung oder Anzahlung aktiviert ist. Die Schadenssicherheit bleibt von der Buchungsanzahlung getrennt." : "Bank details are required when bank transfer or an advance deposit is enabled. The damage guarantee remains separate from the booking deposit."}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(["bankName", "accountName", "accountNumber", "swiftCode", "iban"] as const).map((field) => {
            const labels = de
              ? { bankName: "Bankname", accountName: "Kontoinhaber", accountNumber: "Kontonummer", swiftCode: "SWIFT / BIC", iban: "IBAN" }
              : { bankName: "Bank name", accountName: "Account holder", accountNumber: "Account number", swiftCode: "SWIFT / BIC", iban: "IBAN" }
            return (
              <div key={field} className="space-y-2">
                <Label htmlFor={`payment-${field}`}>{labels[field]}</Label>
                <Input
                  id={`payment-${field}`}
                  value={profile[field]}
                  disabled={!draft || !canEdit}
                  onChange={(event) => setProfile((current) => ({ ...current, [field]: event.target.value }))}
                />
              </div>
            )
          })}
          <div className="space-y-2">
            <Label htmlFor="payment-guarantee">{de ? "Rückerstattbare Schadenssicherheit" : "Refundable damage guarantee"}</Label>
            <div className="relative">
              <Input
                id="payment-guarantee"
                type="number"
                min={0}
                max={100}
                value={profile.guaranteePercent}
                disabled={!draft || !canEdit}
                onChange={(event) => setProfile((current) => ({ ...current, guaranteePercent: Number(event.target.value) }))}
              />
              <span className="absolute right-3 top-2 text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-5 rounded-lg border p-4">
        <label className="flex gap-3">
          <Checkbox
            checked={depositEnabled}
            disabled={!draft || !canEdit}
            onCheckedChange={(value) => {
              const nextEnabled = value === true
              setDepositEnabled(nextEnabled)
              if (nextEnabled && depositPercentage === 0) setDepositPercentage(20)
            }}
          />
          <span>
            <span className="font-medium">{de ? "Buchungsanzahlung verlangen" : "Require an advance booking deposit"}</span>
            <span className="block text-sm text-muted-foreground">
              {de ? "Gilt für Banküberweisung und Zahlung bei Abholung. Die Reservierung bleibt ausstehend, bis die Überweisung geprüft wurde." : "Applies to bank transfer and payment at pickup. The reservation remains pending until the transfer is verified."}
            </span>
          </span>
        </label>
        {depositEnabled ? (
          <label className="mt-4 block max-w-xs text-sm">
            <span className="font-medium">{de ? "Anzahlung in Prozent" : "Deposit percentage"}</span>
            <span className="relative mt-2 block">
              <input
                className="w-full rounded-md border bg-background px-3 py-2 pr-10"
                type="number"
                min={0}
                max={100}
                step={1}
                value={depositPercentage}
                disabled={!draft || !canEdit}
                onChange={(event) => setDepositPercentage(Number(event.target.value))}
                onBlur={() => {
                  if (depositPercentage === 0) setDepositEnabled(false)
                }}
              />
              <span className="absolute right-3 top-2 text-muted-foreground">%</span>
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {de ? "Auf 0 % setzen, um die Buchungsanzahlung zu deaktivieren." : "Set this to 0% to disable the booking deposit."}
            </span>
          </label>
        ) : null}
      </div>
      <div className="mt-5 space-y-5">
        {methods.map(({ method, label, description }) => {
          const checked = enabled.includes(method)
          return (
            <div key={method} className="rounded-lg border p-4">
              <label className="flex gap-3">
                <Checkbox
                  checked={checked}
                  disabled={!draft || !canEdit}
                  onCheckedChange={(value) => {
                    const next = value === true ? [...enabled, method] : enabled.filter((item) => item !== method)
                    setEnabled(next)
                    if (!next.includes(defaultMethod) && next[0]) setDefaultMethod(next[0])
                  }}
                />
                <span>
                  <span className="font-medium">{de ? (method === "BANK_TRANSFER" ? "Banküberweisung" : "Barzahlung bei Abholung") : label}</span>
                  <span className="block text-sm text-muted-foreground">{de ? (method === "BANK_TRANSFER" ? "Bank- und Referenzhinweise senden; die Überweisung wird nicht in dieser App verarbeitet." : "Teilen Sie Kunden mit, was sie mitbringen und wo sie bezahlen sollen.") : description}</span>
                </span>
              </label>
              {checked ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {data.supportedLocales.map((locale) => (
                    <label key={locale} className="text-sm">
                      <span className="font-medium">{de ? "Hinweise" : "Instructions"} ({locale})</span>
                      <Textarea
                        className="mt-2 min-h-28"
                        value={instructions[`${method}:${locale}`] ?? ""}
                        onChange={(event) =>
                          setInstructions((current) => ({
                            ...current,
                            [`${method}:${locale}`]: event.target.value,
                          }))
                        }
                        disabled={!draft || !canEdit}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      <label className="mt-5 block max-w-sm text-sm">
        <span className="font-medium">{de ? "Empfohlene Zahlungsart" : "Suggested payment choice"}</span>
        <select className="mt-2 w-full rounded-md border bg-background p-2" value={defaultMethod} onChange={(event) => setDefaultMethod(event.target.value as ManualPaymentMethod)} disabled={!draft || !canEdit}>
          {methods
            .filter(({ method }) => enabled.includes(method))
            .map(({ method, label }) => (
              <option key={method} value={method}>
                {de ? (method === "BANK_TRANSFER" ? "Banküberweisung" : "Barzahlung bei Abholung") : label}
              </option>
            ))}
        </select>
      </label>
      <Button
        className="mt-4"
        disabled={!draft || !canEdit || pending || enabled.length === 0}
        onClick={() =>
          startTransition(async () => {
            if (!draft) return
            const values = enabled.flatMap((method) =>
              data.supportedLocales.map((locale) => ({
                method,
                locale,
                instructions: instructions[`${method}:${locale}`] ?? "",
              })),
            )
            const result = await updateOwnerPaymentDraft({
              versionId: draft.id,
              expectedRevision: draft.revision,
              changeSummary: summary,
              defaultMethod,
              enabledMethods: enabled,
              depositEnabled: depositEnabled && depositPercentage > 0,
              depositPercentage,
              paymentProfile: {
                bankName: profile.bankName,
                accountName: profile.accountName,
                accountNumber: profile.accountNumber,
                swiftCode: profile.swiftCode,
                iban: profile.iban,
                guaranteePercentage: profile.guaranteePercent / 100,
              },
              instructions: values,
            })
            if ("error" in result) {
              setMessage(de ? "Die Zahlungseinstellungen konnten nicht gespeichert werden." : result.error)
              return
            }
            setMessage(de ? "Zahlungseinstellungen gespeichert." : "Payment settings saved.")
            const navigationError = await completeOwnerSetupStep("payments", nextHref, router)
            if (navigationError) setMessage(de ? "Die Zahlungseinstellungen wurden gespeichert, aber der nächste Schritt konnte nicht geöffnet werden." : navigationError)
          })
        }
      >
        {ownerSetupSaveLabel(nextHref, de)}
      </Button>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </section>
  )
}
