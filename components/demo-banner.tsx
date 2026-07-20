"use client"

import { AlertCircle, X } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
    <Alert className="rounded-none border-x-0 border-t-0 bg-amber-50 dark:bg-amber-950/20">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        {t("title")}
        <Button aria-label={t("close")} variant="ghost" size="sm" onClick={() => setDismissed(true)} className="h-6 w-6 p-0">
          <X className="h-4 w-4" />
        </Button>
      </AlertTitle>
      <AlertDescription>
        {t("descriptionBefore")}{" "}
        <Link href="/help" className="underline">
          {t("helpLink")}
        </Link>
        {t("descriptionAfter")}
      </AlertDescription>
    </Alert>
  )
}
