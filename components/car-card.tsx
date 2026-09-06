"use client"

import type React from "react"

import Link from "@/navigation"
import { useRouter } from "@/navigation"
import { useTransition } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"
import { toggleSavedCar } from "@/app/actions/saved"
import { formatCents } from "@/lib/money"

interface Car {
  id: string
  name: string
  nameDe?: string | null
  category: string
  price: number | null
  pricingPublished: boolean
  image: string
  status: string
  specs: {
    gearbox: string
    seats: number
    fuel: string
    acceleration: string | null
  }
  rating: number
  reviews: number
}

export function CarCard({
  car,
  isSaved,
  isSignedIn,
  signInUrl,
}: {
  car: Car
  isSaved: boolean
  isSignedIn: boolean
  signInUrl: string
}) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const displayName = locale === "de" ? car.nameDe || car.name : car.name
  const categoryKey = car.category.toLowerCase()
  const categoryLabel = t(`categories.${categoryKey}`)
  const bookingEnabled = car.pricingPublished && (car.status === "AVAILABLE" || car.status === "LOW_STOCK")

  // Preserve date query params when linking to car detail page
  const getCarDetailUrl = () => {
    const pickupDate = searchParams.get("pickupDate")
    const dropoffDate = searchParams.get("dropoffDate")
    let url = `/cars/${car.id}`
    const params = new URLSearchParams()
    if (pickupDate) {
      params.set("pickupDate", pickupDate)
    }
    if (dropoffDate) {
      params.set("dropoffDate", dropoffDate)
    }
    if (params.toString()) {
      url += `?${params.toString()}`
    }
    return url
  }

  const handleSaveClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isSignedIn) {
      router.push(signInUrl)
      return
    }
    startTransition(async () => {
      try {
        await toggleSavedCar(car.id)
        router.refresh()
      } catch (error) {
        console.error("[TOGGLE_SAVED_CAR_ERROR]", error)
      }
    })
  }

  const getStatusColor = (status: string) => {
    if (!car.pricingPublished && (status === "AVAILABLE" || status === "LOW_STOCK")) {
      return "bg-slate-100 text-slate-700"
    }
    switch (status) {
      case "AVAILABLE":
        return "bg-[#dff0a5] text-[#20370f]"
      case "LOW_STOCK":
        return "bg-amber-500 text-white"
      case "MAINTENANCE":
        return "bg-rose-600 text-white"
      default:
        return "bg-slate-700 text-white"
    }
  }

  const getStatusText = (status: string) => {
    if (!car.pricingPublished && (status === "AVAILABLE" || status === "LOW_STOCK")) {
      return t("carStatus.comingSoon")
    }
    switch (status) {
      case "AVAILABLE":
        return t("carStatus.available")
      case "LOW_STOCK":
        return t("carStatus.lowStock")
      case "MAINTENANCE":
        return t("carStatus.maintenance")
      default:
        return status
    }
  }

  return (
    <Link href={getCarDetailUrl()} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4">
      <article className="group h-full overflow-hidden rounded-[1.35rem] border border-black/[0.07] bg-white shadow-[0_18px_45px_-36px_rgba(19,37,29,0.55)] transition-all duration-300 hover:-translate-y-1 hover:border-black/[0.12] hover:shadow-[0_26px_60px_-38px_rgba(19,37,29,0.62)]">
        {/* Image */}
        <div className="relative aspect-[16/10] overflow-hidden bg-[#eef0ea]">
          <img
            src={car.image || "/placeholder.jpg"}
            alt={displayName}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent" />
          <div className="absolute top-3 left-3">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.11em] shadow-sm ring-1 ring-black/10 ${getStatusColor(car.status)}`}
            >
              {getStatusText(car.status)}
            </span>
          </div>
          <button
            onClick={handleSaveClick}
            disabled={isPending}
            className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-white/90 text-[#263c32] shadow-lg backdrop-blur transition-transform hover:scale-105 disabled:opacity-60"
            aria-label={isSaved ? "Unsave car" : "Save car"}
          >
            <svg
              className={`h-5 w-5 ${isSaved ? "fill-rose-500 stroke-rose-500" : "fill-none stroke-current"}`}
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800">{categoryLabel}</span>
              <h3 className="mt-1 line-clamp-1 text-xl font-bold leading-tight text-[#13251d] sm:text-[1.4rem]">{displayName}</h3>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-lg font-bold text-[#13251d]">
                {car.pricingPublished && car.price !== null ? formatCents(car.price) : t("car.priceComingSoon")}
                {car.pricingPublished ? (
                  <span className="text-sm font-normal text-slate-500">/ {t("car.pricePerDay")}</span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
            <div className="flex items-center gap-1 rounded-full bg-[#f2f3ed] px-2 py-1 text-[#5e681f]">
              <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.922-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.196-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 00.95-.69l1.07-3.292z" />
              </svg>
              <span className="font-semibold text-[#13251d]">{car.rating.toFixed(1)}</span>
            </div>
            <span>{t("car.reviews", { count: car.reviews })}</span>
          </div>

          {/* Specs */}
          <div className="mb-5 grid grid-cols-3 gap-2 text-xs text-slate-600">
            <div className="flex items-center gap-1.5 rounded-lg bg-[#f5f5f1] px-2 py-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
              <span className="line-clamp-1">{car.specs.gearbox}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-[#f5f5f1] px-2 py-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <span className="line-clamp-1">{t("car.seats", { count: car.specs.seats })}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-[#f5f5f1] px-2 py-2">
              {car.specs.fuel === "EV" || car.specs.fuel === "Electric" ? (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              ) : car.specs.fuel === "Hybrid" ? (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                  />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              )}
              <span className="line-clamp-1">{car.specs.fuel}</span>
            </div>
          </div>

          {/* Book Button */}
          <div
            className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold ${
              bookingEnabled ? "bg-[#13251d] text-white transition-colors group-hover:bg-[#1e372b]" : "bg-slate-100 text-slate-500"
            }`}
          >
            <span>{bookingEnabled ? t("common.bookNow") : t("car.bookingUnavailable")}</span>
            {bookingEnabled ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            ) : null}
          </div>
        </div>
      </article>
    </Link>
  )
}
