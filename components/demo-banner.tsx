"use client"

import { AlertCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { useTranslations } from "next-intl"
import Link from "@/navigation"

export function DemoBanner() {
  const t = useTranslations("demoBanner")
  const [dismissed, setDismissed] = useState(false)

  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true"

  if (!isDemoMode || dismissed) return null

  return (
    <aside className="border-b border-amber-900/10 bg-amber-50 text-amber-950" aria-label={t("title")}>
      <div className="qujo-container flex min-h-14 items-center gap-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-amber-800" aria-hidden="true" />
        <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-2">
          <p className="shrink-0 text-sm font-semibold leading-5">{t("title")}</p>
          <p className="text-xs leading-5 text-amber-950/70 sm:hidden">
            {t("compactDescription")}{" "}
            <Link href="/help" className="font-semibold text-amber-950 underline underline-offset-2">
              {t("compactHelpLink")}
            </Link>
          </p>
          <p className="hidden text-sm leading-5 text-amber-950/65 sm:block">
            {t("descriptionBefore")}{" "}
            <Link href="/help" className="font-medium text-amber-950 underline underline-offset-2">
              {t("helpLink")}
            </Link>
            {t("descriptionAfter")}
          </p>
        </div>
        <Button
          aria-label={t("close")}
          variant="ghost"
          size="icon-lg"
          onClick={() => setDismissed(true)}
          className="-mr-2 size-11 rounded-full text-amber-950/70 hover:bg-amber-900/10 hover:text-amber-950"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  )
}
