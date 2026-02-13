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
  const trustHeadline =
    locale === "de" ? "Premium Mobilitat fur Deutschland" : "Premium Mobility for Germany"
  const trustDescription =
    locale === "de"
      ? "Stilvolles Flotten-Design, transparente Preise und schnelle Verfugbarkeit fur Ihre Fahrten."
      : "Elegant fleet design, transparent pricing, and fast availability for your trips."
  const curatedLabel = locale === "de" ? "Kuratiertes Fahrerlebnis" : "Curated Driving Experience"
  const curatedDescription =
    locale === "de"
      ? "Entdecken Sie handverlesene Fahrzeuge fur Business, Urlaub und besondere Momente."
      : "Discover handpicked vehicles for business, holidays, and unforgettable moments."
  const noFeaturedVehicleText =
    locale === "de" ? "Neue Fahrzeuge folgen in Kurze." : "New vehicles are arriving soon."
  const inventoryLabel = locale === "de" ? "Live-Inventar" : "Live Inventory"
  const availabilityLabel =
    locale === "de" ? "Verfugbarkeit fur Ihre Reisedaten" : "Availability for your travel dates"
  const premiumCollectionLabel = locale === "de" ? "Premium Kollektion" : "Premium Collection"
  const ctaBannerTitle =
    locale === "de" ? "Bereit fur Ihre nachste Premium-Fahrt?" : "Ready for your next premium drive?"
  const ctaBannerSubtitle =
    locale === "de"
      ? "Wahlen Sie Ihr Fahrzeug, sichern Sie Ihre Daten und starten Sie stressfrei."
      : "Choose your vehicle, lock your dates, and get on the road with zero friction."
  const ctaBannerButton = locale === "de" ? "Fahrzeugauswahl starten" : "Start Selecting Cars"

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.12),transparent_55%)] pb-24">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-6">
            <NavigationMenu user={user} isAdmin={user?.role === "ADMIN"} signInUrl={signInUrl} />
            <Link href="/" className="group flex items-center gap-2 font-semibold text-primary">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-primary/25 transition-transform group-hover:scale-105">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
                </svg>
              </span>
              <span className="hidden text-lg tracking-tight sm:inline">RentCar</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <ClientOnly>
              <LanguageSwitcher />
            </ClientOnly>
            <Link href={user ? "/profile" : signInUrl}>
              <button className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/70 transition-colors hover:bg-muted">
                {user ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-700 text-sm font-semibold text-white">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                ) : (
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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

      <main className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute right-[-10%] top-[-10%] h-[28rem] w-[28rem] rounded-full bg-primary/15 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute bottom-[-15%] left-[-12%] h-[30rem] w-[30rem] rounded-full bg-sky-300/20 blur-3xl"
          aria-hidden="true"
        />

        <section className="px-4 pb-8 pt-8 sm:pt-10">
          <div className="mx-auto max-w-6xl space-y-8">
            <div className="grid gap-7 lg:grid-cols-[1.1fr,0.9fr]">
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-background/75 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.26em] text-primary">
                  <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                  {t("home.kicker")}
                </div>
                <h1 className="text-balance text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
                  {t("home.title")}
                </h1>
                <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">{t("home.subtitle")}</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{trustHeadline}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{trustDescription}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{curatedLabel}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{curatedDescription}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/cars"
                    className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-primary/30 transition-transform duration-300 hover:-translate-y-0.5 hover:bg-primary-hover"
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

                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-border/60 bg-background/90 p-3 shadow-sm sm:p-4">
                    <p className="text-lg font-bold sm:text-2xl">{formattedCarCount}</p>
                    <p className="text-xs text-muted-foreground">{t("home.stats.cars")}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/90 p-3 shadow-sm sm:p-4">
                    <p className="text-lg font-bold sm:text-2xl">{formattedCategoryCount}</p>
                    <p className="text-xs text-muted-foreground">{t("home.stats.categories")}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/90 p-3 shadow-sm sm:p-4">
                    <div className="flex items-center gap-1 text-lg font-bold sm:text-2xl">
                      <span>{formattedRating}</span>
                      <svg className="h-4 w-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.287 3.956c.3.921-.755 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.176 0l-3.37 2.448c-.784.57-1.838-.197-1.539-1.118l1.286-3.956a1 1 0 00-.364-1.118L2.02 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z" />
                      </svg>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("home.stats.rating")}</p>
                  </div>
                </div>
              </div>

              <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4" style={{ animationDelay: "120ms" }}>
                <div className="relative overflow-hidden rounded-[1.8rem] border border-border/60 bg-card shadow-2xl shadow-primary/15">
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
                  {featuredCar ? (
                    <img
                      src={featuredCar.image || "/placeholder.jpg"}
                      alt={featuredName}
                      className="h-[26rem] w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-[26rem] items-center justify-center bg-muted text-muted-foreground">
                      {noFeaturedVehicleText}
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                    <div className="mb-3 inline-flex rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] backdrop-blur">
                      {t("home.featured.badge")}
                    </div>
                    <h3 className="text-2xl font-bold">{featuredName}</h3>
                    {featuredSubtitle ? <p className="mt-1 text-sm text-white/80">{featuredSubtitle}</p> : null}
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-white/70">{featuredCategoryLabel}</p>
                        <p className="text-xl font-semibold">
                          {featuredCar ? formatCents(featuredCar.price) : ""}
                          <span className="ml-1 text-sm text-white/80">/ {t("car.pricePerDay")}</span>
                        </p>
                      </div>
                      {featuredCar ? (
                        <Link
                          href={`/cars/${featuredCar.id}`}
                          className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90"
                        >
                          {t("common.viewDetails")}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
              <div className="rounded-3xl border border-border/60 bg-background/85 p-5 shadow-xl backdrop-blur">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{inventoryLabel}</p>
                  <h2 className="mt-1 text-xl font-bold">{t("home.searchTitle")}</h2>
                  <p className="text-sm text-muted-foreground">{availabilityLabel}</p>
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

              <div className="rounded-3xl border border-border/60 bg-gradient-to-br from-background to-primary/5 p-5 shadow-lg">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{premiumCollectionLabel}</p>
                <div className="mt-3 space-y-2">
                  {highlightItems.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/70 p-3"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {item.icon}
                      </span>
                      <span className="text-sm font-medium">{t(`home.highlights.${item.key}` as any)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-4">
          <div className="mx-auto max-w-6xl rounded-3xl border border-border/60 bg-background/70 p-2 backdrop-blur">
            <CategoryFilter selected={selectedCategory} onSelect={setSelectedCategory} />
          </div>
        </section>

        <section className="px-4 pb-10">
          <div className="mx-auto max-w-6xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold sm:text-2xl">{t("home.popularCars")}</h2>
              <Link href="/cars" className="inline-flex items-center gap-2 text-primary text-sm font-semibold">
                {t("common.seeAll")}
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
                    style={{ animationDelay: `${index * 55}ms` }}
                  >
                    <CarCard car={car} isSaved={savedCarIds.includes(car.id)} isSignedIn={Boolean(user)} signInUrl={signInUrl} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-border/70 bg-background/80 p-10 text-center">
                <p className="mb-2 text-lg font-semibold">{t("home.noCarsFound")}</p>
                <p className="text-sm text-muted-foreground">{t("home.tryDifferentSearch")}</p>
              </div>
            )}
          </div>
        </section>

        <section className="px-4 pb-10">
          <div className="mx-auto max-w-6xl rounded-3xl border border-primary/20 bg-gradient-to-r from-primary/10 via-sky-100/40 to-transparent p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("home.featured.title")}</p>
                <h3 className="mt-1 text-2xl font-black sm:text-3xl">{ctaBannerTitle}</h3>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">{ctaBannerSubtitle}</p>
              </div>
              <Link
                href="/cars"
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-transform hover:-translate-y-0.5 hover:bg-primary-hover"
              >
                {ctaBannerButton}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <BottomNav active="home" />
    </div>
  )
}
