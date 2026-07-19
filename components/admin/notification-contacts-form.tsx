"use client"

import { useState, useTransition } from "react"
import { updateNotificationContacts } from "@/app/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function NotificationContactsForm({ supportEmail, adminEmail }: { supportEmail: string; adminEmail: string }) {
  const [form, setForm] = useState({ supportEmail, adminEmail })
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  return (
    <form className="rounded-xl border bg-background p-5 sm:p-6" onSubmit={(event) => { event.preventDefault(); startTransition(async () => { const result = await updateNotificationContacts(form); setMessage("error" in result ? result.error : "Notification contacts saved.") }) }}>
      <h2 className="font-semibold">Who receives messages</h2>
      <p className="mt-1 text-sm text-muted-foreground">Customer replies go to support. New-booking alerts go to the owner notification email.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="support-email">Customer support email</Label><Input id="support-email" type="email" value={form.supportEmail} onChange={(event) => setForm((current) => ({ ...current, supportEmail: event.target.value }))} required /></div>
        <div className="space-y-2"><Label htmlFor="admin-email">Owner notification email</Label><Input id="admin-email" type="email" value={form.adminEmail} onChange={(event) => setForm((current) => ({ ...current, adminEmail: event.target.value }))} required /></div>
      </div>
      <div className="mt-5 flex items-center gap-3"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save email addresses"}</Button>{message ? <p className="text-sm text-muted-foreground" role="status">{message}</p> : null}</div>
    </form>
  )
}
