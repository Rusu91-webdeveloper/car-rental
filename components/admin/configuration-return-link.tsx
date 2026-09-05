"use client"

import { ArrowLeft } from "lucide-react"
import { useLocale } from "next-intl"
import Link from "@/navigation"

export function ConfigurationReturnLink() {
  const locale = useLocale()
  const label = locale === "de" ? "Zurück zur Konfiguration" : "Back to configuration"

  return (
    <Link
      href="/admin/advanced/configuration"
      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/35 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  )
}
