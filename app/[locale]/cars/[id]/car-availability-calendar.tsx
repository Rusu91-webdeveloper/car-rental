"use client"

import { useEffect, useState } from "react"
import { Calendar } from "@/components/ui/calendar"
import { getCarAvailability } from "@/app/actions/cars"
import { useLocale, useTranslations } from "next-intl"
import { businessDayOverlapsRanges, businessTodayLocalDate } from "@/lib/business-date"

interface CarAvailabilityCalendarProps {
  carId: string
}

interface UnavailableDateRange {
  start: Date
  end: Date
}

export function CarAvailabilityCalendar({ carId }: CarAvailabilityCalendarProps) {
  const t = useTranslations()
  const locale = useLocale()
  const [unavailableRanges, setUnavailableRanges] = useState<UnavailableDateRange[]>([])
  const [businessTimeZone, setBusinessTimeZone] = useState("UTC")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAvailability() {
      try {
        setLoading(true)
        setError(null)
        const result = await getCarAvailability(carId)
        
        if (result.error) {
          setError(locale === "de" ? "Die Verfügbarkeit konnte nicht geladen werden." : result.error)
          return
        }

        // Convert dates from ISO strings to Date objects
        const ranges = (result.unavailableDates || []).map((range) => ({
          start: new Date(range.start),
          end: new Date(range.end),
        }))
        
        setUnavailableRanges(ranges)
        setBusinessTimeZone(result.businessTimeZone ?? "UTC")
      } catch (err) {
        console.error("Failed to fetch car availability:", err)
        setError(locale === "de" ? "Die Verfügbarkeit konnte nicht geladen werden." : "Failed to load availability")
      } finally {
        setLoading(false)
      }
    }

    fetchAvailability()
  }, [carId, locale])

  // Check if a date is unavailable
  const isUnavailable = (date: Date): boolean =>
    businessDayOverlapsRanges(date, businessTimeZone, unavailableRanges)

  // Check if a date is available (not in the past and not unavailable)
  const isAvailable = (date: Date): boolean => {
    const today = businessTodayLocalDate(businessTimeZone)
    const dateCopy = new Date(date)
    dateCopy.setHours(0, 0, 0, 0)
    
    return dateCopy >= today && !isUnavailable(dateCopy)
  }

  if (loading) {
    return (
      <div className="mb-6">
        <h2 className="font-semibold mb-3">{t("car.availability")}</h2>
        <div className="p-6 bg-muted rounded-xl flex items-center justify-center">
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-6">
        <h2 className="font-semibold mb-3">{t("car.availability")}</h2>
        <div className="p-6 bg-muted rounded-xl">
          <p className="text-error text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-6">
      <h2 className="font-semibold mb-3">{t("car.availability")}</h2>
      <div className="p-4 bg-muted rounded-xl">
        <div className="flex justify-center">
          <Calendar
            mode="single"
            className="w-fit p-2 [--cell-size:2rem]"
            modifiers={{
              unavailable: (date) => {
                const dateCopy = new Date(date)
                return isUnavailable(dateCopy)
              },
              available: (date) => {
                const dateCopy = new Date(date)
                return isAvailable(dateCopy)
              },
            }}
            modifiersClassNames={{
              unavailable: "!bg-red-100 !text-red-700 hover:!bg-red-200 hover:!text-red-800 dark:!bg-red-900/30 dark:!text-red-400",
              available: "!bg-green-100 !text-green-700 hover:!bg-green-200 hover:!text-green-800 dark:!bg-green-900/30 dark:!text-green-400",
            }}
            disabled={(date) => {
              const today = businessTodayLocalDate(businessTimeZone)
              const dateCopy = new Date(date)
              dateCopy.setHours(0, 0, 0, 0)
              return dateCopy < today
            }}
            classNames={{
              root: "w-fit",
              months: "flex gap-2",
              month: "flex flex-col gap-1.5",
              caption_label: "text-sm font-medium",
              nav: "gap-1",
              button_previous: "h-6 w-6",
              button_next: "h-6 w-6",
              month_caption: "h-6",
              weekdays: "gap-0",
              weekday: "text-xs text-muted-foreground",
              week: "gap-0 mt-0.5",
            }}
          />
        </div>
        <div className="mt-3 flex items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700"></div>
            <span className="text-muted-foreground">{t("car.available")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700"></div>
            <span className="text-muted-foreground">{t("car.unavailable")}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
