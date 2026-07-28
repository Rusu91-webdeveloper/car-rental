"use client"

import { useLocale } from "next-intl"
import { usePathname, useRouter } from "@/navigation"
import type { AppLocale } from "@/i18n"
import { currentLocalizedPath } from "@/lib/current-localized-path"

const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export function useLocaleSwitch() {
  const locale = useLocale() as AppLocale
  const pathname = usePathname()
  const router = useRouter()

  const switchLocale = (nextLocale: AppLocale) => {
    if (nextLocale === locale) return

    document.cookie = `NEXT_LOCALE=${nextLocale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
    document.documentElement.lang = nextLocale
    router.replace(currentLocalizedPath(pathname, window.location), { locale: nextLocale })
  }

  return { locale, switchLocale }
}
