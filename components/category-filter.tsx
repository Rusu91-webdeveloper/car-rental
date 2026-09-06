"use client"

import { useTranslations } from "next-intl"

const categories = [
  { value: "ALL", labelKey: "all" },
  { value: "SUV", labelKey: "suv" },
  { value: "SEDAN", labelKey: "sedan" },
  { value: "LUXURY", labelKey: "luxury" },
  { value: "ELECTRIC", labelKey: "electric" },
  { value: "EV", labelKey: "ev" },
  { value: "FAMILY_CAR", labelKey: "family_car" },
  { value: "KOMBI", labelKey: "kombi" },
]

interface CategoryFilterProps {
  selected: string
  onSelect: (category: string) => void
}

export function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
  const t = useTranslations("categories")

  return (
    <div className="flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {categories.map((category) => (
        <button
          key={category.value}
          onClick={() => onSelect(category.value)}
          className={`whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition-all ${
            selected === category.value
              ? "bg-primary text-white shadow-md"
              : "border border-border/70 bg-background text-foreground hover:bg-muted/70"
          }`}
        >
          {t(category.labelKey)}
        </button>
      ))}
    </div>
  )
}
