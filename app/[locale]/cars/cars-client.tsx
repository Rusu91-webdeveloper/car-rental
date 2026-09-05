"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"
import { CarCard } from "@/components/car-card"
import { BottomNav } from "@/components/bottom-nav"
import { FilterBar } from "@/components/filter-bar"
import { CategoryFilter } from "@/components/category-filter"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ClientOnly } from "@/components/client-only"
import { BrandMark } from "@/components/brand-mark"
import { filterCarsByAvailability } from "@/app/actions/cars"

interface Car {
  id: string
  name: string
  nameDe?: string | null
  category: string
  price: number | null
  pricingPublished: boolean
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
  const availableCarCount = filteredCars.filter(
    (car) => car.pricingPublished && (car.status === "AVAILABLE" || car.status === "LOW_STOCK"),
  ).length

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
          setFilteredCars([])
          return
        }

        const availableCarIds = new Set(result.availableCarIds || [])
        filtered = filtered.filter((car) => availableCarIds.has(car.id))
      }

      setFilteredCars(filtered)
    }
    filterCars()
  }, [cars, selectedCategory, selectedYear, pickupDateParam, dropoffDateParam])

  return (
    <div className="qujo-page pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-[#f8f7f2]/90 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-5">
              <BrandMark />
              <span className="hidden h-9 w-px bg-black/10 sm:block" />
              <div>
                <h1 className="text-lg font-bold sm:text-xl">{t("cars.title")}</h1>
                <p className="text-sm text-muted-foreground">{t("cars.subtitle", { count: availableCarCount })}</p>
              </div>
            </div>
            <ClientOnly>
              <LanguageSwitcher />
            </ClientOnly>
          </div>

          <div className="rounded-2xl border border-black/[0.07] bg-white p-3 shadow-sm">
            <ClientOnly>
              <FilterBar selectedYear={selectedYear} onYearChange={setSelectedYear} startYear={startYear} />
            </ClientOnly>
          </div>
        </div>
      </header>

      {/* Category Filter */}
      <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
        <div className="rounded-2xl border border-black/[0.07] bg-white p-2 shadow-sm">
          <CategoryFilter selected={selectedCategory} onSelect={setSelectedCategory} />
        </div>
      </div>

      {/* Cars Grid */}
      <div className="mx-auto w-full max-w-7xl px-4 pt-5 sm:px-6">
        {filteredCars.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 pb-4 sm:grid-cols-2 xl:grid-cols-3">
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
          <div className="rounded-2xl border border-border/70 bg-card/85 py-14 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <svg className="h-8 w-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold">{t("cars.noCars")}</h3>
            <p className="mb-4 text-sm text-muted-foreground">{t("cars.adjustFilters")}</p>
            <button
              onClick={() => {
                setSelectedCategory("ALL")
                setSelectedYear("ALL")
              }}
              className="rounded-lg bg-primary px-4 py-2 text-white transition-colors hover:bg-primary/90"
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
