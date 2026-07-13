"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { saveDocumentPolicyDraftAction } from "@/app/actions/document-configuration"
import type { DocumentConfigurationPageData, DocumentPolicyDraftInput } from "@/lib/document-configuration/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function DocumentPolicyEditor({ data }: { data: DocumentConfigurationPageData }) {
  const router = useRouter()
  const [configuration, setConfiguration] = useState<DocumentPolicyDraftInput>(data.active?.configuration ?? {
    identityDocumentChoice: "EITHER_IDENTITY_CARD_OR_PASSPORT",
    retentionPreferenceDays: 90,
    requirements: [
      { documentTypeKey: "IDENTITY_CARD", mode: "REQUIRED", fileCount: 1, sides: "FRONT_AND_BACK", instructions: "Upload the front and back of your ID card." },
      { documentTypeKey: "PASSPORT", mode: "REQUIRED", fileCount: 1, sides: "SINGLE_FILE", instructions: "Upload the photo page of your passport." },
      { documentTypeKey: "DRIVING_LICENCE", mode: "REQUIRED", fileCount: 1, sides: "FRONT_AND_BACK", instructions: "Upload the front and back of your driving licence." },
    ],
  })
  const [summary, setSummary] = useState("Configure customer document requirements")
  const [message, setMessage] = useState<string>()
  const [isPending, startTransition] = useTransition()
  const updateRule = (index: number, changes: Partial<DocumentPolicyDraftInput["requirements"][number]>) => setConfiguration((current) => ({ ...current, requirements: current.requirements.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...changes } : rule) }))
  const save = () => {
    if (!data.draftRelease) return
    startTransition(async () => {
      const result = await saveDocumentPolicyDraftAction({ draftReleaseId: data.draftRelease!.id, expectedReleaseRevision: data.draftRelease!.revision, changeSummary: summary, configuration })
      setMessage(result.success ? "A new document policy version was linked to the draft release." : result.error)
      if (result.success) router.refresh()
    })
  }
  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-bold">Documents</h1><p className="mt-1 text-sm text-muted-foreground">Typed requirements for future applications. Manual review is mandatory and cannot be disabled here.</p></header>
      <section className="rounded-xl border bg-background p-5"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">Release health</h2><p className="mt-1 text-sm text-muted-foreground">Live policy: {data.active ? `v${data.active.versionNumber} · ${data.active.validationStatus.toLowerCase()}` : "not configured"}</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">Production disabled</span></div><ul className="mt-3 list-disc pl-5 text-xs text-muted-foreground">{data.healthCodes.map((code) => <li key={code}>{code}</li>)}</ul></section>
      <section className="space-y-5 rounded-xl border bg-background p-5">
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Identity document choice<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={configuration.identityDocumentChoice} onChange={(event) => setConfiguration((current) => ({ ...current, identityDocumentChoice: event.target.value as DocumentPolicyDraftInput["identityDocumentChoice"] }))}><option value="DISABLED">Disabled</option><option value="IDENTITY_CARD_ONLY">ID card only</option><option value="PASSPORT_ONLY">Passport only</option><option value="EITHER_IDENTITY_CARD_OR_PASSPORT">ID card or passport</option><option value="BOTH">Both</option></select></label><label className="text-sm font-medium">Retention preference (days)<Input className="mt-1" type="number" min="1" max="365" value={configuration.retentionPreferenceDays} onChange={(event) => setConfiguration((current) => ({ ...current, retentionPreferenceDays: Number(event.target.value) }))} /></label></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked readOnly disabled /> Manual review required</label>
        {configuration.requirements.map((rule, index) => <fieldset key={rule.documentTypeKey} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3"><legend className="px-2 font-medium">{rule.documentTypeKey.replaceAll("_", " ").toLowerCase()}</legend><label className="text-sm">Requirement<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={rule.mode} onChange={(event) => updateRule(index, { mode: event.target.value as typeof rule.mode })}><option value="REQUIRED">Required</option><option value="OPTIONAL">Optional</option><option value="DISABLED">Disabled</option></select></label><label className="text-sm">Maximum files<Input className="mt-1" type="number" min="1" max="2" value={rule.fileCount} onChange={(event) => updateRule(index, { fileCount: Number(event.target.value) })} /></label><label className="text-sm">Sides<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={rule.sides} onChange={(event) => updateRule(index, { sides: event.target.value as typeof rule.sides })}><option value="SINGLE_FILE">Single file</option><option value="FRONT_AND_BACK">Front and back</option></select></label><label className="text-sm sm:col-span-3">Customer instructions<textarea className="mt-1 min-h-20 w-full rounded-md border bg-background p-3" maxLength={1000} value={rule.instructions} onChange={(event) => updateRule(index, { instructions: event.target.value })} /></label></fieldset>)}
        <label className="text-sm font-medium">Change summary<Input className="mt-1" value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
        {message ? <p className="text-sm" role="status">{message}</p> : null}
        <Button disabled={!data.canEdit || !data.draftRelease || isPending} onClick={save}>Save as new draft policy version</Button>
        {!data.draftRelease ? <p className="text-sm text-amber-700">Create a draft business release before editing document policy.</p> : null}
      </section>
    </div>
  )
}
