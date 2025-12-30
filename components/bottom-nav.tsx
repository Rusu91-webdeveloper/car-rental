"use client"

import Link from "@/navigation"
import { useTranslations } from "next-intl"

interface BottomNavProps {
  active: "home" | "trips" | "saved" | "profile"
}

export function BottomNav({ active }: BottomNavProps) {
  const t = useTranslations()
  const isActive = (page: string) => active === page

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border">
      <div className="flex items-center justify-around px-2 py-3">
        <Link href="/" className="flex flex-col items-center gap-1 px-4 py-2">
          <svg
            className={`w-6 h-6 ${isActive("home") ? "text-primary" : "text-muted-foreground"}`}
            fill={isActive("home") ? "currentColor" : "none"}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
          <span className={`text-xs font-medium ${isActive("home") ? "text-primary" : "text-muted-foreground"}`}>
            {t("navigation.home")}
          </span>
        </Link>

        <Link href="/bookings" className="flex flex-col items-center gap-1 px-4 py-2">
          <svg
            className={`w-6 h-6 ${isActive("trips") ? "text-primary" : "text-muted-foreground"}`}
            fill={isActive("trips") ? "currentColor" : "none"}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <span className={`text-xs font-medium ${isActive("trips") ? "text-primary" : "text-muted-foreground"}`}>
            {t("navigation.trips")}
          </span>
        </Link>

        <Link href="/saved" className="flex flex-col items-center gap-1 px-4 py-2">
          <svg
            className={`w-6 h-6 ${isActive("saved") ? "text-primary" : "text-muted-foreground"}`}
            fill={isActive("saved") ? "currentColor" : "none"}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
          <span className={`text-xs font-medium ${isActive("saved") ? "text-primary" : "text-muted-foreground"}`}>
            {t("navigation.saved")}
          </span>
        </Link>

        <Link href="/profile" className="flex flex-col items-center gap-1 px-4 py-2">
          <svg
            className={`w-6 h-5 ${isActive("profile") ? "text-primary" : "text-muted-foreground"}`}
            fill={isActive("profile") ? "currentColor" : "none"}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
          <span className={`text-xs font-medium ${isActive("profile") ? "text-primary" : "text-muted-foreground"}`}>
            {t("navigation.profile")}
          </span>
        </Link>
      </div>
    </nav>
  )
}
