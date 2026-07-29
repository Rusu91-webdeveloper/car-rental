"use client"

import Link from "@/navigation"
import { useLocale } from "next-intl"

export function ConfigurationAccessDenied() {
  const de = useLocale() === "de"
  return <main className="mx-auto max-w-xl p-6"><div className="rounded-xl border bg-background p-8 text-center"><h1 className="text-xl font-semibold">{de ? "Zugriff verweigert" : "Access denied"}</h1><p className="mt-2 text-sm text-muted-foreground">{de ? "Sie haben keine Berechtigung, diesen Bereich der Unternehmenseinstellungen anzuzeigen." : "You do not have permission to view this business settings section."}</p><Link href="/" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">{de ? "Zur Kundenseite zurückkehren" : "Return to the customer site"}</Link></div></main>
}
