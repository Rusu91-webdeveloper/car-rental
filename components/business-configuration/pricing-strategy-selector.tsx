"use client"

import type { PricingBillingConfiguration } from "@/lib/business-configuration/domains"

const strategies = [
  { value: "DAILY_ONLY", label: "Charge every rental day separately", description: "Every billable day uses the daily price.", example: "10 days × €80 = €800" },
  { value: "LONGEST_BLOCKS_THEN_DAYS", label: "Use longer rental periods first", description: "The system uses monthly prices first, then weekly prices, then daily prices.", example: "35 days = 1 month + 5 days" },
  { value: "LOWEST_VALID_TOTAL", label: "Automatically use the lowest valid price", description: "The system compares valid combinations and uses the lowest result.", example: "10 days can use 10 daily rates or 1 week + 3 days" },
] as const

export function PricingStrategySelector({ value, onChange, disabled, de = false }: { value: PricingBillingConfiguration["mixedDurationStrategy"]; onChange: (value: PricingBillingConfiguration["mixedDurationStrategy"]) => void; disabled?: boolean; de?: boolean }) {
  const german = {
    DAILY_ONLY: { label: "Jeden Miettag einzeln berechnen", description: "Für jeden berechneten Tag gilt der Tagespreis.", example: "10 Tage × 80 € = 800 €" },
    LONGEST_BLOCKS_THEN_DAYS: { label: "Längere Mietzeiträume zuerst verwenden", description: "Das System verwendet zuerst Monats-, dann Wochen- und anschließend Tagespreise.", example: "35 Tage = 1 Monat + 5 Tage" },
    LOWEST_VALID_TOTAL: { label: "Automatisch den niedrigsten gültigen Preis verwenden", description: "Das System vergleicht gültige Kombinationen und verwendet den niedrigsten Gesamtpreis.", example: "10 Tage können als 10 Tagessätze oder 1 Woche + 3 Tage berechnet werden" },
  } as const
  return <fieldset><legend className="font-medium">{de ? "Wie sollen gemischte Mietzeiträume berechnet werden?" : "How should mixed rental durations be priced?"}</legend><div className="mt-3 grid gap-3 lg:grid-cols-3">{strategies.map((strategy) => { const content = de ? german[strategy.value] : strategy; return <label key={strategy.value} className={`cursor-pointer rounded-xl border p-4 ${value === strategy.value ? "border-primary bg-primary/5" : ""}`}><input type="radio" className="sr-only" name="strategy" checked={value === strategy.value} onChange={() => onChange(strategy.value)} disabled={disabled} /><span className="font-medium">{content.label}</span><span className="mt-2 block text-sm text-muted-foreground">{content.description}</span><span className="mt-2 block rounded bg-muted/60 p-2 text-xs">{de ? "Beispiel" : "Example"}: {content.example}</span></label>})}</div></fieldset>
}
