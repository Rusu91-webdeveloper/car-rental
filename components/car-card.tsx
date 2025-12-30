"use client"

import type React from "react"

import Link from "@/navigation"
import { useRouter } from "@/navigation"
import { useTransition } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toggleSavedCar } from "@/app/actions/saved"
import { formatCents } from "@/lib/money"

interface Car {
  id: string
  name: string
  nameDe?: string | null
  category: string
  price: number
  image: string
  status: string
  specs: {
    gearbox: string
    seats: number
    fuel: string
    acceleration: string
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
  const [isPending, startTransition] = useTransition()
  const displayName = locale === "de" ? car.nameDe || car.name : car.name
  const categoryKey = car.category.toLowerCase()
  const categoryLabel = t(`categories.${categoryKey}` as any)

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
    switch (status) {
      case "AVAILABLE":
        return "bg-green-50 text-success"
      case "LOW_STOCK":
        return "bg-orange-50 text-warning"
      case "MAINTENANCE":
        return "bg-red-50 text-error"
      default:
        return "bg-gray-100 text-gray-600"
    }
  }

  const getStatusText = (status: string) => {
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
    <Link href={`/cars/${car.id}`}>
      <div className="bg-card rounded-2xl overflow-hidden border border-border hover:shadow-lg transition-shadow">
        {/* Image */}
        <div className="relative h-48 bg-gradient-to-b from-gray-100 to-gray-200">
          <img src={car.image || "/placeholder.jpg"} alt={displayName} className="w-full h-full object-cover" />
          <div className="absolute top-3 left-3">
            <span className={`px-3 py-1 ${getStatusColor(car.status)} text-xs font-semibold rounded-full`}>
              {getStatusText(car.status)}
            </span>
          </div>
          <button
            onClick={handleSaveClick}
            disabled={isPending}
            className="absolute top-3 right-3 w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform disabled:opacity-60"
          >
            <svg
              className={`w-5 h-5 ${isSaved ? "fill-red-500 stroke-red-500" : "fill-none stroke-gray-600"}`}
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
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <span className="text-xs text-primary font-semibold uppercase">{categoryLabel}</span>
              <h3 className="font-bold text-lg">{displayName}</h3>
            </div>
            <div className="text-right">
              <div className="font-bold text-lg">
                {formatCents(car.price)}
                <span className="text-sm text-muted-foreground font-normal">/ {t("car.pricePerDay")}</span>
              </div>
            </div>
          </div>

          {/* Specs */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
              <span>{car.specs.gearbox}</span>
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <span>{t("car.seats", { count: car.specs.seats })}</span>
            </div>
            <div className="flex items-center gap-1">
              {car.specs.fuel === "EV" || car.specs.fuel === "Electric" ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              ) : car.specs.fuel === "Hybrid" ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                  />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              )}
              <span>{car.specs.fuel}</span>
            </div>
          </div>

          {/* Book Button */}
          <button className="w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-hover transition-colors">
            {t("common.bookNow")}
          </button>
        </div>
      </div>
    </Link>
  )
}
