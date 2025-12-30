"use client"

import { useTranslations } from "next-intl"

const categories = [
  { value: "ALL", labelKey: "all" },
  { value: "SUV", labelKey: "suv" },
  { value: "SEDAN", labelKey: "sedan" },
  { value: "LUXURY", labelKey: "luxury" },
  { value: "ELECTRIC", labelKey: "electric" },
  { value: "EV", labelKey: "ev" },
]

interface CategoryFilterProps {
  selected: string
  onSelect: (category: string) => void
}

export function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
  const t = useTranslations("categories")

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
      {categories.map((category) => (
        <button
          key={category.value}
          onClick={() => onSelect(category.value)}
          className={`px-5 py-2.5 rounded-full font-medium text-sm whitespace-nowrap transition-colors ${
            selected === category.value
              ? "bg-primary text-white"
              : "bg-background border-2 border-border text-foreground hover:bg-muted"
          }`}
        >
          {t(category.labelKey)}
        </button>
      ))}
    </div>
  )
}
