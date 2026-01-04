"use client"

import Link from "@/navigation"
import { useState, useEffect } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"
import { CarCard } from "@/components/car-card"
import { BottomNav } from "@/components/bottom-nav"
import { FilterBar } from "@/components/filter-bar"
import { CategoryFilter } from "@/components/category-filter"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ClientOnly } from "@/components/client-only"
import { filterCarsByAvailability } from "@/app/actions/cars"

interface Car {
  id: string
  name: string
  nameDe?: string | null
  category: string
  price: number
  image: string
  status: string
  subtitle?: string | null
  subtitleDe?: string | null
  description?: string | null
  descriptionDe?: string | null
  year: number | null
  specs: {
    gearbox: string
    seats: number
    fuel: string
    acceleration: string
  }
  rating: number
  reviews: number
}

export function CarsClient({
  cars,
  user,
  savedCarIds,
  signInUrl,
}: {
  cars: Car[]
  user: { name: string; email: string; role: string } | null
  savedCarIds: string[]
  signInUrl: string
}) {
  const locale = useLocale()
  const t = useTranslations()
  const searchParams = useSearchParams()
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL")
  const [selectedYear, setSelectedYear] = useState<string>("ALL")
  const [filteredCars, setFilteredCars] = useState(cars)
  const startYear =
    cars.reduce<number | null>((minYear, car) => {
      if (car.year === null) {
        return minYear
      }
      return minYear === null ? car.year : Math.min(minYear, car.year)
    }, null) ?? new Date().getFullYear()

  const pickupDateParam = searchParams.get("pickupDate")
  const dropoffDateParam = searchParams.get("dropoffDate")

  useEffect(() => {
    const filterCars = async () => {
      let filtered = cars.filter((car) => {
        const matchesCategory = selectedCategory === "ALL" || car.category === selectedCategory
        const matchesYear = selectedYear === "ALL" || (car.year !== null && car.year >= parseInt(selectedYear))
        return matchesCategory && matchesYear
      })

      // Filter by date availability if dates are provided
      if (pickupDateParam && dropoffDateParam) {
        const result = await filterCarsByAvailability(
          filtered.map((car) => car.id),
          pickupDateParam,
          dropoffDateParam
        )

        if (result.error) {
          console.error(result.error)
          setFilteredCars(filtered)
          return
        }

        const availableCarIds = new Set(result.availableCarIds || [])
        filtered = filtered.filter((car) => availableCarIds.has(car.id))
      }

      setFilteredCars(filtered)
    }
    filterCars()
  }, [cars, selectedCategory, selectedYear, pickupDateParam, dropoffDateParam])

  const getLocalizedText = (valueEn: string, valueDe?: string | null) => {
    return locale === "de" ? valueDe || valueEn : valueEn
  }

  return (
    <div className="min-h-screen bg-muted pb-20">
      {/* Header */}
      <header className="bg-background px-4 py-4 border-b border-border sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-bold">{t("cars.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("cars.subtitle", { count: filteredCars.length })}</p>
            </div>
          </div>
          <ClientOnly>
            <LanguageSwitcher />
          </ClientOnly>
        </div>
        
        <ClientOnly>
          <FilterBar selectedYear={selectedYear} onYearChange={setSelectedYear} startYear={startYear} />
        </ClientOnly>
      </header>

      {/* Category Filter */}
      <div className="px-4 py-4 bg-background border-b border-border sticky top-[120px] z-10">
        <CategoryFilter selected={selectedCategory} onSelect={setSelectedCategory} />
      </div>

      {/* Cars Grid */}
      <div className="px-4 pt-4">
        {filteredCars.length > 0 ? (
          <div className="space-y-4">
            {filteredCars.map((car) => (
              <CarCard
                key={car.id}
                car={car}
                isSaved={savedCarIds.includes(car.id)}
                isSignedIn={Boolean(user)}
                signInUrl={signInUrl}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">{t("cars.noCars")}</h3>
            <p className="text-muted-foreground text-sm mb-4">{t("cars.adjustFilters")}</p>
            <button
              onClick={() => {
                setSelectedCategory("ALL")
                setSelectedYear("ALL")
              }}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              {t("cars.clearFilters")}
            </button>
          </div>
        )}
      </div>

      <BottomNav active="home" />
    </div>
  )
}
