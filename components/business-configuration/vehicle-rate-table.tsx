"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { updateVehicleRateAction, updateVehicleRatesBulkAction } from "@/app/actions/pricing-configuration"
import { formatAdminMoneyInput } from "@/lib/pricing-admin/money-input"
import type { VehicleRateView } from "@/lib/pricing-admin/types"
import { MoneyInput } from "./money-input"
import { UnsavedChangesWarning } from "./unsaved-changes-warning"
import { useIsMobile } from "@/hooks/use-mobile"

type BulkAction = "COPY_LEGACY" | "COPY_LIVE" | "ENABLE_WEEKLY" | "DISABLE_WEEKLY" | "ENABLE_MONTHLY" | "DISABLE_MONTHLY"

export function VehicleRateTable({ vehicles, fleetRateSetId, revision, currency, canManage }: { vehicles: VehicleRateView[]; fleetRateSetId: string; revision: number; currency: string; canManage: boolean }) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"ALL" | "CHANGED" | "MISSING" | "BLOCKERS">("ALL")
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  const filtered = useMemo(
    () =>
      vehicles.filter((vehicle) => {
        const matchesSearch = `${vehicle.vehicleName} ${vehicle.businessIdentifier}`.toLowerCase().includes(query.toLowerCase())
        if (!matchesSearch) return false
        if (filter === "CHANGED") return vehicle.changedFromLive
        if (filter === "MISSING") return !vehicle.draftRateId || !vehicle.draftDailyRate
        if (filter === "BLOCKERS") return vehicle.issues.some(({ severity }) => severity === "BLOCKER")
        return true
      }),
    [vehicles, query, filter],
  )
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice(page * pageSize, page * pageSize + pageSize)
  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  const bulk = (action: BulkAction) => {
    const labels: Record<BulkAction, string> = {
      COPY_LEGACY: "copy the current car prices",
      COPY_LIVE: "replace the selected working prices with published prices",
      ENABLE_WEEKLY: "enable weekly pricing",
      DISABLE_WEEKLY: "disable weekly pricing and clear weekly amounts",
      ENABLE_MONTHLY: "enable monthly pricing",
      DISABLE_MONTHLY: "disable monthly pricing and clear monthly amounts",
    }
    if (!window.confirm(`This will ${labels[action]} for ${selected.size} car(s). Continue?`)) return
    startTransition(async () => {
      const result = await updateVehicleRatesBulkAction({
        fleetRateSetId,
        expectedRevision: revision,
        vehicleIds: [...selected],
        action,
        confirmed: true,
      })
      setMessage("error" in result ? result.error : `Updated ${result.result.affectedVehicleCount} car(s).`)
      if (!("error" in result)) {
        setSelected(new Set())
        router.refresh()
      }
    })
  }
  return (
    <section className="rounded-xl border bg-background p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">Prices by car</h2>
          <p className="text-sm text-muted-foreground">Enter the amount customers should pay in {currency}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(0)
            }}
            placeholder="Search cars"
            className="w-48"
          />
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as typeof filter)
              setPage(0)
            }}
          >
            <option value="ALL">All cars</option>
            <option value="CHANGED">Changed</option>
            <option value="MISSING">Missing prices</option>
            <option value="BLOCKERS">Needs attention</option>
          </select>
        </div>
      </div>
      {canManage && selected.size > 0 ? (
        <div className="mt-4 rounded-lg border bg-muted/30 p-3">
          <p className="text-sm font-medium">{selected.size} selected</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => bulk("COPY_LEGACY")} disabled={pending}>
              Use current car prices
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk("COPY_LIVE")} disabled={pending}>
              Use published prices
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk("ENABLE_WEEKLY")} disabled={pending}>
              Enable weekly
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk("DISABLE_WEEKLY")} disabled={pending}>
              Disable weekly
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk("ENABLE_MONTHLY")} disabled={pending}>
              Enable monthly
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk("DISABLE_MONTHLY")} disabled={pending}>
              Disable monthly
            </Button>
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{message}</p> : null}
      {isMobile ? (
        <div className="mt-4 space-y-3">
          {visible.map((vehicle) => (
            <VehicleRateMobileEditor key={vehicle.vehicleId} vehicle={vehicle} fleetRateSetId={fleetRateSetId} revision={revision} currency={currency} canManage={canManage} checked={selected.has(vehicle.vehicleId)} onChecked={(checked) => toggle(vehicle.vehicleId, checked)} />
          ))}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <Table className="min-w-[1120px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Select</TableHead>
                <TableHead>Car</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current daily</TableHead>
                <TableHead>New daily</TableHead>
                <TableHead>Weekly</TableHead>
                <TableHead>Monthly</TableHead>
                <TableHead>Readiness</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((vehicle) => (
                <VehicleRateEditor key={vehicle.vehicleId} vehicle={vehicle} fleetRateSetId={fleetRateSetId} revision={revision} currency={currency} canManage={canManage} checked={selected.has(vehicle.vehicleId)} onChecked={(checked) => toggle(vehicle.vehicleId, checked)} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {filtered.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No cars match these filters.</p> : null}
      <div className="mt-4 flex items-center justify-between text-sm">
        <span>
          {filtered.length} car(s) · page {page + 1} of {pageCount}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
            Previous
          </Button>
          <Button size="sm" variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>
            Next
          </Button>
        </div>
      </div>
    </section>
  )
}

function VehicleRateEditor({ vehicle, fleetRateSetId, revision, currency, canManage, checked, onChecked }: { vehicle: VehicleRateView; fleetRateSetId: string; revision: number; currency: string; canManage: boolean; checked: boolean; onChecked: (checked: boolean) => void }) {
  const router = useRouter()
  const [daily, setDaily] = useState(formatAdminMoneyInput(vehicle.draftDailyRate))
  const [weekly, setWeekly] = useState(formatAdminMoneyInput(vehicle.draftWeeklyRate))
  const [monthly, setMonthly] = useState(formatAdminMoneyInput(vehicle.draftMonthlyRate))
  const [weeklyEnabled, setWeeklyEnabled] = useState(vehicle.weeklyRateEnabled)
  const [monthlyEnabled, setMonthlyEnabled] = useState(vehicle.monthlyRateEnabled)
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  const dirty = daily !== formatAdminMoneyInput(vehicle.draftDailyRate) || weekly !== formatAdminMoneyInput(vehicle.draftWeeklyRate) || monthly !== formatAdminMoneyInput(vehicle.draftMonthlyRate) || weeklyEnabled !== vehicle.weeklyRateEnabled || monthlyEnabled !== vehicle.monthlyRateEnabled
  const save = () =>
    startTransition(async () => {
      const result = await updateVehicleRateAction({
        fleetRateSetId,
        expectedRevision: revision,
        vehicleId: vehicle.vehicleId,
        dailyRate: daily,
        weeklyRate: weekly,
        monthlyRate: monthly,
        weeklyRateEnabled: weeklyEnabled,
        monthlyRateEnabled: monthlyEnabled,
      })
      setMessage("error" in result ? result.error : "Saved")
      if (!("error" in result)) router.refresh()
    })
  return (
    <TableRow className={vehicle.changedFromLive ? "bg-blue-50/40" : undefined}>
      <TableCell>
        <Checkbox aria-label={`Select ${vehicle.vehicleName}`} checked={checked} onCheckedChange={(value) => onChecked(value === true)} disabled={!canManage} />
      </TableCell>
      <TableCell>
        <p className="font-medium">{vehicle.vehicleName}</p>
        {vehicle.changedFromLive ? <span className="text-xs font-medium text-blue-700">Unpublished change</span> : null}
      </TableCell>
      <TableCell>
        <span className="text-xs">{vehicle.vehicleStatus.replaceAll("_", " ")}</span>
      </TableCell>
      <TableCell>
        {currency} {formatAdminMoneyInput(vehicle.legacyDailyRate)}
      </TableCell>
      <TableCell>
        <MoneyInput label={`${vehicle.vehicleName} daily price`} currency={currency} value={daily} onChange={setDaily} disabled={!canManage || pending} />
      </TableCell>
      <TableCell>
        <label className="mb-1 flex items-center gap-2 text-xs">
          <Checkbox checked={weeklyEnabled} onCheckedChange={(value) => setWeeklyEnabled(value === true)} disabled={!canManage || pending} /> Offer
        </label>
        <MoneyInput label={`${vehicle.vehicleName} weekly price`} currency={currency} value={weekly} onChange={setWeekly} disabled={!canManage || !weeklyEnabled || pending} />
      </TableCell>
      <TableCell>
        <label className="mb-1 flex items-center gap-2 text-xs">
          <Checkbox checked={monthlyEnabled} onCheckedChange={(value) => setMonthlyEnabled(value === true)} disabled={!canManage || pending} /> Offer
        </label>
        <MoneyInput label={`${vehicle.vehicleName} monthly price`} currency={currency} value={monthly} onChange={setMonthly} disabled={!canManage || !monthlyEnabled || pending} />
      </TableCell>
      <TableCell>
        <p className={vehicle.issues.some(({ severity }) => severity === "BLOCKER") ? "text-xs font-medium text-destructive" : vehicle.issues.length ? "text-xs font-medium text-amber-700" : "text-xs text-emerald-700"}>{vehicle.issues.length ? `${vehicle.issues.length} need attention` : "Ready"}</p>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
        <UnsavedChangesWarning active={dirty} />
      </TableCell>
      <TableCell>
        {canManage ? (
          <Button size="sm" onClick={save} disabled={!dirty || pending}>
            Save
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">View only</span>
        )}
      </TableCell>
    </TableRow>
  )
}

function VehicleRateMobileEditor({ vehicle, fleetRateSetId, revision, currency, canManage, checked, onChecked }: { vehicle: VehicleRateView; fleetRateSetId: string; revision: number; currency: string; canManage: boolean; checked: boolean; onChecked: (checked: boolean) => void }) {
  const router = useRouter()
  const [daily, setDaily] = useState(formatAdminMoneyInput(vehicle.draftDailyRate))
  const [weekly, setWeekly] = useState(formatAdminMoneyInput(vehicle.draftWeeklyRate))
  const [monthly, setMonthly] = useState(formatAdminMoneyInput(vehicle.draftMonthlyRate))
  const [weeklyEnabled, setWeeklyEnabled] = useState(vehicle.weeklyRateEnabled)
  const [monthlyEnabled, setMonthlyEnabled] = useState(vehicle.monthlyRateEnabled)
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  const dirty = daily !== formatAdminMoneyInput(vehicle.draftDailyRate) || weekly !== formatAdminMoneyInput(vehicle.draftWeeklyRate) || monthly !== formatAdminMoneyInput(vehicle.draftMonthlyRate) || weeklyEnabled !== vehicle.weeklyRateEnabled || monthlyEnabled !== vehicle.monthlyRateEnabled
  const save = () =>
    startTransition(async () => {
      const result = await updateVehicleRateAction({
        fleetRateSetId,
        expectedRevision: revision,
        vehicleId: vehicle.vehicleId,
        dailyRate: daily,
        weeklyRate: weekly,
        monthlyRate: monthly,
        weeklyRateEnabled: weeklyEnabled,
        monthlyRateEnabled: monthlyEnabled,
      })
      setMessage("error" in result ? result.error : "Price saved.")
      if (!("error" in result)) router.refresh()
    })

  return (
    <article className={`rounded-xl border p-4 ${vehicle.changedFromLive ? "border-blue-200 bg-blue-50/40" : "bg-background"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{vehicle.vehicleName}</h3>
          <p className="text-xs text-muted-foreground">
            {vehicle.vehicleStatus.replaceAll("_", " ")} · current {currency} {formatAdminMoneyInput(vehicle.legacyDailyRate)}/day
          </p>
        </div>
        <Checkbox aria-label={`Select ${vehicle.vehicleName}`} checked={checked} onCheckedChange={(value) => onChecked(value === true)} disabled={!canManage} />
      </div>
      <div className="mt-4 grid gap-4">
        <MoneyInput label="New daily price" currency={currency} value={daily} onChange={setDaily} disabled={!canManage || pending} />
        <div className="rounded-lg border p-3">
          <label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={weeklyEnabled} onCheckedChange={(value) => setWeeklyEnabled(value === true)} disabled={!canManage || pending} /> Weekly price
          </label>
          <MoneyInput label="Weekly price" currency={currency} value={weekly} onChange={setWeekly} disabled={!canManage || !weeklyEnabled || pending} />
        </div>
        <div className="rounded-lg border p-3">
          <label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={monthlyEnabled} onCheckedChange={(value) => setMonthlyEnabled(value === true)} disabled={!canManage || pending} /> Monthly price
          </label>
          <MoneyInput label="Monthly price" currency={currency} value={monthly} onChange={setMonthly} disabled={!canManage || !monthlyEnabled || pending} />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <p className={vehicle.issues.some(({ severity }) => severity === "BLOCKER") ? "text-xs font-medium text-destructive" : vehicle.issues.length ? "text-xs font-medium text-amber-700" : "text-xs text-emerald-700"}>{vehicle.issues.length ? `${vehicle.issues.length} item(s) need attention` : "Ready"}</p>
          {message ? (
            <p className="text-xs text-muted-foreground" role="status">
              {message}
            </p>
          ) : null}
          <UnsavedChangesWarning active={dirty} />
        </div>
        {canManage ? (
          <Button size="sm" onClick={save} disabled={!dirty || pending}>
            Save price
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Read only</span>
        )}
      </div>
    </article>
  )
}
