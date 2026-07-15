import { Input } from "@/components/ui/input"

export function MoneyInput({ value, onChange, currency, disabled, label }: { value: string; onChange: (value: string) => void; currency: string; disabled?: boolean; label: string }) {
  const symbol = new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
    .formatToParts(0)
    .find(({ type }) => type === "currency")?.value ?? currency
  return <label className="block text-xs font-medium"><span className="sr-only">{label}</span><span className="flex items-center rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring"><span className="whitespace-nowrap px-2 text-muted-foreground">{symbol} {currency}</span><Input aria-label={label} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="border-0 shadow-none focus-visible:ring-0" placeholder="0.00" /></span></label>
}
