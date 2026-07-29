"use client"

import { useState, useTransition } from "react"
import { updateNotificationContacts } from "@/app/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLocale } from "next-intl"

export function NotificationContactsForm({ supportEmail, adminEmail }: { supportEmail: string; adminEmail: string }) {
  const de = useLocale() === "de"
  const [form, setForm] = useState({ supportEmail, adminEmail })
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  return (
    <form className="rounded-xl border bg-background p-5 sm:p-6" onSubmit={(event) => { event.preventDefault(); startTransition(async () => { const result = await updateNotificationContacts(form); setMessage("error" in result ? (de ? "Die E-Mail-Adressen konnten nicht gespeichert werden." : result.error) : (de ? "Benachrichtigungskontakte gespeichert." : "Notification contacts saved.")) }) }}>
      <h2 className="font-semibold">{de ? "Empfänger von Nachrichten" : "Who receives messages"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{de ? "Kundenantworten gehen an den Support. Hinweise zu neuen Buchungen gehen an die Benachrichtigungsadresse des Inhabers." : "Customer replies go to support. New-booking alerts go to the owner notification email."}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="support-email">{de ? "E-Mail des Kundensupports" : "Customer support email"}</Label><Input id="support-email" type="email" value={form.supportEmail} onChange={(event) => setForm((current) => ({ ...current, supportEmail: event.target.value }))} required /></div>
        <div className="space-y-2"><Label htmlFor="admin-email">{de ? "Benachrichtigungs-E-Mail des Inhabers" : "Owner notification email"}</Label><Input id="admin-email" type="email" value={form.adminEmail} onChange={(event) => setForm((current) => ({ ...current, adminEmail: event.target.value }))} required /></div>
      </div>
      <div className="mt-5 flex items-center gap-3"><Button type="submit" disabled={pending}>{pending ? (de ? "Wird gespeichert…" : "Saving…") : (de ? "E-Mail-Adressen speichern" : "Save email addresses")}</Button>{message ? <p className="text-sm text-muted-foreground" role="status">{message}</p> : null}</div>
    </form>
  )
}
