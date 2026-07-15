"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { generatePricingPreviewAction } from "@/app/actions/pricing-configuration"
import type { PricingAdminPageData, PricingQuoteView } from "@/lib/pricing-admin/types"
import type { PricingResult } from "@/lib/pricing/types"
import { formatAdminMoneyInput } from "@/lib/pricing-admin/money-input"

export function QuotePreviewPanel({ data }: { data: PricingAdminPageData }) {
  const [vehicleId, setVehicleId] = useState(data.vehicles.find(({ activeForBooking }) => activeForBooking)?.vehicleId ?? "")
  const [pickupAt, setPickupAt] = useState("")
  const [returnAt, setReturnAt] = useState("")
  const [result, setResult] = useState<PricingQuoteView>()
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  const preview = () => startTransition(async () => {
    if (!pickupAt || !returnAt) { setMessage("Choose pickup and return timestamps."); return }
    const response = await generatePricingPreviewAction({ vehicleId, pickupAt: new Date(pickupAt).toISOString(), returnAt: new Date(returnAt).toISOString() })
    if ("error" in response) setMessage(response.error)
    else { setMessage(undefined); setResult(response.result) }
  })
  return <section className="rounded-xl border bg-background p-5"><div><h2 className="font-semibold">Sample quote preview</h2><p className="text-sm text-muted-foreground">Generated on the server by the Phase 3 pricing engine. This is not a booking and browser totals are ignored.</p></div><div className="mt-4 grid gap-3 md:grid-cols-4"><label className="text-sm"><span className="mb-1 block font-medium">Vehicle</span><select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} className="w-full rounded-md border bg-background px-3 py-2">{data.vehicles.filter(({ activeForBooking }) => activeForBooking).map((vehicle) => <option key={vehicle.vehicleId} value={vehicle.vehicleId}>{vehicle.vehicleName}</option>)}</select></label><label className="text-sm"><span className="mb-1 block font-medium">Pickup</span><Input type="datetime-local" value={pickupAt} onChange={(event) => setPickupAt(event.target.value)} /></label><label className="text-sm"><span className="mb-1 block font-medium">Return</span><Input type="datetime-local" value={returnAt} onChange={(event) => setReturnAt(event.target.value)} /></label><div className="flex items-end"><Button onClick={preview} disabled={pending || !vehicleId}>Generate comparison</Button></div></div>{message ? <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{message}</p> : null}{result ? <div className="mt-5 grid gap-4 lg:grid-cols-2"><QuoteCard title="Current live quote" quote={result.live} error={result.liveError} /><QuoteCard title="Proposed draft quote" quote={result.draft} error={result.draftError} /></div> : null}</section>
}

function QuoteCard({ title, quote, error }: { title: string; quote?: PricingResult; error?: string }) {
  if (!quote) return <div className="rounded-lg border p-4"><h3 className="font-medium">{title}</h3><p className="mt-2 text-sm text-destructive">{error ?? "No quote available."}</p></div>
  return <div className="rounded-lg border p-4"><div className="flex justify-between gap-2"><h3 className="font-medium">{title}</h3><span className="text-xs text-muted-foreground">{quote.compatibilityMode === "LEGACY_CAR_PRICE" ? "Legacy compatibility" : "Release-backed"}</span></div><dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><Item label="Chargeable duration" value={`${quote.chargeableDuration.chargeableDays} day(s) · ${quote.chargeableDuration.chargeableDurationMinutes} minutes`} /><Item label="Strategy" value={quote.selectedStrategy.replaceAll("_", " ")} /><Item label="Units" value={`${quote.units.monthly} monthly · ${quote.units.weekly} weekly · ${quote.units.daily} daily`} /><Item label="Rates" value={`D ${formatAdminMoneyInput(quote.sourceDailyRate)} · W ${quote.sourceWeeklyRate == null ? "—" : formatAdminMoneyInput(quote.sourceWeeklyRate)} · M ${quote.sourceMonthlyRate == null ? "—" : formatAdminMoneyInput(quote.sourceMonthlyRate)}`} /><Item label="Subtotal" value={`${quote.currency} ${formatAdminMoneyInput(quote.baseSubtotal)}`} /><Item label="Compatibility tax" value={`${quote.currency} ${formatAdminMoneyInput(quote.taxSubtotal)} (${quote.taxRateBps / 100}%)`} /><Item label="Grand total" value={`${quote.currency} ${formatAdminMoneyInput(quote.grandTotal)}`} /><Item label="Engine" value={quote.pricingEngineVersion} /></dl>{quote.warnings.length ? <ul className="mt-3 list-disc pl-5 text-xs text-amber-700">{quote.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}<details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Exact calculation trace</summary><ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">{quote.trace.steps.map((step, index) => <li key={`${step.code}-${index}`}>{step.message}</li>)}</ol></details></div>
}

function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd>{value}</dd></div> }
