"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { saveDocumentPolicyDraftAction } from "@/app/actions/document-configuration"
import { completeOwnerSetupStep, ownerSetupSaveLabel } from "@/components/admin/complete-owner-setup-step"
import type { DocumentConfigurationPageData, DocumentPolicyDraftInput } from "@/lib/document-configuration/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function DocumentPolicyEditor({ data, nextHref }: { data: DocumentConfigurationPageData; nextHref?: string }) {
  const router = useRouter()
  const [configuration, setConfiguration] = useState<DocumentPolicyDraftInput>(
    data.active?.configuration ?? {
      identityDocumentChoice: "EITHER_IDENTITY_CARD_OR_PASSPORT",
      retentionPreferenceDays: 90,
      requirements: [
        {
          documentTypeKey: "IDENTITY_CARD",
          mode: "REQUIRED",
          fileCount: 1,
          sides: "FRONT_AND_BACK",
          instructions: "Upload the front and back of your ID card.",
        },
        {
          documentTypeKey: "PASSPORT",
          mode: "REQUIRED",
          fileCount: 1,
          sides: "SINGLE_FILE",
          instructions: "Upload the photo page of your passport.",
        },
        {
          documentTypeKey: "DRIVING_LICENCE",
          mode: "REQUIRED",
          fileCount: 1,
          sides: "FRONT_AND_BACK",
          instructions: "Upload the front and back of your driving licence.",
        },
      ],
    },
  )
  const summary = "Customer document requirements"
  const [message, setMessage] = useState<string>()
  const [isPending, startTransition] = useTransition()
  const updateRule = (index: number, changes: Partial<DocumentPolicyDraftInput["requirements"][number]>) =>
    setConfiguration((current) => ({
      ...current,
      requirements: current.requirements.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...changes } : rule)),
    }))
  const save = () => {
    if (!data.draftRelease) return
    startTransition(async () => {
      const result = await saveDocumentPolicyDraftAction({
        draftReleaseId: data.draftRelease!.id,
        expectedReleaseRevision: data.draftRelease!.revision,
        changeSummary: summary,
        configuration,
      })
      setMessage(result.success ? "Document requirements saved." : result.error)
      if (result.success) {
        const navigationError = await completeOwnerSetupStep("documents", nextHref, router)
        if (navigationError) setMessage(navigationError)
      }
    })
  }
  return (
    <div className="space-y-6">
      {data.healthCodes.length ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Customer uploads are not available yet.</p>
          <p className="mt-1">You can choose the requirements now; customers will only be asked once secure uploads are ready.</p>
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer">Technical details</summary>
            <ul className="mt-2 list-disc pl-5">
              {data.healthCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}
      <section className="space-y-5 rounded-xl border bg-background p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Which identity document is accepted?
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-3"
              value={configuration.identityDocumentChoice}
              onChange={(event) =>
                setConfiguration((current) => ({
                  ...current,
                  identityDocumentChoice: event.target.value as DocumentPolicyDraftInput["identityDocumentChoice"],
                }))
              }
            >
              <option value="DISABLED">Do not ask for identity documents</option>
              <option value="IDENTITY_CARD_ONLY">ID card only</option>
              <option value="PASSPORT_ONLY">Passport only</option>
              <option value="EITHER_IDENTITY_CARD_OR_PASSPORT">ID card or passport</option>
              <option value="BOTH">Both</option>
            </select>
          </label>
        </div>
        <p className="rounded-lg bg-muted/50 p-3 text-sm">Every uploaded document must be approved by a person before it is accepted.</p>
        {configuration.requirements.map((rule, index) => (
          <fieldset key={rule.documentTypeKey} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
            <legend className="px-2 font-medium">{rule.documentTypeKey.replaceAll("_", " ").toLowerCase()}</legend>
            <label className="text-sm">
              Ask for this?
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                value={rule.mode}
                onChange={(event) =>
                  updateRule(index, {
                    mode: event.target.value as typeof rule.mode,
                  })
                }
              >
                <option value="REQUIRED">Required</option>
                <option value="OPTIONAL">Optional</option>
                <option value="DISABLED">Do not ask</option>
              </select>
            </label>
            <label className="text-sm">
              Number of files
              <Input className="mt-1" type="number" min="1" max="2" value={rule.fileCount} onChange={(event) => updateRule(index, { fileCount: Number(event.target.value) })} />
            </label>
            <label className="text-sm">
              Sides
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                value={rule.sides}
                onChange={(event) =>
                  updateRule(index, {
                    sides: event.target.value as typeof rule.sides,
                  })
                }
              >
                <option value="SINGLE_FILE">Single file</option>
                <option value="FRONT_AND_BACK">Front and back</option>
              </select>
            </label>
            <label className="text-sm sm:col-span-3">
              Customer instructions
              <textarea className="mt-1 min-h-20 w-full rounded-md border bg-background p-3" maxLength={1000} value={rule.instructions} onChange={(event) => updateRule(index, { instructions: event.target.value })} />
            </label>
          </fieldset>
        ))}
        <details className="rounded-lg border p-4 text-sm">
          <summary className="cursor-pointer font-medium">Advanced privacy setting</summary>
          <label className="mt-4 block font-medium">
            Delete documents after (days)
            <Input className="mt-1" type="number" min="1" max="365" value={configuration.retentionPreferenceDays} onChange={(event) => setConfiguration((current) => ({ ...current, retentionPreferenceDays: Number(event.target.value) }))} />
          </label>
        </details>
        {message ? (
          <p className="text-sm" role="status">
            {message}
          </p>
        ) : null}
        <Button disabled={!data.canEdit || !data.draftRelease || isPending} onClick={save}>
          {ownerSetupSaveLabel(nextHref)}
        </Button>
        {!data.draftRelease ? <p className="text-sm text-amber-700">Go to More → Publish changes to prepare a new set of business changes first.</p> : null}
      </section>
    </div>
  )
}
