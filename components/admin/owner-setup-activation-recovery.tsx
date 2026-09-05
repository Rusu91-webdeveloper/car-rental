"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { CircleAlert, LoaderCircle } from "lucide-react"
import Link, { useRouter } from "@/navigation"
import { recoverCompletedOwnerSetupAction } from "@/app/actions/owner-setup"
import { Button } from "@/components/ui/button"
import { useLocale } from "next-intl"

function editHref(href: string) {
  return `${href}${href.includes("?") ? "&" : "?"}edit=1`
}

export function OwnerSetupActivationRecovery() {
  const de = useLocale() === "de"
  const router = useRouter()
  const attempted = useRef(false)
  const [message, setMessage] = useState<string>()
  const [issues, setIssues] = useState<Array<{ code: string; message: string; action: string; href: string }>>([])
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true

    startTransition(async () => {
      const result = await recoverCompletedOwnerSetupAction()
      if ("error" in result) {
        setMessage(result.error)
        setIssues("issues" in result ? (result.issues ?? []) : [])
        return
      }
      router.refresh()
    })
  }, [router])

  function retry() {
    setMessage(undefined)
    setIssues([])
    startTransition(async () => {
      const result = await recoverCompletedOwnerSetupAction()
      if ("error" in result) {
        setMessage(result.error)
        setIssues("issues" in result ? (result.issues ?? []) : [])
        return
      }
      router.refresh()
    })
  }

  if (message) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">{de ? "Die Online-Buchung benötigt noch eine letzte Prüfung" : "Online booking still needs one final check"}</p>
            <p className="mt-1 text-sm text-amber-900/80">{de ? "Einige Einstellungen müssen noch geprüft werden, bevor die Online-Buchung aktiviert werden kann." : message}</p>
            {issues.length > 1 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900/80">
                {issues.slice(1).map((issue) => <li key={issue.code}>{de ? "Prüfen Sie diese Einstellung." : issue.message}</li>)}
              </ul>
            ) : null}
          </div>
        </div>
        {issues[0] ? (
          <Button asChild variant="outline">
            <Link href={editHref(issues[0].href)}>{de ? "Einstellungen prüfen" : "Review settings"}</Link>
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={retry} disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            {de ? "Erneut versuchen" : "Try again"}
          </Button>
        )}
      </section>
    )
  }

  return (
    <section
      className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950"
      role="status"
      aria-live="polite"
    >
      <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
      <div>
        <p className="font-medium">{de ? "Online-Buchung wird aktiviert" : "Enabling online booking"}</p>
        <p className="mt-1 text-sm text-blue-900/75">{de ? "Ihre Einstellungen sind vollständig. Wir stellen sie jetzt Ihren Kunden zur Verfügung." : "Your settings are complete. We are making them available to customers."}</p>
      </div>
    </section>
  )
}
