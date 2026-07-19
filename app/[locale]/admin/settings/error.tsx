"use client"

import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function SettingsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  function returnToSettings() {
    window.location.assign(window.location.pathname)
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl items-center p-4 sm:p-6 lg:p-8">
      <section className="w-full rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">We couldn’t open this setting</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
          Your saved information is safe. Try loading this step again, or return to the start of Settings.
        </p>
        <div className="mt-6 flex flex-col-reverse justify-center gap-3 sm:flex-row">
          <Button type="button" variant="outline" onClick={returnToSettings}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to settings
          </Button>
          <Button type="button" onClick={reset}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </div>
      </section>
    </main>
  )
}
