"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { createNotificationConfigurationDraftAction } from "@/app/actions/notification-configuration"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { loadNotificationConfigurationPage } from "@/lib/notification-configuration/service"

type PageData = Awaited<ReturnType<typeof loadNotificationConfigurationPage>>

export function NotificationDraftControl({ data, canEdit }: { data: PageData; canEdit: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [summary, setSummary] = useState("Offline payment and confirmation instructions")
  const [message, setMessage] = useState<string>()
  if (data.draftPayment && data.draftConfirmation) return null
  return (
    <section className="rounded-xl border bg-background p-5">
      <h2 className="font-semibold">Create notification configuration drafts</h2>
      <p className="mt-1 text-sm text-muted-foreground">Copies the current release into editable payment and confirmation versions. Nothing becomes live until the release is validated and activated.</p>
      <Input aria-label="Change summary" className="mt-4 max-w-xl" value={summary} onChange={(event) => setSummary(event.target.value)} disabled={!canEdit || pending} />
      <Button className="mt-3" disabled={!canEdit || pending} onClick={() => startTransition(async () => {
        const result = await createNotificationConfigurationDraftAction({ changeSummary: summary })
        setMessage("error" in result ? result.error : "Drafts created.")
        if (!("error" in result)) router.refresh()
      })}>Create drafts</Button>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </section>
  )
}
