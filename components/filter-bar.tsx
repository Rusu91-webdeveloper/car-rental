"use client"

import { useTranslations } from "next-intl"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface FilterBarProps {
  selectedYear: string
  onYearChange: (year: string) => void
}

export function FilterBar({ selectedYear, onYearChange }: FilterBarProps) {
  const t = useTranslations()
  const years = Array.from({ length: 26 }, (_, i) => 2000 + i)

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

