"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { startBusinessSetupAction } from "@/app/actions/business-setup"
import { Button } from "@/components/ui/button"

export function StartBusinessSetup() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string>()

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-5">
      <h2 className="font-semibold">Start with one guided setup</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This prepares one unpublished setup for your tax, minimum booking length, insurance, payments, messages, and cars.
      </p>
      <Button
        className="mt-4"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await startBusinessSetupAction()
            setMessage("error" in result ? result.error : "Your business setup is ready to complete.")
            if (!("error" in result)) router.refresh()
          })
        }
      >
        {pending ? "Preparing…" : "Start business setup"}
      </Button>
      {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
    </div>
  )
}
