"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { format } from "date-fns"
import { de, enGB } from "date-fns/locale"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CalendarIcon, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface DateFilterProps {
  pickupDate: string | null
  dropoffDate: string | null
  onPickupDateChange: (date: string | null) => void
  onDropoffDateChange: (date: string | null) => void
  onClear: () => void
  compact?: boolean
}

export function DateFilter({
  pickupDate,
  dropoffDate,
  onPickupDateChange,
  onDropoffDateChange,
  onClear,
  compact = false,
}: DateFilterProps) {
  const t = useTranslations()
  const locale = useLocale()
  const dateLocale = locale === "de" ? de : enGB
  const [pickupOpen, setPickupOpen] = useState(false)
  const [dropoffOpen, setDropoffOpen] = useState(false)

  const pickupDateObj = pickupDate ? new Date(pickupDate) : undefined
  const dropoffDateObj = dropoffDate ? new Date(dropoffDate) : undefined
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const handlePickupSelect = (date: Date | undefined) => {
    if (date) {
      const dateStr = format(date, "yyyy-MM-dd")
      onPickupDateChange(dateStr)
      setPickupOpen(false)
      // Auto-open dropoff if pickup is selected
      if (!dropoffDate) {
        setTimeout(() => setDropoffOpen(true), 100)
      }
    }
  }

  const handleDropoffSelect = (date: Date | undefined) => {
    if (date) {
      const dateStr = format(date, "yyyy-MM-dd")
      onDropoffDateChange(dateStr)
      setDropoffOpen(false)
    }
  }

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold text-foreground">{t("filters.dateRange")}</Label>
          {(pickupDate || dropoffDate) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {t("filters.clear")}
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Popover open={pickupOpen} onOpenChange={setPickupOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-medium h-11 border-2 transition-all duration-200",
                  pickupDateObj
                    ? "border-primary bg-primary/5 text-foreground shadow-sm shadow-primary/10 hover:bg-primary/10 hover:border-primary/80"
                    : "border-primary/30 bg-background text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
                )}
              >
                <CalendarIcon className={cn("mr-2 h-4 w-4", pickupDateObj && "text-primary")} />
                {pickupDateObj ? format(pickupDateObj, "PP", { locale: dateLocale }) : t("filters.pickupDate")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={pickupDateObj}
                onSelect={handlePickupSelect}
                disabled={(date) => date < today}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Popover open={dropoffOpen} onOpenChange={setDropoffOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-medium h-11 border-2 transition-all duration-200",
                  dropoffDateObj
                    ? "border-primary bg-primary/5 text-foreground shadow-sm shadow-primary/10 hover:bg-primary/10 hover:border-primary/80"
                    : "border-primary/30 bg-background text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground",
                  !pickupDate && "opacity-60 cursor-not-allowed"
                )}
                disabled={!pickupDate}
              >
                <CalendarIcon className={cn("mr-2 h-4 w-4", dropoffDateObj && "text-primary")} />
                {dropoffDateObj ? format(dropoffDateObj, "PP", { locale: dateLocale }) : t("filters.dropoffDate")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dropoffDateObj}
                onSelect={handleDropoffSelect}
                disabled={(date) => {
                  if (!pickupDateObj) return true
                  return date < pickupDateObj || date < today
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        {(pickupDate || dropoffDate) && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 border border-primary/20">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <p className="text-xs font-medium text-primary">
              {t("filters.showingAvailableCars")}
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">{t("filters.dateRange")}</Label>
        {(pickupDate || dropoffDate) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            {t("filters.clear")}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("filters.pickupDate")}</Label>
          <Popover open={pickupOpen} onOpenChange={setPickupOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal h-11",
                  !pickupDateObj && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {pickupDateObj ? format(pickupDateObj, "PPP", { locale: dateLocale }) : t("filters.selectPickupDate")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={pickupDateObj}
                onSelect={handlePickupSelect}
                disabled={(date) => date < today}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("filters.dropoffDate")}</Label>
          <Popover open={dropoffOpen} onOpenChange={setDropoffOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal h-11",
                  !dropoffDateObj && "text-muted-foreground"
                )}
                disabled={!pickupDate}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dropoffDateObj ? format(dropoffDateObj, "PPP", { locale: dateLocale }) : t("filters.selectDropoffDate")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dropoffDateObj}
                onSelect={handleDropoffSelect}
                disabled={(date) => {
                  if (!pickupDateObj) return true
                  return date < pickupDateObj || date < today
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {(pickupDate || dropoffDate) && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          <CalendarIcon className="h-4 w-4 text-primary" />
          <p className="text-sm text-muted-foreground">
            {t("filters.showingAvailableCars")}
          </p>
        </div>
      )}
    </div>
  )
}
