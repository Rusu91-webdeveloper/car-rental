"use client"

import { useEffect, useMemo, useState } from "react"
import { useLocale } from "next-intl"
import { Calendar } from "@/components/ui/calendar"
import { getCarAvailability } from "@/app/actions/cars"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, CalendarDays } from "lucide-react"

interface UnavailableRange {
  start: Date
  end: Date
}

function datetimeLocalForDay(day: Date, currentValue: string): string {
  const time = currentValue.split("T")[1] || "10:00"
  const year = day.getFullYear()
  const month = String(day.getMonth() + 1).padStart(2, "0")
  const date = String(day.getDate()).padStart(2, "0")
  return `${year}-${month}-${date}T${time}`
}

export function ManualReservationCalendar({
  carId,
  pickupDate,
  dropoffDate,
  refreshToken,
  onRangeSelect,
  onConflictChange,
}: {
  carId: string
  pickupDate: string
  dropoffDate: string
  refreshToken: string
  onRangeSelect: (pickupDate: string, dropoffDate: string) => void
  onConflictChange: (hasConflict: boolean) => void
}) {
  const locale = useLocale()
  const tr = (english: string, german: string) => (locale === "de" ? german : english)
  const [unavailableRanges, setUnavailableRanges] = useState<UnavailableRange[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!carId) {
      return
    }

    let cancelled = false
    // Reset the visible request state whenever the selected car changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)

    getCarAvailability(carId)
      .then((result) => {
        if (cancelled) return
        if (result.error) {
          setError(result.error)
          setUnavailableRanges([])
          return
        }
        setUnavailableRanges(
          (result.unavailableDates ?? []).map((range) => ({
            start: new Date(range.start),
            end: new Date(range.end),
          })),
        )
      })
      .catch((availabilityError) => {
        if (cancelled) return
        console.error("[ADMIN_RESERVATION_AVAILABILITY_ERROR]", availabilityError)
        setError(locale === "de" ? "Die Verfügbarkeit konnte nicht geladen werden." : "Availability could not be loaded.")
        setUnavailableRanges([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [carId, locale, refreshToken])

  const selectedRange = useMemo(() => {
    const from = new Date(pickupDate)
    const to = new Date(dropoffDate)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return undefined
    return { from, to }
  }, [dropoffDate, pickupDate])

  const hasConflict = useMemo(() => {
    if (!selectedRange) return false
    return unavailableRanges.some(
      (range) => selectedRange.from < range.end && selectedRange.to > range.start,
    )
  }, [selectedRange, unavailableRanges])

  useEffect(() => {
    onConflictChange(hasConflict)
  }, [hasConflict, onConflictChange])

  const isUnavailableDay = (day: Date) => {
    const dayStart = new Date(day)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)
    return unavailableRanges.some((range) => range.start < dayEnd && range.end > dayStart)
  }

  const formatPeriod = (range: UnavailableRange) => {
    const formatter = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Berlin",
    })
    return `${formatter.format(range.start)} – ${formatter.format(range.end)}`
  }

  if (!carId) return null

  return (
    <section className="rounded-xl border border-border bg-muted/20 p-4" aria-labelledby="reservation-calendar-title">
      <div className="mb-3">
        <h3 id="reservation-calendar-title" className="flex items-center gap-2 font-semibold">
          <CalendarDays className="h-4 w-4" />
          {tr("Car booking calendar", "Buchungskalender des Fahrzeugs")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {tr(
            "Days containing booked, blocked or preparation time are red. They remain selectable when another time on that day is free.",
            "Tage mit Buchungs-, Sperr- oder Vorbereitungszeiten sind rot. Sie bleiben auswählbar, wenn eine andere Uhrzeit an diesem Tag frei ist.",
          )}
        </p>
      </div>

      {loading ? (
        <div className="rounded-lg bg-muted p-6 text-center text-sm text-muted-foreground">
          {tr("Loading booked dates…", "Gebuchte Daten werden geladen…")}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{tr("Calendar unavailable", "Kalender nicht verfügbar")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[auto_1fr] lg:items-start">
          <div className="overflow-x-auto rounded-lg border bg-background p-2">
            <Calendar
              key={`${carId}-${refreshToken}`}
              mode="range"
              defaultMonth={selectedRange?.from ?? new Date()}
              selected={selectedRange}
              excludeDisabled
              onSelect={(range) => {
                if (!range?.from) return
                const returnDay = range.to ? new Date(range.to) : new Date(range.from)
                if (!range.to) returnDay.setDate(returnDay.getDate() + 1)
                onRangeSelect(
                  datetimeLocalForDay(range.from, pickupDate),
                  datetimeLocalForDay(returnDay, dropoffDate),
                )
              }}
              disabled={(day) => {
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const candidate = new Date(day)
                candidate.setHours(0, 0, 0, 0)
                return candidate < today
              }}
              modifiers={{ unavailable: isUnavailableDay }}
              modifiersClassNames={{
                unavailable: "!bg-red-100 !text-red-800 dark:!bg-red-950/40 dark:!text-red-300",
              }}
            />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-4 text-xs">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="h-3 w-3 rounded border border-red-300 bg-red-100" />
                {tr("Booked / blocked / preparation", "Gebucht / gesperrt / Vorbereitung")}
              </span>
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="h-3 w-3 rounded bg-primary" />
                {tr("Selected period", "Ausgewählter Zeitraum")}
              </span>
            </div>

            <div>
              <p className="text-sm font-medium">{tr("Unavailable periods (including preparation)", "Nicht verfügbare Zeiträume (einschließlich Vorbereitung)")}</p>
              {unavailableRanges.length === 0 ? (
                <p className="mt-1 text-sm text-emerald-700">
                  {tr("No future bookings or blocks for this car.", "Keine zukünftigen Buchungen oder Sperren für dieses Fahrzeug.")}
                </p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {unavailableRanges.map((range) => (
                    <li key={`${range.start.toISOString()}-${range.end.toISOString()}`} className="rounded-md bg-background px-3 py-2">
                      {formatPeriod(range)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {hasConflict ? (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{tr("This car is already booked", "Dieses Fahrzeug ist bereits gebucht")}</AlertTitle>
          <AlertDescription>
            {tr(
              "The selected period overlaps an existing booking or blocked period. Choose different dates.",
              "Der ausgewählte Zeitraum überschneidet sich mit einer bestehenden Buchung oder Sperre. Wählen Sie andere Daten.",
            )}
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  )
}
