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
import { BrandMark } from "@/components/brand-mark"
import { formatCents } from "@/lib/money"
import { filterCarsByAvailability } from "@/app/actions/cars"
import { useRouter, usePathname } from "@/navigation"

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

export function HomeClient({
  cars,
  user,
  savedCarIds,
  signInUrl,
  pickupLocation,
  businessTimeZone,
}: {
  cars: Car[]
  user: { name: string; email: string; role: string } | null
  savedCarIds: string[]
  signInUrl: string
  pickupLocation: string | null
  businessTimeZone: string
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

  const getLocalizedText = (valueEn: string, valueDe?: string | null) => {
    return locale === "de" ? valueDe || valueEn : valueEn
  }

  const featuredCar = cars[0]
  const bookableCars = cars.filter(
    (car) => car.pricingPublished && (car.status === "AVAILABLE" || car.status === "LOW_STOCK"),
  )
  const totalCars = bookableCars.length
  const categoryCount = new Set(bookableCars.map((car) => car.category)).size
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
  const featuredCategoryLabel = featuredCar ? t(`categories.${featuredCategoryKey}`) : ""
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
  const trustHeadline = locale === "de" ? "Verlässlich unterwegs" : "Reliable on every journey"
  const trustDescription =
    locale === "de"
      ? "Gepflegte Fahrzeuge, nachvollziehbare Preise und ein persönlicher Ansprechpartner."
      : "Well-kept vehicles, understandable pricing and a personal point of contact."
  const curatedLabel = locale === "de" ? "Für Ihren Anlass" : "Made for your plans"
  const curatedDescription =
    locale === "de"
      ? "Passende Fahrzeuge für Business, Alltag, Urlaub und besondere Momente."
      : "The right vehicles for business, everyday life, holidays and special moments."
  const noFeaturedVehicleText =
    locale === "de" ? "Neue Fahrzeuge folgen in Kürze." : "New vehicles are arriving soon."
  const inventoryLabel = locale === "de" ? "Ihre Mietdaten" : "Your rental dates"
  const availabilityLabel =
    locale === "de" ? "Verfügbarkeit für Ihren gewünschten Zeitraum" : "Availability for your preferred dates"
  const premiumCollectionLabel = locale === "de" ? "Darauf können Sie zählen" : "What you can count on"
  const ctaBannerTitle =
    locale === "de" ? "Bereit für Ihre nächste Fahrt?" : "Ready for your next drive?"
  const ctaBannerSubtitle =
    locale === "de"
      ? "Wählen Sie Ihr Fahrzeug und senden Sie Ihre Buchungsanfrage in wenigen Schritten."
      : "Choose your vehicle and send your booking request in just a few steps."
  const ctaBannerButton = locale === "de" ? "Fahrzeug auswählen" : "Choose a vehicle"
  const mobileLocationLabel = locale === "de" ? "Abholort" : "Pick-up location"
  const mobileLocation =
    pickupLocation ??
    (locale === "de" ? "Abholdetails bei der Buchung" : "Pick-up details confirmed during booking")
  const mobileSearchLabel = locale === "de" ? "Verfügbare Fahrzeuge finden" : "Find available cars"
  const mobileCategoryOptions = [
    { value: "ALL", label: t("categories.all") },
    { value: "SUV", label: t("categories.suv") },
    { value: "LUXURY", label: t("categories.luxury") },
    { value: "ELECTRIC", label: t("categories.electric") },
  ]

  const scrollToInventory = () => {
    document.getElementById("available-cars")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div className="qujo-page pb-24">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#13251d]/95 backdrop-blur-xl md:border-black/[0.06] md:bg-[#f8f7f2]/90">
        <div className="qujo-container flex h-[4.6rem] items-center justify-between">
          <BrandMark inverted className="md:hidden" />
          <BrandMark className="hidden md:inline-flex" />

          <nav className="hidden items-center gap-7 text-sm font-semibold md:flex" aria-label={t("navigation.primary")}>
            <Link href="/cars" className="text-foreground/65 transition-colors hover:text-foreground">
              {t("navigation.cars")}
            </Link>
            <Link href="/about" className="text-foreground/65 transition-colors hover:text-foreground">
              {t("navigation.about")}
            </Link>
            <Link href="/help" className="text-foreground/65 transition-colors hover:text-foreground">
              {t("navigation.help")}
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <ClientOnly>
              <LanguageSwitcher />
            </ClientOnly>
            <Link href={user ? "/profile" : signInUrl} className="hidden sm:block">
              <button className="flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-3.5 text-sm font-semibold transition-colors hover:border-black/20 hover:bg-[#f3f1e9]">
                {user ? (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                ) : (
                  <span>{locale === "de" ? "Anmelden" : "Sign in"}</span>
                )}
              </button>
            </Link>
            <NavigationMenu user={user} isAdmin={user?.role === "ADMIN"} signInUrl={signInUrl} />
          </div>
        </div>
      </header>

      <main className="relative overflow-hidden">
        <section className="relative overflow-hidden bg-[#13251d] pb-20 text-white md:hidden">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%]" aria-hidden="true">
            {featuredCar ? (
              <img
                src={featuredCar.image || "/placeholder.jpg"}
                alt=""
                className="h-full w-full object-cover object-center"
              />
            ) : (
              <div className="h-full w-full bg-[#1a3026]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-[#13251d] via-[#13251d]/35 to-black/15" />
          </div>

          <div className="relative mx-auto min-h-[43rem] max-w-lg px-4 pt-7">
            <div className="inline-flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#cbe85d]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#cbe85d]" aria-hidden="true" />
              {t("home.kicker")}
            </div>
            <h1 className="mt-3 max-w-[20rem] text-[2.45rem] font-black leading-[0.98] tracking-[-0.06em]">
              {t("home.title")}
            </h1>

            <div className="mt-6 rounded-[1.65rem] border border-white/15 bg-white p-4 text-foreground shadow-[0_28px_70px_-28px_rgba(0,0,0,0.75)]">
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={locale === "de" ? "Fahrzeugklasse" : "Vehicle class"}>
                {mobileCategoryOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelectedCategory(option.value)}
                    aria-pressed={selectedCategory === option.value}
                    className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${
                      selectedCategory === option.value
                        ? "bg-[#13251d] text-white"
                        : "bg-[#f1f2ed] text-foreground/70 hover:bg-[#e7e9e2]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-black/10 bg-white px-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eef2e8] text-primary" aria-hidden="true">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21s7-5.2 7-12a7 7 0 10-14 0c0 6.8 7 12 7 12z" />
                    <circle cx="12" cy="9" r="2.25" strokeWidth="2" />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-muted-foreground">{mobileLocationLabel}</span>
                  <span className="mt-0.5 block truncate text-[0.95rem] font-bold">{mobileLocation}</span>
                </span>
              </div>

              <div className="mt-4 rounded-2xl bg-[#f7f7f3] p-3">
                <ClientOnly>
                  <DateFilter
                    businessTimeZone={businessTimeZone}
                    pickupDate={pickupDateParam}
                    dropoffDate={dropoffDateParam}
                    onPickupDateChange={handlePickupDateChange}
                    onDropoffDateChange={handleDropoffDateChange}
                    onClear={handleClearDates}
                    compact
                  />
                </ClientOnly>
              </div>

              <button
                type="button"
                onClick={scrollToInventory}
                className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#cbe85d] px-5 text-sm font-extrabold text-[#13251d] shadow-[0_14px_30px_-18px_rgba(76,104,29,0.8)] transition-transform active:scale-[0.99]"
              >
                {mobileSearchLabel}
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M5 12h14m-5-5 5 5-5 5" />
                </svg>
              </button>

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 px-1 text-xs font-medium text-foreground/65">
                <span className="inline-flex items-center gap-1.5">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-primary text-[0.6rem] text-white">✓</span>
                  {t("home.highlights.insurance")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-primary text-[0.6rem] text-white">✓</span>
                  {t("home.highlights.support")}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="hidden px-4 pb-8 pt-5 sm:px-6 sm:pt-7 md:block lg:px-8">
          <div className="mx-auto max-w-7xl space-y-7">
            <div className="grid gap-8 overflow-hidden rounded-[2rem] bg-[#13251d] p-6 text-white shadow-[0_32px_80px_-42px_rgba(19,37,29,0.8)] sm:p-9 lg:grid-cols-[1.08fr_0.92fr] lg:p-11">
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.23em] text-[#cbe85d]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#cbe85d]" aria-hidden="true" />
                  {t("home.kicker")}
                </div>
                <h1 className="max-w-3xl text-balance text-4xl font-extrabold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-[4.15rem]">
                  {t("home.title")}
                </h1>
                <p className="max-w-2xl text-base leading-relaxed text-white/66 sm:text-lg">{t("home.subtitle")}</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#cbe85d]">{trustHeadline}</p>
                    <p className="mt-2 text-sm leading-relaxed text-white/60">{trustDescription}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#cbe85d]">{curatedLabel}</p>
                    <p className="mt-2 text-sm leading-relaxed text-white/60">{curatedDescription}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/cars"
                    className="inline-flex items-center justify-center rounded-xl bg-[#cbe85d] px-5 py-3 text-sm font-bold text-[#13251d] transition-transform duration-300 hover:-translate-y-0.5 hover:bg-[#d9f477]"
                  >
                    {t("home.ctaPrimary")}
                  </Link>
                  <Link
                    href="/about"
                    className="inline-flex items-center justify-center rounded-xl border border-white/18 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                  >
                    {t("home.ctaSecondary")}
                  </Link>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="border-l border-white/14 px-3 sm:px-4">
                    <p className="text-lg font-bold sm:text-2xl">{formattedCarCount}</p>
                    <p className="text-xs text-white/50">{t("home.stats.cars")}</p>
                  </div>
                  <div className="border-l border-white/14 px-3 sm:px-4">
                    <p className="text-lg font-bold sm:text-2xl">{formattedCategoryCount}</p>
                    <p className="text-xs text-white/50">{t("home.stats.categories")}</p>
                  </div>
                  <div className="border-l border-white/14 px-3 sm:px-4">
                    <div className="flex items-center gap-1 text-lg font-bold sm:text-2xl">
                      <span>{formattedRating}</span>
                      <svg className="h-4 w-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.287 3.956c.3.921-.755 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.176 0l-3.37 2.448c-.784.57-1.838-.197-1.539-1.118l1.286-3.956a1 1 0 00-.364-1.118L2.02 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z" />
                      </svg>
                    </div>
                    <p className="text-xs text-white/50">{t("home.stats.rating")}</p>
                  </div>
                </div>
              </div>

              <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4" style={{ animationDelay: "120ms" }}>
                <div className="relative min-h-[28rem] overflow-hidden rounded-[1.55rem] border border-white/10 bg-[#1a3026] shadow-2xl">
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
                  {featuredCar ? (
                    <img
                      src={featuredCar.image || "/placeholder.jpg"}
                      alt={featuredName}
                      className="h-[29rem] w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-[29rem] items-center justify-center bg-white/5 text-white/60">
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
                          {featuredCar?.pricingPublished && featuredCar.price !== null
                            ? formatCents(featuredCar.price)
                            : t("car.priceComingSoon")}
                          {featuredCar?.pricingPublished ? (
                            <span className="ml-1 text-sm text-white/80">/ {t("car.pricePerDay")}</span>
                          ) : null}
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

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="qujo-panel p-5 sm:p-6">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{inventoryLabel}</p>
                  <h2 className="mt-1 text-xl font-bold">{t("home.searchTitle")}</h2>
                  <p className="text-sm text-muted-foreground">{availabilityLabel}</p>
                </div>
                <ClientOnly>
                  <DateFilter
                    businessTimeZone={businessTimeZone}
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

              <div className="qujo-panel bg-[#eef2e8] p-5 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{premiumCollectionLabel}</p>
                <div className="mt-3 space-y-2">
                  {highlightItems.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center gap-3 rounded-xl border border-black/[0.06] bg-white/70 p-3"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#13251d] text-[#cbe85d]">
                        {item.icon}
                      </span>
                      <span className="text-sm font-medium">{t(`home.highlights.${item.key}`)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="hidden px-4 pb-4 md:block">
          <div className="mx-auto max-w-7xl rounded-2xl border border-black/[0.07] bg-white p-2 shadow-sm">
            <CategoryFilter selected={selectedCategory} onSelect={setSelectedCategory} />
          </div>
        </section>

        <section id="available-cars" className="scroll-mt-24 px-4 pb-10 pt-7 md:pt-0">
          <div className="mx-auto max-w-7xl">
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
          <div className="mx-auto max-w-7xl overflow-hidden rounded-[1.6rem] bg-[#13251d] p-6 text-white sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#cbe85d]">{t("home.featured.title")}</p>
                <h3 className="mt-1 text-2xl font-black sm:text-3xl">{ctaBannerTitle}</h3>
                <p className="mt-2 max-w-2xl text-sm text-white/60 sm:text-base">{ctaBannerSubtitle}</p>
              </div>
              <Link
                href="/cars"
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#cbe85d] px-5 py-3 text-sm font-bold text-[#13251d] transition-transform hover:-translate-y-0.5 hover:bg-[#d9f477]"
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
