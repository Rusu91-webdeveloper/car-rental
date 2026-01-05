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
import { NavigationMenu } from "@/components/navigation-menu"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ClientOnly } from "@/components/client-only"
import { config } from "@/lib/config"
import { formatCents } from "@/lib/money"
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
  const startYear =
    cars.reduce<number | null>((minYear, car) => {
      if (car.year === null) {
        return minYear
      }
      return minYear === null ? car.year : Math.min(minYear, car.year)
    }, null) ?? new Date().getFullYear()

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

  const featuredCar = cars[0]
  const totalCars = cars.length
  const categoryCount = new Set(cars.map((car) => car.category)).size
  const averageRating = cars.length
    ? cars.reduce((sum, car) => sum + car.rating, 0) / cars.length
    : 0
  const numberFormatter = new Intl.NumberFormat(locale)
  const ratingFormatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  const formattedCarCount = numberFormatter.format(totalCars)
  const formattedCategoryCount = numberFormatter.format(categoryCount)
  const formattedRating = ratingFormatter.format(averageRating)
  const featuredName = featuredCar ? getLocalizedText(featuredCar.name, featuredCar.nameDe) : ""
  const featuredSubtitle = featuredCar
    ? getLocalizedText(featuredCar.subtitle ?? "", featuredCar.subtitleDe)
    : ""
  const featuredCategoryKey = featuredCar ? featuredCar.category.toLowerCase() : ""
  const featuredCategoryLabel = featuredCar ? t(`categories.${featuredCategoryKey}` as any) : ""
  const highlightItems = [
    {
      key: "insurance",
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3l7 4v5c0 5-3.5 8.5-7 9.5C8.5 20.5 5 17 5 12V7l7-4z"
          />
        </svg>
      ),
    },
    {
      key: "support",
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 12a8 8 0 0116 0v5a2 2 0 01-2 2h-2m-8 0H6a2 2 0 01-2-2v-5"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 19a4 4 0 008 0" />
        </svg>
      ),
    },
    {
      key: "cancel",
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-muted pb-24">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex items-center justify-between px-4 py-4 max-w-6xl">
          <div className="flex items-center gap-6">
            <NavigationMenu
              user={user}
              isAdmin={user?.role === "ADMIN"}
              signInUrl={signInUrl}
            />
            <Link href="/" className="flex items-center gap-2 text-primary font-semibold">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
              </svg>
              <span className="hidden sm:inline">RentCar</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <ClientOnly>
              <LanguageSwitcher />
            </ClientOnly>
            <Link href={user ? "/profile" : signInUrl}>
              <button className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
                {user ? (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-semibold">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                ) : (
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                )}
              </button>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative">
        <section className="relative overflow-hidden bg-gradient-to-b from-background via-background to-muted/70">
          <div
            className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-20 left-0 h-72 w-72 rounded-full bg-sky-300/20 blur-3xl"
            aria-hidden="true"
          />
          <div className="mx-auto max-w-6xl px-4 pb-10 pt-8">
            <div className="grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                  {t("home.kicker")}
                </div>
                <h1 className="text-4xl font-bold leading-tight text-balance sm:text-5xl lg:text-6xl">
                  {t("home.title")}
                </h1>
                <p className="text-base text-muted-foreground sm:text-lg max-w-xl">
                  {t("home.subtitle")}
                </p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground sm:text-sm">
                  {highlightItems.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1"
                    >
                      <span className="text-primary">{item.icon}</span>
                      <span>{t(`home.highlights.${item.key}` as any)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/cars"
                    className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary-hover"
                  >
                    {t("home.ctaPrimary")}
                  </Link>
                  <Link
                    href="/about"
                    className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                  >
                    {t("home.ctaSecondary")}
                  </Link>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:gap-4">
                  <div className="rounded-2xl border border-border/60 bg-background/80 p-3 shadow-sm">
                    <p className="text-lg font-semibold sm:text-xl">{formattedCarCount}</p>
                    <p className="text-xs text-muted-foreground">{t("home.stats.cars")}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/80 p-3 shadow-sm">
                    <p className="text-lg font-semibold sm:text-xl">{formattedCategoryCount}</p>
                    <p className="text-xs text-muted-foreground">{t("home.stats.categories")}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/80 p-3 shadow-sm">
                    <div className="flex items-center gap-1 text-lg font-semibold sm:text-xl">
                      <span>{formattedRating}</span>
                      <svg className="h-4 w-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.287 3.956c.3.921-.755 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.176 0l-3.37 2.448c-.784.57-1.838-.197-1.539-1.118l1.286-3.956a1 1 0 00-.364-1.118L2.02 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z" />
                      </svg>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("home.stats.rating")}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: "120ms" }}>
                <div className="relative rounded-3xl border-2 border-primary/20 bg-gradient-to-br from-background via-background to-primary/5 p-6 shadow-2xl shadow-primary/10 backdrop-blur-sm transition-all duration-300 hover:shadow-primary/20 hover:border-primary/30">
                  {/* Subtle glow effect */}
                  <div className="pointer-events-none absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-50 blur-xl" aria-hidden="true" />
                  
                  <div className="relative mb-5 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                      <p className="text-base font-bold text-foreground">{t("home.searchTitle")}</p>
                    </div>
                    <p className="text-xs text-muted-foreground pl-3.5">{t("home.searchSubtitle")}</p>
                  </div>
                  <ClientOnly>
                    <DateFilter
                      pickupDate={pickupDateParam}
                      dropoffDate={dropoffDateParam}
                      onPickupDateChange={handlePickupDateChange}
                      onDropoffDateChange={handleDropoffDateChange}
                      onClear={handleClearDates}
                      compact
                    />
                  </ClientOnly>
                  <div className="mt-4">
                    <ClientOnly>
                      <FilterBar selectedYear={selectedYear} onYearChange={setSelectedYear} startYear={startYear} />
                    </ClientOnly>
                  </div>
                </div>

                {featuredCar ? (
                  <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card shadow-lg">
                    <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/15 blur-2xl" aria-hidden="true" />
                    <div className="relative p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          {t("home.featured.title")}
                        </p>
                        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                          {t("home.featured.badge")}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="h-20 w-28 overflow-hidden rounded-2xl bg-muted">
                          <img src={featuredCar.image || "/placeholder.jpg"} alt={featuredName} className="h-full w-full object-cover" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            {featuredCategoryLabel}
                          </p>
                          <p className="text-lg font-semibold">{featuredName}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatCents(featuredCar.price)}{" "}
                            <span className="text-xs">/ {t("car.pricePerDay")}</span>
                          </p>
                        </div>
                      </div>
                      {featuredSubtitle ? (
                        <p className="text-sm text-muted-foreground">{featuredSubtitle}</p>
                      ) : null}
                      <Link
                        href={`/cars/${featuredCar.id}`}
                        className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
                      >
                        {t("common.viewDetails")}
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-2">
          <div className="mx-auto max-w-6xl">
            <CategoryFilter selected={selectedCategory} onSelect={setSelectedCategory} />
          </div>
        </section>

        <section className="px-4 pb-10">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold sm:text-xl">{t("home.popularCars")}</h2>
              <Link href="/cars" className="inline-flex items-center gap-2 text-primary text-sm font-medium">
                {t("common.seeAll")}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            {filteredCars.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredCars.map((car, index) => (
                  <div
                    key={car.id}
                    className="animate-in fade-in slide-in-from-bottom-4"
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <CarCard
                      car={car}
                      isSaved={savedCarIds.includes(car.id)}
                      isSignedIn={Boolean(user)}
                      signInUrl={signInUrl}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-border/70 bg-background/80 p-10 text-center">
                <p className="text-lg font-semibold mb-2">{t("home.noCarsFound")}</p>
                <p className="text-sm text-muted-foreground">{t("home.tryDifferentSearch")}</p>
              </div>
            )}
          </div>
        </section>
      </main>

      <BottomNav active="home" />
    </div>
  )
}
