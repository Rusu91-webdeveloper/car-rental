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
import { useLocale } from "next-intl"

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

function readyTimeLabel(start: string, minutes: number, de = false): string {
  const total = timeOfDayMinutes(start) + minutes
  const daysLater = Math.floor(total / 1_440)
  const minuteOfDay = total % 1_440
  const time = `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`
  return daysLater === 0 ? time : `${time} ${de ? "am nächsten Tag" : "the next day"}`
}

function TimeWindowEditor({
  label,
  windows,
  disabled,
  onChange,
  de,
}: {
  label: string
  windows: BusinessTimeWindow[]
  disabled: boolean
  onChange: (windows: BusinessTimeWindow[]) => void
  de: boolean
}) {
  const update = (index: number, field: keyof BusinessTimeWindow, value: string) =>
    onChange(windows.map((window, itemIndex) => itemIndex === index ? { ...window, [field]: value } : window))
  return (
    <div className="space-y-2 rounded-lg bg-muted/30 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {windows.map((window, index) => (
        <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <label className="text-xs text-muted-foreground">
            <span className="mb-1 block">{de ? "Von" : "From"}</span>
            <Input type="time" step={900} value={window.opensAt} onChange={(event) => update(index, "opensAt", event.target.value)} disabled={disabled} aria-label={de ? `${label} beginnt` : `${label} opens`} />
          </label>
          <label className="text-xs text-muted-foreground">
            <span className="mb-1 block">{de ? "Bis" : "Until"}</span>
            <Input type="time" step={900} value={window.closesAt} onChange={(event) => update(index, "closesAt", event.target.value)} disabled={disabled} aria-label={de ? `${label} endet` : `${label} closes`} />
          </label>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(windows.filter((_, itemIndex) => itemIndex !== index))} disabled={disabled}>{de ? "Entfernen" : "Remove"}</Button>
        </div>
      ))}
      {windows.length === 0 ? <p className="text-xs text-muted-foreground">{de ? "Keine Kundentermine dieser Art." : "No customer appointments of this type."}</p> : null}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...windows, { ...NEW_WINDOW }])} disabled={disabled || windows.length >= 4}>
        {de ? "Zeitfenster hinzufügen" : "Add window"}
      </Button>
    </div>
  )
}

function liveDaySummary(hours: BusinessDayHours | undefined, de = false) {
  if (!hours) return de ? "Nicht veröffentlicht" : "Not published"
  if (!hours.isOpen) return de ? "Geschlossen" : "Closed"
  const pickup = hours.pickupWindows.map((window) => `${window.opensAt}–${window.closesAt}`).join(", ") || (de ? "keine" : "none")
  const returns = hours.returnWindows.map((window) => `${window.opensAt}–${window.closesAt}`).join(", ") || (de ? "keine" : "none")
  return de ? `Abholung ${pickup}; Rückgabe ${returns}` : `Pickup ${pickup}; return ${returns}`
}

export function BillingRuleForm({ data, canManage, nextHref }: { data: PricingAdminPageData; canManage: boolean; nextHref?: string }) {
  const de = useLocale() === "de"
  const weekdayLabels: Record<BusinessWeekday, string> = de ? {
    MONDAY: "Montag", TUESDAY: "Dienstag", WEDNESDAY: "Mittwoch", THURSDAY: "Donnerstag", FRIDAY: "Freitag", SATURDAY: "Samstag", SUNDAY: "Sonntag",
  } : BUSINESS_WEEKDAY_LABELS
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
        <h2 className="font-semibold">{de ? "Beginnen Sie zuerst mit der Bearbeitung" : "Start editing first"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{de ? "Verwenden Sie oben „Aktuelle Preise bearbeiten“, um diese Optionen freizuschalten." : "Use “Edit current prices” above to unlock these choices."}</p>
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
  const timezoneIssue = isValidTimeZone(timeZone)
    ? undefined
    : de
      ? "Wählen Sie eine gültige IANA-Zeitzone, zum Beispiel Europe/Bucharest."
      : "Choose a valid IANA timezone, for example Europe/Bucharest."
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
          setMessage(de ? "Die Mietregeln konnten nicht gespeichert werden." : result.error)
          return
        }
      }
      setMessage(de ? "Mietregeln gespeichert." : "Rental rules saved.")
      const navigationError = await completeOwnerSetupStep("rental-rules", nextHref, router)
      if (navigationError) setMessage(de ? "Die Mietregeln wurden gespeichert, aber der nächste Schritt konnte nicht geöffnet werden." : navigationError)
    })
  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">{de ? "Grundlegende Buchungsregeln" : "Essential booking rules"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{de ? "Diese Regeln gelten automatisch für jedes Fahrzeug." : "These rules apply automatically to every car."}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field de={de} label={de ? "Mindestbuchungsdauer" : "Minimum booking length"} explanation={de ? "Kunden können mit einer kürzeren Buchung nicht fortfahren." : "Customers cannot continue with a shorter booking."} example={de ? "2 bedeutet mindestens zwei volle Tage." : "2 means at least two full days."} live={display(data.livePricing ? Math.ceil(data.livePricing.configuration.minimumRentalMinutes / 1_440) : undefined, de)}>
            <div className="relative">
              <Input type="number" min={1} max={365} value={minimumBookingDays} onChange={(event) => setMinimumBookingDays(Number(event.target.value))} disabled={!canManage || pending} />
              <span className="pointer-events-none absolute right-3 top-2 text-sm text-muted-foreground">{de ? "Tage" : "days"}</span>
            </div>
          </Field>
          <Field de={de} label={de ? "Steuersatz" : "Tax rate"} explanation={de ? "Der Prozentsatz, der in jedem Mietpreis enthalten ist oder hinzugerechnet wird." : "The percentage included in or added to every rental price."} example={de ? "10 bedeutet 10 %." : "10 means 10%."} live={display(data.livePricing ? data.livePricing.configuration.taxRateBps / 100 : undefined, de)}>
            <div className="relative">
              <Input type="number" min={0} max={100} step="0.01" value={configuration.taxRateBps / 100} onChange={(event) => set("taxRateBps", Math.round(Number(event.target.value) * 100))} disabled={!canManage || pending} />
              <span className="pointer-events-none absolute right-3 top-2 text-sm text-muted-foreground">%</span>
            </div>
          </Field>
        </div>
        <div className="mt-4">
          <Toggle de={de} label={de ? "Fahrzeugpreise enthalten bereits Steuern" : "Car prices already include tax"} description={de ? "Aktivieren, wenn der für jedes Fahrzeug eingegebene Preis die Steuer bereits enthält." : "Turn this on when the price entered for each car already contains tax."} checked={configuration.pricesIncludeTax} onChange={(value) => set("pricesIncludeTax", value)} disabled={!canManage || pending} live={data.livePricing?.configuration.pricesIncludeTax} />
        </div>
      </section>
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">{de ? "Öffnungszeiten für Abholung und Rückgabe" : "Pickup and return opening hours"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {de ? "Beginnen Sie mit einem üblichen Zeitplan und passen Sie anschließend nur abweichende Tage an." : "Start with a common schedule, then adjust only the days that are different."}
        </p>
        <div className="mt-4 rounded-lg border bg-muted/20 p-4">
          <h3 className="text-sm font-semibold">{de ? "Schnelleinrichtung" : "Quick setup"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{de ? "Eine Vorlage ersetzt den Wochenplan unten. Vor dem Speichern können Sie jeden Tag weiter anpassen." : "Applying a preset replaces the weekly schedule below. You can still customize any day before saving."}</p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {SCHEDULE_PRESETS.map((preset) => (
              <Button key={preset.label} type="button" variant="outline" className="h-auto justify-start py-3 text-left" onClick={() => applyPreset(preset)} disabled={openingHoursDisabled}>
                <span><span className="block font-medium">{de ? (preset.openDays.length === 7 ? "Täglich 09:00–18:00" : `Werktags ${preset.opensAt}–${preset.closesAt}`) : preset.label}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{de ? (preset.openDays.length === 7 ? "Gleiche Zeiten an allen Wochentagen" : "Samstag und Sonntag geschlossen") : preset.description}</span></span>
              </Button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="mr-1 text-xs text-muted-foreground">{de ? "Nach der Bearbeitung von Montag:" : "After editing Monday:"}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => copyMondayTo(WEEKDAYS)} disabled={openingHoursDisabled}>{de ? "Montag auf Werktage übertragen" : "Copy Monday to weekdays"}</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => copyMondayTo(BUSINESS_WEEKDAYS)} disabled={openingHoursDisabled}>{de ? "Montag auf alle Tage übertragen" : "Copy Monday to every day"}</Button>
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Field de={de} label={de ? "Geschäftszeitzone" : "Business timezone"} explanation={de ? "Alle Abhol-, Rückgabe- und Sondertagzeiten verwenden diese Zeitzone." : "All pickup, return and special-date times use this timezone."} example="Europe/Bucharest" live={data.liveBusinessTimeZone}>
            <Input list="business-timezones" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} disabled={openingHoursDisabled} aria-invalid={timezoneIssue ? true : undefined} />
            <datalist id="business-timezones">{COMMON_TIME_ZONES.map((zone) => <option key={zone} value={zone} />)}</datalist>
            {timezoneIssue ? <span className="mt-2 block text-xs font-medium text-destructive">{timezoneIssue}</span> : null}
          </Field>
          <Field de={de} label={de ? "Vorbereitung nach der Rückgabe" : "Preparation after return"} explanation={de ? "Zeit für Prüfung, Reinigung und Vorbereitung nach dem verpflichtenden Sicherheitspuffer von einer Stunde." : "Time for inspection, cleaning and preparation, after the mandatory 1-hour safety margin."} example={de ? "120 Minuten ergeben insgesamt eine Sperre von 3 Stunden." : "120 minutes gives a 3-hour total block."} live={display(data.livePricing?.configuration.preparationBufferMinutes, de)}>
            <div className="relative">
              <Input type="number" min={0} max={720} value={configuration.preparationBufferMinutes} onChange={(event) => set("preparationBufferMinutes", Number(event.target.value))} disabled={!canManage || pending} />
              <span className="pointer-events-none absolute right-3 top-2 text-sm text-muted-foreground">{de ? "Minuten" : "minutes"}</span>
            </div>
            <span className="mt-2 block text-xs text-muted-foreground">{de ? `Gesamte Fahrzeugsperre nach der Rückgabe: ${turnaroundMinutes} Minuten.` : `Total vehicle block after return: ${turnaroundMinutes} minutes.`}</span>
          </Field>
          <div className="rounded-lg border bg-muted/20 p-4 text-sm">
            <p className="font-medium">{de ? "Vorschau der Fahrzeugvorbereitung" : "Vehicle turnaround preview"}</p>
            <p className="mt-2 text-muted-foreground">{de ? "Rückgabe um" : "Return at"} 12:00 → {de ? "Fahrzeug bereit um" : "vehicle ready at"} <strong className="text-foreground">{readyTimeLabel("12:00", turnaroundMinutes, de)}</strong></p>
            <p className="mt-1 text-muted-foreground">{de ? "Rückgabe um" : "Return at"} 15:00 → {de ? "Fahrzeug bereit um" : "vehicle ready at"} <strong className="text-foreground">{readyTimeLabel("15:00", turnaroundMinutes, de)}</strong></p>
            <p className="mt-2 text-xs text-muted-foreground">{de ? "Die nächste Abholung wird nur angeboten, wenn das Fahrzeug bereit und das Abholfenster geöffnet ist." : "The next pickup is offered only when the vehicle is ready and the pickup window is open."}</p>
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
                    <Checkbox checked={hours.isOpen} onCheckedChange={(checked) => setDayHours(day, "isOpen", checked === true)} disabled={openingHoursDisabled} aria-label={de ? `${weekdayLabels[day]} geöffnet` : `${BUSINESS_WEEKDAY_LABELS[day]} open`} />
                    {weekdayLabels[day]}
                  </label>
                  <p className="min-w-0 flex-1 text-sm text-muted-foreground">{liveDaySummary(hours, de)}</p>
                  {hours.isOpen ? <Button type="button" variant="outline" size="sm" onClick={() => toggleDayEditor(day)}>{expanded ? (de ? "Fertig" : "Done") : (de ? "Zeiten bearbeiten" : "Edit hours")}</Button> : <span className="text-sm font-medium text-muted-foreground">{de ? "Geschlossen" : "Closed"}</span>}
                </div>
                {issues.length > 0 ? <div className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{de ? "Bitte prüfen Sie die Zeitfenster dieses Tages." : issues.join(" ")}</div> : null}
                {hours.isOpen && expanded ? (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <TimeWindowEditor de={de} label={de ? "Abholfenster" : "Pickup windows"} windows={hours.pickupWindows} disabled={openingHoursDisabled} onChange={(pickupWindows) => setDayHours(day, "pickupWindows", pickupWindows)} />
                    <TimeWindowEditor de={de} label={de ? "Rückgabefenster" : "Return windows"} windows={hours.returnWindows} disabled={openingHoursDisabled} onChange={(returnWindows) => setDayHours(day, "returnWindows", returnWindows)} />
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">{de ? "Derzeit veröffentlicht" : "Currently published"}: {liveDaySummary(live, de)}</p>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {de ? "Fügen Sie für eine Mittagspause ein zweites Zeitfenster hinzu. Nachtzeiten verwenden zwei Kalendertage, zum Beispiel Montag bis 23:59 Uhr und Dienstag ab 00:00 Uhr." : "Add a second window for a lunch break. Overnight hours use two calendar days—for example, Monday until 23:59 and Tuesday from 00:00."}
        </p>
      </section>
      <section className="rounded-xl border bg-background p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{de ? "Feiertage und Ausnahmen für besondere Tage" : "Holiday and special-date exceptions"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{de ? "Schließen Sie einen Tag vollständig oder ersetzen Sie seine normalen Abhol- und Rückgabefenster." : "Close a date completely or replace its normal pickup and return windows."}</p>
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
            {de ? "Besonderen Tag hinzufügen" : "Add special date"}
          </Button>
        </div>
        {openingHoursExceptions.length === 0 ? (
          <p className="mt-4 rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">{de ? "Noch keine besonderen Tage. Es gelten täglich die normalen Wochenzeiten." : "No special dates yet. The normal weekly hours apply every day."}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {openingHoursExceptions.map((exception) => {
              const issues = exceptionIssues(exception, openingHoursExceptions)
              return <div key={exception.id} className="rounded-lg border p-3">
                <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto_auto] md:items-end">
                  <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">{de ? "Datum" : "Date"}</span><Input type="date" value={exception.date} onChange={(event) => updateException(exception.id, { date: event.target.value })} disabled={openingHoursDisabled} /></label>
                  <label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">{de ? "Name" : "Name"}</span><Input value={exception.label ?? ""} placeholder={de ? "Feiertag" : "Public holiday"} onChange={(event) => updateException(exception.id, { label: event.target.value })} disabled={openingHoursDisabled} /></label>
                  <label className="flex h-10 items-center gap-2 text-sm"><Checkbox checked={!exception.isOpen} onCheckedChange={(checked) => updateException(exception.id, { isOpen: checked !== true })} disabled={openingHoursDisabled} />{de ? "Ganztägig geschlossen" : "Closed all day"}</label>
                  <Button type="button" variant="outline" onClick={() => setOpeningHoursExceptions((current) => current.filter((item) => item.id !== exception.id))} disabled={openingHoursDisabled}>{de ? "Entfernen" : "Remove"}</Button>
                </div>
                {issues.length > 0 ? <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{de ? "Bitte prüfen Sie Datum und Zeitfenster dieser Ausnahme." : issues.join(" ")}</div> : null}
                {exception.isOpen ? (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <TimeWindowEditor de={de} label={de ? "Abholfenster" : "Pickup windows"} windows={exception.pickupWindows} disabled={openingHoursDisabled} onChange={(pickupWindows) => updateException(exception.id, { pickupWindows })} />
                    <TimeWindowEditor de={de} label={de ? "Rückgabefenster" : "Return windows"} windows={exception.returnWindows} disabled={openingHoursDisabled} onChange={(returnWindows) => updateException(exception.id, { returnWindows })} />
                  </div>
                ) : null}
              </div>
            })}
          </div>
        )}
      </section>
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">{de ? "Übergabekapazität und Buchungsvorlauf" : "Handover capacity and booking notice"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{de ? "Begrenzen Sie Termine auf die Anzahl, die Ihr Team zuverlässig bearbeiten kann." : "Limit appointments to what the staff at the counter can comfortably process."}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 p-3">
          <span className="mr-1 text-xs text-muted-foreground">{de ? "Schnellauswahl:" : "Quick capacity:"}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => applyStaffCapacity(1)} disabled={openingHoursDisabled}>{de ? "Eine Übergabe gleichzeitig" : "One handover at a time"}</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => applyStaffCapacity(2)} disabled={openingHoursDisabled}>{de ? "Bis zu zwei gleichzeitig" : "Up to two at a time"}</Button>
          <span className="text-xs text-muted-foreground">{de ? "Wählen Sie danach, wie viele Kunden Ihr Team in einem Zeitfenster bedienen kann." : "Choose based on how many customers your team can serve during one time slot."}</span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field de={de} label={de ? "Zeitfenster-Intervall" : "Time-slot interval"} explanation={de ? "Abstand zwischen den Auswahlmöglichkeiten für Kunden." : "Spacing between customer choices."} example={de ? "30 Minuten." : "30 minutes."} live={data.liveHandoverPolicy ? `${data.liveHandoverPolicy.slotIntervalMinutes} ${de ? "Minuten" : "minutes"}` : undefined}>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={handoverPolicy.slotIntervalMinutes} onChange={(event) => setPolicy("slotIntervalMinutes", Number(event.target.value) as HandoverPolicy["slotIntervalMinutes"])} disabled={openingHoursDisabled}>
              <option value={15}>15 {de ? "Minuten" : "minutes"}</option><option value={30}>30 {de ? "Minuten" : "minutes"}</option><option value={60}>60 {de ? "Minuten" : "minutes"}</option>
            </select>
          </Field>
          <Field de={de} label={de ? "Mindestvorlauf" : "Minimum notice"} explanation={de ? "Wie früh Kunden vor der Abholung buchen müssen." : "How early customers must book before pickup."} example={de ? "4 Stunden." : "4 hours."} live={data.liveHandoverPolicy ? `${data.liveHandoverPolicy.minimumLeadTimeMinutes / 60} ${de ? "Stunden" : "hours"}` : undefined}>
            <div className="relative">
              <Input type="number" min={0} max={720} step={0.5} value={handoverPolicy.minimumLeadTimeMinutes / 60} onChange={(event) => setPolicy("minimumLeadTimeMinutes", Math.round(Number(event.target.value) * 60))} disabled={openingHoursDisabled} />
              <span className="pointer-events-none absolute right-3 top-2 text-sm text-muted-foreground">{de ? "Stunden" : "hours"}</span>
            </div>
          </Field>
          <Field de={de} label={de ? "Abholungen pro Zeitfenster" : "Pickups per slot"} explanation={de ? "Maximale Anzahl der Abholtermine in einem Zeitfenster." : "Maximum pickup appointments in one slot."} example={de ? "2 Abholungen." : "2 pickups."} live={display(data.liveHandoverPolicy?.maximumPickupsPerSlot, de)}>
            <Input type="number" min={1} max={100} value={handoverPolicy.maximumPickupsPerSlot} onChange={(event) => setCapacity("maximumPickupsPerSlot", Number(event.target.value))} disabled={openingHoursDisabled} />
          </Field>
          <Field de={de} label={de ? "Rückgaben pro Zeitfenster" : "Returns per slot"} explanation={de ? "Maximale Anzahl der Rückgabetermine in einem Zeitfenster." : "Maximum return appointments in one slot."} example={de ? "3 Rückgaben." : "3 returns."} live={display(data.liveHandoverPolicy?.maximumReturnsPerSlot, de)}>
            <Input type="number" min={1} max={100} value={handoverPolicy.maximumReturnsPerSlot} onChange={(event) => setCapacity("maximumReturnsPerSlot", Number(event.target.value))} disabled={openingHoursDisabled} />
          </Field>
          <Field de={de} label={de ? "Übergaben insgesamt" : "Total handovers"} explanation={de ? "Gemeinsames Limit für Abholungen und Rückgaben pro Zeitfenster." : "Combined pickup and return limit per slot."} example={de ? "4 Übergaben." : "4 handovers."} live={display(data.liveHandoverPolicy?.maximumTotalHandoversPerSlot, de)}>
            <Input type="number" min={Math.max(handoverPolicy.maximumPickupsPerSlot, handoverPolicy.maximumReturnsPerSlot)} max={200} value={handoverPolicy.maximumTotalHandoversPerSlot} onChange={(event) => setPolicy("maximumTotalHandoversPerSlot", Math.max(Number(event.target.value), handoverPolicy.maximumPickupsPerSlot, handoverPolicy.maximumReturnsPerSlot))} disabled={openingHoursDisabled} />
          </Field>
        </div>
      </section>
      <details className="rounded-xl border bg-background p-5">
        <summary className="cursor-pointer font-semibold">{de ? "Erweiterte Mietberechnung" : "Advanced rental calculation"}</summary>
        <p className="mt-2 text-sm text-muted-foreground">{de ? "Für die meisten Unternehmen sind diese Standardwerte geeignet." : "Most businesses can keep these defaults."}</p>
        <div className="mt-4 space-y-5">
          <PricingStrategySelector value={configuration.mixedDurationStrategy} onChange={(value) => set("mixedDurationStrategy", value)} disabled={!canManage || pending} de={de} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Toggle de={de} label={de ? "Wochenpreise verfügbar" : "Weekly pricing available"} description={de ? "Für Fahrzeuge muss weiterhin ein Wochenpreis hinterlegt werden." : "Cars still need a weekly price."} checked={configuration.weeklyPricingEnabled} onChange={(value) => set("weeklyPricingEnabled", value)} disabled={!canManage || pending} live={data.livePricing?.configuration.weeklyPricingEnabled} />
            <Toggle de={de} label={de ? "Monatspreise verfügbar" : "Monthly pricing available"} description={de ? "Für Fahrzeuge muss weiterhin ein Monatspreis hinterlegt werden." : "Cars still need a monthly price."} checked={configuration.monthlyPricingEnabled} onChange={(value) => set("monthlyPricingEnabled", value)} disabled={!canManage || pending} live={data.livePricing?.configuration.monthlyPricingEnabled} />
            <Field de={de} label={de ? "Geschäftszeitzone" : "Business timezone"} explanation={de ? "Wird zur Auslegung von Abhol- und Rückgabezeiten verwendet." : "Used to interpret pickup and return times."} example="Europe/Bucharest" live={data.liveBusinessTimeZone}>
              <Input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} disabled={!canManage || !data.draftRelease || pending} />
            </Field>
            <Field de={de} label={de ? "Was zählt als Miettag?" : "What counts as a rental day?"} explanation={de ? "Wählen Sie, wie angebrochene Tage berechnet werden." : "Choose how partial days are charged."} example={de ? "Jeder begonnene 24-Stunden-Zeitraum." : "Each started 24-hour period."} live={display(data.livePricing?.configuration.billableDayRule, de)}>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={configuration.billableDayRule} onChange={(event) => set("billableDayRule", event.target.value as PricingBillingConfiguration["billableDayRule"])} disabled={!canManage || pending}>
                <option value="STARTED_24_HOUR_PERIODS">{de ? "Jeder begonnene 24-Stunden-Zeitraum" : "Each started 24-hour period"}</option>
                <option value="CALENDAR_DAYS">{de ? "Kalendertage mit Rückgabe-Kulanzzeit" : "Calendar dates with return-time grace"}</option>
                <option value="PICKUP_TIME_BOUNDARY">{de ? "Jedes Überschreiten der Abholuhrzeit" : "Each time the pickup hour passes"}</option>
              </select>
            </Field>
            <Field de={de} label={de ? "Kulanzzeit bei verspäteter Rückgabe" : "Late-return grace period"} explanation={de ? "Minuten, bevor ein weiterer Tag berechnet wird. Dadurch wird die vereinbarte Rückgabezeit niemals verlängert." : "Minutes before another day is charged. This never extends the agreed return time or authorizes continued use."} example={de ? "30 Minuten." : "30 minutes."} live={display(data.livePricing?.configuration.gracePeriodMinutes, de)}>
              <Input type="number" min={0} max={720} value={configuration.gracePeriodMinutes} onChange={(event) => set("gracePeriodMinutes", Number(event.target.value))} disabled={!canManage || pending} />
            </Field>
            <Field de={de} label={de ? "Tage in einem Monatspreis" : "Days in a monthly price"} explanation={de ? "Wählen Sie, ob ein Monatspreis 28 oder 30 Tage umfasst." : "Choose whether a monthly price covers 28 or 30 days."} example={de ? "30 Tage." : "30 days."} live={display(data.livePricing?.configuration.rentalMonthDefinition, de)}>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={configuration.rentalMonthDefinition} onChange={(event) => set("rentalMonthDefinition", event.target.value as "FIXED_28_DAYS" | "FIXED_30_DAYS")} disabled={!canManage || pending}>
                <option value="FIXED_28_DAYS">28 {de ? "Tage" : "days"}</option>
                <option value="FIXED_30_DAYS">30 {de ? "Tage" : "days"}</option>
              </select>
            </Field>
          </div>
        </div>
      </details>
      <section className="rounded-xl border bg-background p-5">
        {scheduleIssues.length > 0 ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-semibold">{de ? "Korrigieren Sie vor dem Speichern diese Zeitplandetails:" : "Fix these schedule details before saving:"}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">{scheduleIssues.map((issue, index) => <li key={`${index}-${issue}`}>{de ? "Bitte prüfen Sie Öffnungszeiten, Kapazität und Zeitzone." : issue}</li>)}</ul>
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          {canManage ? (
            <Button onClick={save} disabled={pending || scheduleIssues.length > 0 || (!dirty && !nextHref)}>
              {ownerSetupSaveLabel(nextHref, de)}
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">{de ? "Nur Lesezugriff" : "View-only access"}</span>
          )}
          <UnsavedChangesWarning active={dirty} />
        </div>
        {message ? <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{message}</p> : null}
      </section>
    </div>
  )
}

function display(value: unknown, de = false) {
  if (value === undefined) return de ? "Nicht konfiguriert" : "Not configured"
  if (de) {
    const labels: Record<string, string> = {
      STARTED_24_HOUR_PERIODS: "begonnene 24-Stunden-Zeiträume",
      CALENDAR_DAYS: "Kalendertage",
      FIXED_28_DAYS: "28 Tage",
    }
    return labels[String(value)] ?? String(value)
  }
  return String(value).replaceAll("_", " ").toLowerCase()
}
function Field({ label, explanation, example, live, children, de = false }: { label: string; explanation: string; example: string; live?: string; children: React.ReactNode; de?: boolean }) {
  return (
    <label className="rounded-lg border p-4 text-sm">
      <span className="font-medium">{label}</span>
      <span className="mt-1 block text-muted-foreground">{explanation}</span>
      <span className="mt-2 block text-xs text-muted-foreground">{de ? "Beispiel" : "Example"}: {example}</span>
      {live ? <span className="my-2 block text-xs text-muted-foreground">{de ? "Aktuell" : "Current"}: {live}</span> : null}
      {children}
    </label>
  )
}
function Toggle({ label, description, checked, onChange, disabled, live, de = false }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; live?: boolean; de?: boolean }) {
  return (
    <label className="flex gap-3 rounded-lg border p-4">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} disabled={disabled} />
      <span>
        <span className="font-medium">{label}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
        <span className="mt-2 block text-xs text-muted-foreground">{de ? "Aktuell" : "Current"}: {live === undefined ? (de ? "Nicht konfiguriert" : "Not configured") : live ? (de ? "Aktiviert" : "Enabled") : (de ? "Deaktiviert" : "Disabled")}</span>
      </span>
    </label>
  )
}
