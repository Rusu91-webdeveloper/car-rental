"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { AlertCircle, LoaderCircle } from "lucide-react"
import { useRouter } from "@/navigation"
import { startBusinessSetupAction } from "@/app/actions/business-setup"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useLocale } from "next-intl"

export function StartBusinessSetup() {
  const de = useLocale() === "de"
  const router = useRouter()
  const started = useRef(false)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string>()

  const prepareSetup = useCallback(() => {
    setMessage(undefined)
    startTransition(async () => {
      const result = await startBusinessSetupAction()
      if ("error" in result) {
        setMessage(result.error)
        return
      }
      router.refresh()
    })
  }, [router])

  useEffect(() => {
    if (started.current) return
    started.current = true
    prepareSetup()
  }, [prepareSetup])

  return (
    <Card className="mx-auto max-w-2xl border-primary/20">
      <CardContent className="flex flex-col items-center px-6 py-8 text-center sm:py-12">
        {message ? (
          <>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-700">
              <AlertCircle className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-lg font-semibold">{de ? "Ihre Einstellungen konnten nicht vorbereitet werden" : "We couldn’t prepare your settings"}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground" role="alert">{message}</p>
            <Button className="mt-5" onClick={prepareSetup} disabled={pending}>{de ? "Erneut versuchen" : "Try again"}</Button>
          </>
        ) : (
          <>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <LoaderCircle className="h-6 w-6 animate-spin" />
            </span>
            <h2 className="mt-4 text-lg font-semibold">{de ? "Ihre Einstellungen werden vorbereitet" : "Getting your settings ready"}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {de ? "Dies dauert nur einen Moment. Der erste Einrichtungsschritt wird automatisch geöffnet." : "This will only take a moment. Your first setup step will open automatically."}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
