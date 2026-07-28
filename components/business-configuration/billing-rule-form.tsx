"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { updatePricingRulesAction } from "@/app/actions/pricing-configuration"
import { completeOwnerSetupStep, ownerSetupSaveLabel } from "@/components/admin/complete-owner-setup-step"
import type {
  BusinessDayHours,
  BusinessHoursException,
  BusinessTimeWindow,
  BusinessWeekday,
  HandoverPolicy,
  PricingBillingConfiguration,
  WeeklyOpeningHours,
} from "@/lib/business-configuration/domains"
import type { PricingAdminPageData } from "@/lib/pricing-admin/types"
import { BUSINESS_WEEKDAYS, BUSINESS_WEEKDAY_LABELS, timeOfDayMinutes } from "@/lib/business-hours"
import { PricingStrategySelector } from "./pricing-strategy-selector"
import { UnsavedChangesWarning } from "./unsaved-changes-warning"

const NEW_WINDOW: BusinessTimeWindow = { opensAt: "09:00", closesAt: "18:00" }
const COMMON_TIME_ZONES = [
  "Europe/Bucharest",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Vienna",
  "Europe/Zurich",
  "UTC",
]

type SchedulePreset = {
  label: string
  description: string
  opensAt: string
  closesAt: string
  openDays: readonly BusinessWeekday[]
}

const WEEKDAYS: readonly BusinessWeekday[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]
const SCHEDULE_PRESETS: readonly SchedulePreset[] = [
  { label: "Weekdays 09:00–18:00", description: "Saturday and Sunday closed", opensAt: "09:00", closesAt: "18:00", openDays: WEEKDAYS },
  { label: "Weekdays 08:00–18:00", description: "Saturday and Sunday closed", opensAt: "08:00", closesAt: "18:00", openDays: WEEKDAYS },
  { label: "Every day 09:00–18:00", description: "Same hours all week", opensAt: "09:00", closesAt: "18:00", openDays: BUSINESS_WEEKDAYS },
]

function buildPresetSchedule(preset: SchedulePreset): WeeklyOpeningHours {
  const openDays = new Set(preset.openDays)
  return Object.fromEntries(BUSINESS_WEEKDAYS.map((day) => {
    const isOpen = openDays.has(day)
    const windows = isOpen ? [{ opensAt: preset.opensAt, closesAt: preset.closesAt }] : []
    return [day, {
      isOpen,
      pickupWindows: windows.map((window) => ({ ...window })),
      returnWindows: windows.map((window) => ({ ...window })),
    }]
  })) as WeeklyOpeningHours
}

function windowIssues(label: string, windows: BusinessTimeWindow[]): string[] {
  const issues: string[] = []
  windows.forEach((window, index) => {
    const opensAt = timeOfDayMinutes(window.opensAt)
    const closesAt = timeOfDayMinutes(window.closesAt)
    if (!Number.isFinite(opensAt) || !Number.isFinite(closesAt))
      issues.push(`${label} window ${index + 1} needs both a start and end time.`)
    else if (opensAt >= closesAt)
      issues.push(`${label} window ${index + 1} must end after it starts.`)
  })
  for (let first = 0; first < windows.length; first += 1) {
    for (let second = first + 1; second < windows.length; second += 1) {
      const leftStarts = timeOfDayMinutes(windows[first].opensAt)
      const leftEnds = timeOfDayMinutes(windows[first].closesAt)
      const rightStarts = timeOfDayMinutes(windows[second].opensAt)
      const rightEnds = timeOfDayMinutes(windows[second].closesAt)
      if (![leftStarts, leftEnds, rightStarts, rightEnds].every(Number.isFinite)) continue
      if (leftStarts < rightEnds && rightStarts < leftEnds) {
        issues.push(`${label} windows cannot overlap.`)
        return issues
      }
    }
  }
  return issues
}

function dayIssues(hours: BusinessDayHours): string[] {
  if (!hours.isOpen) return []
  if (hours.pickupWindows.length === 0 && hours.returnWindows.length === 0)
    return ["Add at least one pickup or return window, or mark the day closed."]
  return [
    ...windowIssues("Pickup", hours.pickupWindows),
    ...windowIssues("Return", hours.returnWindows),
  ]
}

function exceptionIssues(exception: BusinessHoursException, all: BusinessHoursException[]): string[] {
  const issues = dayIssues(exception)
  if (!exception.date) issues.unshift("Choose a date for this exception.")
  else if (all.some((item) => item.id !== exception.id && item.date === exception.date))
    issues.unshift("Only one exception can be configured for this date.")
  return issues
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

function readyTimeLabel(start: string, minutes: number): string {
  const total = timeOfDayMinutes(start) + minutes
  const daysLater = Math.floor(total / 1_440)
  const minuteOfDay = total % 1_440
  const time = `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`
  return daysLater === 0 ? time : `${time} the next day`
}

function TimeWindowEditor({
  label,
  windows,
  disabled,
  onChange,
}: {
  label: string
  windows: BusinessTimeWindow[]
  disabled: boolean
  onChange: (windows: BusinessTimeWindow[]) => void
}) {
  const update = (index: number, field: keyof BusinessTimeWindow, value: string) =>
    onChange(windows.map((window, itemIndex) => itemIndex === index ? { ...window, [field]: value } : window))
  return (
    <div className="space-y-2 rounded-lg bg-muted/30 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {windows.map((window, index) => (
        <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <label className="text-xs text-muted-foreground">
            <span className="mb-1 block">From</span>
            <Input type="time" step={900} value={window.opensAt} onChange={(event) => update(index, "opensAt", event.target.value)} disabled={disabled} aria-label={`${label} opens`} />
          </label>
          <label className="text-xs text-muted-foreground">
            <span className="mb-1 block">Until</span>
            <Input type="time" step={900} value={window.closesAt} onChange={(event) => update(index, "closesAt", event.target.value)} disabled={disabled} aria-label={`${label} closes`} />
          </label>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(windows.filter((_, itemIndex) => itemIndex !== index))} disabled={disabled}>Remove</Button>
        </div>
      ))}
      {windows.length === 0 ? <p className="text-xs text-muted-foreground">No customer appointments of this type.</p> : null}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...windows, { ...NEW_WINDOW }])} disabled={disabled || windows.length >= 4}>
        Add window
      </Button>
    </div>
  )
}

function liveDaySummary(hours: BusinessDayHours | undefined) {
  if (!hours) return "Not published"
  if (!hours.isOpen) return "Closed"
  const pickup = hours.pickupWindows.map((window) => `${window.opensAt}–${window.closesAt}`).join(", ") || "none"
  const returns = hours.returnWindows.map((window) => `${window.opensAt}–${window.closesAt}`).join(", ") || "none"
  return `Pickup ${pickup}; return ${returns}`
}

export function BillingRuleForm({ data, canManage, nextHref }: { data: PricingAdminPageData; canManage: boolean; nextHref?: string }) {
  const router = useRouter()
  const draft = data.draftPricing
  const [configuration, setConfiguration] = useState<PricingBillingConfiguration | undefined>(draft?.configuration)
  const [timeZone, setTimeZone] = useState(data.businessTimeZone)
  const [weeklyOpeningHours, setWeeklyOpeningHours] = useState<WeeklyOpeningHours>(() =>
    structuredClone(data.weeklyOpeningHours),
  )
  const [openingHoursExceptions, setOpeningHoursExceptions] = useState<BusinessHoursException[]>(() =>
    structuredClone(data.openingHoursExceptions),
  )
  const [handoverPolicy, setHandoverPolicy] = useState<HandoverPolicy>(() =>
    structuredClone(data.handoverPolicy),
  )
  const [expandedDays, setExpandedDays] = useState<Set<BusinessWeekday>>(() => new Set(["MONDAY"]))
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
  const openingHoursDisabled = !canManage || !data.draftRelease || pending
  const minimumBookingDays = Math.max(1, Math.ceil(configuration.minimumRentalMinutes / 1_440))
  const setMinimumBookingDays = (days: number) => {
    const safeDays = Math.min(365, Math.max(1, Math.round(days) || 1))
    setConfiguration((current) => current ? {
      ...current,
      minimumRentalMinutes: safeDays * 1_440,
      minimumChargeDays: safeDays,
    } : current)
  }
  const dirty = JSON.stringify(configuration) !== JSON.stringify(draft.configuration) ||
    timeZone !== data.businessTimeZone ||
    JSON.stringify(weeklyOpeningHours) !== JSON.stringify(data.weeklyOpeningHours) ||
    JSON.stringify(openingHoursExceptions) !== JSON.stringify(data.openingHoursExceptions) ||
    JSON.stringify(handoverPolicy) !== JSON.stringify(data.handoverPolicy)
  const setDayHours = <K extends keyof WeeklyOpeningHours["MONDAY"]>(
    day: keyof WeeklyOpeningHours,
    field: K,
    value: WeeklyOpeningHours["MONDAY"][K],
  ) => setWeeklyOpeningHours((current) => ({
    ...current,
    [day]: { ...current[day], [field]: value },
  }))
  const setPolicy = <K extends keyof HandoverPolicy>(field: K, value: HandoverPolicy[K]) =>
    setHandoverPolicy((current) => ({ ...current, [field]: value }))
  const setCapacity = (field: "maximumPickupsPerSlot" | "maximumReturnsPerSlot", value: number) =>
    setHandoverPolicy((current) => ({
      ...current,
      [field]: value,
      maximumTotalHandoversPerSlot: Math.max(current.maximumTotalHandoversPerSlot, value),
    }))
  const applyStaffCapacity = (capacity: number) => setHandoverPolicy((current) => ({
    ...current,
    maximumPickupsPerSlot: capacity,
    maximumReturnsPerSlot: capacity,
    maximumTotalHandoversPerSlot: capacity,
  }))
  const updateException = (id: string, update: Partial<BusinessHoursException>) =>
    setOpeningHoursExceptions((current) => current.map((exception) => exception.id === id ? { ...exception, ...update } : exception))
  const toggleDayEditor = (day: BusinessWeekday) => setExpandedDays((current) => {
    const next = new Set(current)
    if (next.has(day)) next.delete(day)
    else next.add(day)
    return next
  })
  const applyPreset = (preset: SchedulePreset) => {
    setWeeklyOpeningHours(buildPresetSchedule(preset))
    setExpandedDays(new Set(["MONDAY"]))
  }
  const copyMondayTo = (days: readonly BusinessWeekday[]) => {
    setWeeklyOpeningHours((current) => {
      const next = structuredClone(current)
      days.forEach((day) => { next[day] = structuredClone(current.MONDAY) })
      return next
    })
  }
  const weeklyIssues = BUSINESS_WEEKDAYS.flatMap((day) =>
    dayIssues(weeklyOpeningHours[day]).map((issue) => `${BUSINESS_WEEKDAY_LABELS[day]}: ${issue}`))
  if (!BUSINESS_WEEKDAYS.some((day) => weeklyOpeningHours[day].isOpen && weeklyOpeningHours[day].pickupWindows.length > 0))
    weeklyIssues.push("Add at least one pickup window during the week.")
  if (!BUSINESS_WEEKDAYS.some((day) => weeklyOpeningHours[day].isOpen && weeklyOpeningHours[day].returnWindows.length > 0))
    weeklyIssues.push("Add at least one return window during the week.")
  const specialDateIssues = openingHoursExceptions.flatMap((exception) =>
    exceptionIssues(exception, openingHoursExceptions).map((issue) => `${exception.label || exception.date || "Special date"}: ${issue}`))
  const timezoneIssue = isValidTimeZone(timeZone) ? undefined : "Choose a valid IANA timezone, for example Europe/Bucharest."
  const capacityIssues = [
    !Number.isInteger(handoverPolicy.maximumPickupsPerSlot) || handoverPolicy.maximumPickupsPerSlot < 1 || handoverPolicy.maximumPickupsPerSlot > 100
      ? "Pickup capacity must be a whole number between 1 and 100."
      : undefined,
    !Number.isInteger(handoverPolicy.maximumReturnsPerSlot) || handoverPolicy.maximumReturnsPerSlot < 1 || handoverPolicy.maximumReturnsPerSlot > 100
      ? "Return capacity must be a whole number between 1 and 100."
      : undefined,
    !Number.isInteger(handoverPolicy.maximumTotalHandoversPerSlot) || handoverPolicy.maximumTotalHandoversPerSlot > 200 ||
      handoverPolicy.maximumTotalHandoversPerSlot < Math.max(handoverPolicy.maximumPickupsPerSlot, handoverPolicy.maximumReturnsPerSlot)
      ? "Total handovers must be at least as high as the pickup and return limits."
      : undefined,
    !Number.isInteger(handoverPolicy.minimumLeadTimeMinutes) || handoverPolicy.minimumLeadTimeMinutes < 0 || handoverPolicy.minimumLeadTimeMinutes > 43_200
      ? "Minimum notice must be between 0 and 720 hours."
      : undefined,
  ].filter((issue): issue is string => Boolean(issue))
  const scheduleIssues = [...weeklyIssues, ...specialDateIssues, ...capacityIssues, ...(timezoneIssue ? [timezoneIssue] : [])]
  const turnaroundMinutes = 60 + configuration.preparationBufferMinutes
  const save = () =>
    startTransition(async () => {
      if (dirty) {
        const result = await updatePricingRulesAction({
          pricingVersionId: draft.id,
          expectedRevision: draft.revision,
          configuration,
          changeSummary,
          businessTimeZone: timeZone,
          weeklyOpeningHours,
          openingHoursExceptions,
          handoverPolicy,
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
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">Pickup and return opening hours</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Start with a common schedule, then adjust only the days that are different.
        </p>
        <div className="mt-4 rounded-lg border bg-muted/20 p-4">
          <h3 className="text-sm font-semibold">Quick setup</h3>
          <p className="mt-1 text-xs text-muted-foreground">Applying a preset replaces the weekly schedule below. You can still customize any day before saving.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {SCHEDULE_PRESETS.map((preset) => (
              <Button key={preset.label} type="button" variant="outline" className="h-auto justify-start py-3 text-left" onClick={() => applyPreset(preset)} disabled={openingHoursDisabled}>
                <span><span className="block font-medium">{preset.label}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{preset.description}</span></span>
              </Button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="mr-1 text-xs text-muted-foreground">After editing Monday:</span>
            <Button type="button" variant="outline" size="sm" onClick={() => copyMondayTo(WEEKDAYS)} disabled={openingHoursDisabled}>Copy Monday to weekdays</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => copyMondayTo(BUSINESS_WEEKDAYS)} disabled={openingHoursDisabled}>Copy Monday to every day</Button>
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Field label="Business timezone" explanation="All pickup, return and special-date times use this timezone." example="Europe/Bucharest" live={data.liveBusinessTimeZone}>
            <Input list="business-timezones" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} disabled={openingHoursDisabled} aria-invalid={timezoneIssue ? true : undefined} />
            <datalist id="business-timezones">{COMMON_TIME_ZONES.map((zone) => <option key={zone} value={zone} />)}</datalist>
            {timezoneIssue ? <span className="mt-2 block text-xs font-medium text-destructive">{timezoneIssue}</span> : null}
          </Field>
          <Field label="Preparation after return" explanation="Time for inspection, cleaning and preparation, after the mandatory 1-hour safety margin." example="120 minutes gives a 3-hour total block." live={display(data.livePricing?.configuration.preparationBufferMinutes)}>
            <div className="relative">
              <Input type="number" min={0} max={720} value={configuration.preparationBufferMinutes} onChange={(event) => set("preparationBufferMinutes", Number(event.target.value))} disabled={!canManage || pending} />
              <span className="pointer-events-none absolute right-3 top-2 text-sm text-muted-foreground">minutes</span>
            </div>
            <span className="mt-2 block text-xs text-muted-foreground">Total vehicle block after return: {turnaroundMinutes} minutes.</span>
          </Field>
          <div className="rounded-lg border bg-muted/20 p-4 text-sm">
            <p className="font-medium">Vehicle turnaround preview</p>
            <p className="mt-2 text-muted-foreground">Return at 12:00 → vehicle ready at <strong className="text-foreground">{readyTimeLabel("12:00", turnaroundMinutes)}</strong></p>
            <p className="mt-1 text-muted-foreground">Return at 15:00 → vehicle ready at <strong className="text-foreground">{readyTimeLabel("15:00", turnaroundMinutes)}</strong></p>
            <p className="mt-2 text-xs text-muted-foreground">The next pickup is offered only when the vehicle is ready and the pickup window is open.</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {BUSINESS_WEEKDAYS.map((day) => {
            const hours = weeklyOpeningHours[day]
            const live = data.liveWeeklyOpeningHours?.[day]
            const issues = dayIssues(hours)
            const expanded = expandedDays.has(day)
            return (
              <div key={day} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex min-w-36 items-center gap-2 text-sm font-medium">
                    <Checkbox checked={hours.isOpen} onCheckedChange={(checked) => setDayHours(day, "isOpen", checked === true)} disabled={openingHoursDisabled} aria-label={`${BUSINESS_WEEKDAY_LABELS[day]} open`} />
                    {BUSINESS_WEEKDAY_LABELS[day]}
                  </label>
                  <p className="min-w-0 flex-1 text-sm text-muted-foreground">{liveDaySummary(hours)}</p>
                  {hours.isOpen ? <Button type="button" variant="outline" size="sm" onClick={() => toggleDayEditor(day)}>{expanded ? "Done" : "Edit hours"}</Button> : <span className="text-sm font-medium text-muted-foreground">Closed</span>}
                </div>
                {issues.length > 0 ? <div className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{issues.join(" ")}</div> : null}
                {hours.isOpen && expanded ? (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <TimeWindowEditor label="Pickup windows" windows={hours.pickupWindows} disabled={openingHoursDisabled} onChange={(pickupWindows) => setDayHours(day, "pickupWindows", pickupWindows)} />
                    <TimeWindowEditor label="Return windows" windows={hours.returnWindows} disabled={openingHoursDisabled} onChange={(returnWindows) => setDayHours(day, "returnWindows", returnWindows)} />
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">Currently published: {liveDaySummary(live)}</p>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Add a second window for a lunch break. Overnight hours use two calendar days—for example, Monday until 23:59 and Tuesday from 00:00.
        </p>
      </section>
      <section className="rounded-xl border bg-background p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Holiday and special-date exceptions</h2>
            <p className="mt-1 text-sm text-muted-foreground">Close a date completely or replace its normal pickup and return windows.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpeningHoursExceptions((current) => [...current, {
              id: crypto.randomUUID(),
              date: "",
              label: "",
              isOpen: false,
              pickupWindows: [{ ...NEW_WINDOW }],
              returnWindows: [{ ...NEW_WINDOW }],
            }])}
            disabled={openingHoursDisabled}
          >
            Add special date
          </Button>
        </div>
        {openingHoursExceptions.length === 0 ? (
          <p className="mt-4 rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">No special dates yet. The normal weekly hours apply every day.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {openingHoursExceptions.map((exception) => {
              const issues = exceptionIssues(exception, openingHoursExceptions)
              return <div key={exception.id} className="rounded-lg border p-3">
                <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto_auto] md:items-end">
                  <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Date</span><Input type="date" value={exception.date} onChange={(event) => updateException(exception.id, { date: event.target.value })} disabled={openingHoursDisabled} /></label>
                  <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Name</span><Input value={exception.label ?? ""} placeholder="Public holiday" onChange={(event) => updateException(exception.id, { label: event.target.value })} disabled={openingHoursDisabled} /></label>
                  <label className="flex h-10 items-center gap-2 text-sm"><Checkbox checked={!exception.isOpen} onCheckedChange={(checked) => updateException(exception.id, { isOpen: checked !== true })} disabled={openingHoursDisabled} />Closed all day</label>
                  <Button type="button" variant="outline" onClick={() => setOpeningHoursExceptions((current) => current.filter((item) => item.id !== exception.id))} disabled={openingHoursDisabled}>Remove</Button>
                </div>
                {issues.length > 0 ? <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{issues.join(" ")}</div> : null}
                {exception.isOpen ? (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <TimeWindowEditor label="Pickup windows" windows={exception.pickupWindows} disabled={openingHoursDisabled} onChange={(pickupWindows) => updateException(exception.id, { pickupWindows })} />
                    <TimeWindowEditor label="Return windows" windows={exception.returnWindows} disabled={openingHoursDisabled} onChange={(returnWindows) => updateException(exception.id, { returnWindows })} />
                  </div>
                ) : null}
              </div>
            })}
          </div>
        )}
      </section>
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">Handover capacity and booking notice</h2>
        <p className="mt-1 text-sm text-muted-foreground">Limit appointments to what the staff at the counter can comfortably process.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 p-3">
          <span className="mr-1 text-xs text-muted-foreground">Quick capacity:</span>
          <Button type="button" variant="outline" size="sm" onClick={() => applyStaffCapacity(1)} disabled={openingHoursDisabled}>One handover at a time</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => applyStaffCapacity(2)} disabled={openingHoursDisabled}>Up to two at a time</Button>
          <span className="text-xs text-muted-foreground">Choose based on how many customers your team can serve during one time slot.</span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Time-slot interval" explanation="Spacing between customer choices." example="30 minutes." live={data.liveHandoverPolicy ? `${data.liveHandoverPolicy.slotIntervalMinutes} minutes` : undefined}>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={handoverPolicy.slotIntervalMinutes} onChange={(event) => setPolicy("slotIntervalMinutes", Number(event.target.value) as HandoverPolicy["slotIntervalMinutes"])} disabled={openingHoursDisabled}>
              <option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>60 minutes</option>
            </select>
          </Field>
          <Field label="Minimum notice" explanation="How early customers must book before pickup." example="4 hours." live={data.liveHandoverPolicy ? `${data.liveHandoverPolicy.minimumLeadTimeMinutes / 60} hours` : undefined}>
            <div className="relative">
              <Input type="number" min={0} max={720} step={0.5} value={handoverPolicy.minimumLeadTimeMinutes / 60} onChange={(event) => setPolicy("minimumLeadTimeMinutes", Math.round(Number(event.target.value) * 60))} disabled={openingHoursDisabled} />
              <span className="pointer-events-none absolute right-3 top-2 text-sm text-muted-foreground">hours</span>
            </div>
          </Field>
          <Field label="Pickups per slot" explanation="Maximum pickup appointments in one slot." example="2 pickups." live={display(data.liveHandoverPolicy?.maximumPickupsPerSlot)}>
            <Input type="number" min={1} max={100} value={handoverPolicy.maximumPickupsPerSlot} onChange={(event) => setCapacity("maximumPickupsPerSlot", Number(event.target.value))} disabled={openingHoursDisabled} />
          </Field>
          <Field label="Returns per slot" explanation="Maximum return appointments in one slot." example="3 returns." live={display(data.liveHandoverPolicy?.maximumReturnsPerSlot)}>
            <Input type="number" min={1} max={100} value={handoverPolicy.maximumReturnsPerSlot} onChange={(event) => setCapacity("maximumReturnsPerSlot", Number(event.target.value))} disabled={openingHoursDisabled} />
          </Field>
          <Field label="Total handovers" explanation="Combined pickup and return limit per slot." example="4 handovers." live={display(data.liveHandoverPolicy?.maximumTotalHandoversPerSlot)}>
            <Input type="number" min={Math.max(handoverPolicy.maximumPickupsPerSlot, handoverPolicy.maximumReturnsPerSlot)} max={200} value={handoverPolicy.maximumTotalHandoversPerSlot} onChange={(event) => setPolicy("maximumTotalHandoversPerSlot", Math.max(Number(event.target.value), handoverPolicy.maximumPickupsPerSlot, handoverPolicy.maximumReturnsPerSlot))} disabled={openingHoursDisabled} />
          </Field>
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
                <option value="CALENDAR_DAYS">Calendar dates with return-time grace</option>
                <option value="PICKUP_TIME_BOUNDARY">Each time the pickup hour passes</option>
              </select>
            </Field>
            <Field label="Late-return grace period" explanation="Minutes before another day is charged. This never extends the agreed return time or authorizes continued use." example="30 minutes." live={display(data.livePricing?.configuration.gracePeriodMinutes)}>
              <Input type="number" min={0} max={720} value={configuration.gracePeriodMinutes} onChange={(event) => set("gracePeriodMinutes", Number(event.target.value))} disabled={!canManage || pending} />
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
        {scheduleIssues.length > 0 ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-semibold">Fix these schedule details before saving:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">{scheduleIssues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul>
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          {canManage ? (
            <Button onClick={save} disabled={pending || scheduleIssues.length > 0 || (!dirty && !nextHref)}>
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
