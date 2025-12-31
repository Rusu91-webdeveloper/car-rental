"use client"

import { useTranslations } from "next-intl"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface FilterBarProps {
  selectedYear: string
  onYearChange: (year: string) => void
  startYear?: number
}

export function FilterBar({ selectedYear, onYearChange, startYear }: FilterBarProps) {
  const t = useTranslations()
  const presentYear = new Date().getFullYear()
  const fromYear = Math.min(startYear ?? presentYear, presentYear)
  const years = Array.from({ length: presentYear - fromYear + 1 }, (_, i) => fromYear + i)

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">{t("filters.year")}</label>
      <Select value={selectedYear} onValueChange={onYearChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t("filters.allYears")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">{t("filters.allYears")}</SelectItem>
          {years.map((year) => (
            <SelectItem key={year} value={year.toString()}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
