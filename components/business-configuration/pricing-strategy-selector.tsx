import type { PricingBillingConfiguration } from "@/lib/business-configuration/domains"

const strategies = [
  { value: "DAILY_ONLY", label: "Charge every rental day separately", description: "Every billable day uses the daily price.", example: "10 days × €80 = €800" },
  { value: "LONGEST_BLOCKS_THEN_DAYS", label: "Use longer rental periods first", description: "The system uses monthly prices first, then weekly prices, then daily prices.", example: "35 days = 1 month + 5 days" },
  { value: "LOWEST_VALID_TOTAL", label: "Automatically use the lowest valid price", description: "The system compares valid combinations and uses the lowest result.", example: "10 days can use 10 daily rates or 1 week + 3 days" },
] as const

export function PricingStrategySelector({ value, onChange, disabled }: { value: PricingBillingConfiguration["mixedDurationStrategy"]; onChange: (value: PricingBillingConfiguration["mixedDurationStrategy"]) => void; disabled?: boolean }) {
  return <fieldset><legend className="font-medium">How should mixed rental durations be priced?</legend><div className="mt-3 grid gap-3 lg:grid-cols-3">{strategies.map((strategy) => <label key={strategy.value} className={`cursor-pointer rounded-xl border p-4 ${value === strategy.value ? "border-primary bg-primary/5" : ""}`}><input type="radio" className="sr-only" name="strategy" checked={value === strategy.value} onChange={() => onChange(strategy.value)} disabled={disabled} /><span className="font-medium">{strategy.label}</span><span className="mt-2 block text-sm text-muted-foreground">{strategy.description}</span><span className="mt-2 block rounded bg-muted/60 p-2 text-xs">Example: {strategy.example}</span></label>)}</div></fieldset>
}
