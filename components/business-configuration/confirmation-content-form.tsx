"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { updateConfirmationContentDraftAction } from "@/app/actions/notification-configuration"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { loadNotificationConfigurationPage } from "@/lib/notification-configuration/service"

type PageData = Awaited<ReturnType<typeof loadNotificationConfigurationPage>>

export function ConfirmationContentForm({ data, canEdit }: { data: PageData; canEdit: boolean }) {
  const draft = data.draftConfirmation
  const source = draft?.configuration ?? data.activeConfirmation?.configuration
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string>()
  const [summary, setSummary] = useState(draft?.changeSummary ?? "Update booking confirmation content")
  const [sections, setSections] = useState(source?.sections ?? [])
  const [content, setContent] = useState(() => data.supportedLocales.map((locale) => ({
    locale,
    heading: source?.content.find((item) => item.locale === locale)?.heading ?? "",
    safeContent: source?.content.find((item) => item.locale === locale)?.safeContent ?? "",
  })))
  if (!source) return <p className="text-sm text-muted-foreground">No confirmation configuration release exists yet.</p>
  return <section className="rounded-xl border bg-background p-5">
    <h2 className="font-semibold">Booking-confirmation content</h2>
    <p className="mt-1 text-sm text-muted-foreground">The Payment section controls whether the selected method’s instructions appear in the existing confirmation email.</p>
    <div className="mt-4 grid gap-2 sm:grid-cols-2">{sections.map((item) => <label key={item.section} className="flex gap-2 rounded border p-3 text-sm"><Checkbox checked={item.enabled} disabled={!draft || !canEdit} onCheckedChange={(value) => setSections((current) => current.map((section) => section.section === item.section ? { ...section, enabled: value === true } : section))} />{item.section.replaceAll("_", " ")}</label>)}</div>
    <div className="mt-5 grid gap-4 md:grid-cols-2">{content.map((item, index) => <div key={item.locale} className="rounded-lg border p-4"><h3 className="font-medium">Content ({item.locale})</h3><label className="mt-3 block text-sm">Heading<Input className="mt-2" value={item.heading} disabled={!draft || !canEdit} onChange={(event) => setContent((current) => current.map((value, position) => position === index ? { ...value, heading: event.target.value } : value))} /></label><label className="mt-3 block text-sm">Message<Textarea className="mt-2 min-h-28" value={item.safeContent} disabled={!draft || !canEdit} onChange={(event) => setContent((current) => current.map((value, position) => position === index ? { ...value, safeContent: event.target.value } : value))} /></label></div>)}</div>
    <label className="mt-4 block max-w-xl text-sm"><span className="font-medium">Change summary</span><Input className="mt-2" value={summary} onChange={(event) => setSummary(event.target.value)} disabled={!draft || !canEdit} /></label>
    <Button className="mt-4" disabled={!draft || !canEdit || pending} onClick={() => startTransition(async () => {
      if (!draft) return
      const result = await updateConfirmationContentDraftAction({ versionId: draft.id, expectedRevision: draft.revision, changeSummary: summary, configuration: { sections, content: content.map((item) => ({ ...item, heading: item.heading || undefined, safeContent: item.safeContent || undefined })) } })
      setMessage("error" in result ? result.error : "Confirmation content saved to the draft.")
      if (!("error" in result)) router.refresh()
    })}>Save confirmation draft</Button>
    {message ? <p className="mt-3 text-sm">{message}</p> : null}
  </section>
}
