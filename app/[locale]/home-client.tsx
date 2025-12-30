"use client"

import Link from "@/navigation"
import { useState, useEffect } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"
import { CarCard } from "@/components/car-card"
import { BottomNav } from "@/components/bottom-nav"
import { FilterBar } from "@/components/filter-bar"
import { CategoryFilter } from "@/components/category-filter"
import { DateFilter } from "@/components/date-filter"
import { MobileMenu } from "@/components/mobile-menu"
import { LanguageSwitcher } from "@/components/language-switcher"
import { config } from "@/lib/config"
import { filterCarsByAvailability } from "@/app/actions/cars"
import { useRouter, usePathname } from "@/navigation"

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

export function HomeClient({
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
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL")
  const [selectedYear, setSelectedYear] = useState<string>("ALL")
  const [filteredCars, setFilteredCars] = useState<Car[]>(cars)

  const pickupDateParam = searchParams.get("pickupDate")
  const dropoffDateParam = searchParams.get("dropoffDate")

  const updateDateParams = (pickup: string | null, dropoff: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (pickup) {
      params.set("pickupDate", pickup)
    } else {
      params.delete("pickupDate")
    }
    if (dropoff) {
      params.set("dropoffDate", dropoff)
    } else {
      params.delete("dropoffDate")
    }
    const queryString = params.toString()
    router.push(queryString ? `${pathname}?${queryString}` : pathname)
  }

  const handlePickupDateChange = (date: string | null) => {
    updateDateParams(date, dropoffDateParam)
  }

  const handleDropoffDateChange = (date: string | null) => {
    updateDateParams(pickupDateParam, date)
  }

  const handleClearDates = () => {
    updateDateParams(null, null)
  }

  useEffect(() => {
    const filterCars = async () => {
      let filtered = cars.filter((car) => {
        const matchesCategory = selectedCategory === "ALL" || car.category === selectedCategory
        const matchesYear = selectedYear === "ALL" || (car.year !== null && car.year.toString() === selectedYear)
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
      <header className="bg-background px-4 py-4 flex items-center justify-between border-b border-border">
        <MobileMenu user={user} isAdmin={user?.role === "ADMIN"} signInUrl={signInUrl} isDemoMode={config.isDemoMode} />
        <div className="flex items-center gap-2 text-primary font-semibold">
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
          </svg>
          RentCar
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Link href={user ? "/profile" : signInUrl}>
          <button className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            {user ? (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-semibold">
                {user.name.charAt(0).toUpperCase()}
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-300 to-orange-400" />
            )}
          </button>
        </Link>
        </div>
      </header>

      {/* Hero Section */}
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-3xl font-bold mb-2 text-balance">
          {t("home.title")}
        </h1>
        <p className="text-muted-foreground text-sm mb-4">{t("home.subtitle")}</p>

        {/* Date Filter */}
        <div className="mb-4">
          <DateFilter
            pickupDate={pickupDateParam}
            dropoffDate={dropoffDateParam}
            onPickupDateChange={handlePickupDateChange}
            onDropoffDateChange={handleDropoffDateChange}
            onClear={handleClearDates}
          />
        </div>

        {/* Year Filter */}
        <div className="mb-4">
          <FilterBar selectedYear={selectedYear} onYearChange={setSelectedYear} />
        </div>
      </div>

      {/* Category Filter */}
      <div className="px-4 mb-6">
        <CategoryFilter selected={selectedCategory} onSelect={setSelectedCategory} />
      </div>

      {/* Popular Cars */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t("home.popularCars")}</h2>
          <Link href="/cars" className="text-primary text-sm font-medium">
            {t("common.seeAll")}
          </Link>
        </div>

        <div className="space-y-4">
          {filteredCars.length > 0 ? (
            filteredCars.map((car) => (
              <CarCard
                key={car.id}
                car={car}
                isSaved={savedCarIds.includes(car.id)}
                isSignedIn={Boolean(user)}
                signInUrl={signInUrl}
              />
            ))
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">{t("home.noCarsFound")}</p>
            </div>
          )}
        </div>
      </div>

      <BottomNav active="home" />
    </div>
  )
}
