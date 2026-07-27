"use client"

import Link from "@/navigation"
import { BrandMark } from "@/components/brand-mark"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useTranslations } from "next-intl"

export function PublicPageHeader({ title }: { title?: string }) {
  const t = useTranslations("common")

  return (
    <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-[#f8f7f2]/90 backdrop-blur-xl">
      <div className="qujo-container flex h-[4.6rem] items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/"
            aria-label={t("backToHome")}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-black/10 bg-white px-3 text-xs font-semibold text-foreground transition-colors hover:bg-[#efeee8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:text-sm"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="sm:hidden">{t("home")}</span>
            <span className="hidden sm:inline">{t("backToHome")}</span>
          </Link>
          <BrandMark className="hidden lg:inline-flex" />
          {title && <span className="truncate border-l border-black/10 pl-4 text-sm font-semibold text-foreground/65">{title}</span>}
        </div>
        <LanguageSwitcher />
      </div>
    </header>
  )
}
