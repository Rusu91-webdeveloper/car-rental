"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import Link from "@/navigation"
import { createNotificationConfigurationDraftAction } from "@/app/actions/notification-configuration"
import { Button } from "@/components/ui/button"
import type { loadNotificationConfigurationPage } from "@/lib/notification-configuration/service"

type PageData = Awaited<ReturnType<typeof loadNotificationConfigurationPage>>

export function NotificationDraftControl({ data, canEdit }: { data: PageData; canEdit: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const summary = "Payment and confirmation instructions"
  const [message, setMessage] = useState<string>()
  if (!data.draftRelease && !data.activePayment && !data.activeConfirmation)
    return (
      <section className="rounded-xl border border-amber-300/60 bg-amber-50 p-5 text-amber-950">
        <h2 className="font-semibold">Finish the essential business setup first</h2>
        <p className="mt-1 text-sm">Customer messages are connected to the same setup as tax, booking rules, insurance, and payments.</p>
        <Button asChild className="mt-3">
          <Link href="/admin/settings">View setup steps</Link>
        </Button>
      </section>
    )
  if (data.draftPayment && data.draftConfirmation) return null
  return (
    <section className="rounded-xl border bg-background p-5">
      <h2 className="font-semibold">Ready to change customer messages?</h2>
      <p className="mt-1 text-sm text-muted-foreground">Start with what customers receive today. Your edits stay private until an owner publishes them.</p>
      <Button
        className="mt-3"
        disabled={!canEdit || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await createNotificationConfigurationDraftAction({
              changeSummary: summary,
            })
            setMessage("error" in result ? result.error : "You can now edit customer messages.")
            if (!("error" in result)) router.refresh()
          })
        }
      >
        Edit customer messages
      </Button>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </section>
  )
}
