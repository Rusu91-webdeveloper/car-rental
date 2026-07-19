"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { attachLegalDraftToReleaseAction, createLegalAcceptanceDraftAction, updateLegalAcceptanceDraftAction, validateLegalAcceptanceDraftAction } from "@/app/actions/legal-configuration"
import { completeOwnerSetupStep, ownerSetupSaveLabel } from "@/components/admin/complete-owner-setup-step"
import type { LegalAdministrationPageData } from "@/lib/legal/admin-types"

export function LegalAcceptanceConfigurationForm({ data, canEdit, canValidate, canAttach, nextHref, editing = false }: { data: LegalAdministrationPageData; canEdit: boolean; canValidate: boolean; canAttach: boolean; nextHref?: string; editing?: boolean }) {
  const router = useRouter()
  const draft = data.draftAcceptance
  const [config, setConfig] = useState(draft?.configuration)
  const summary = draft?.changeSummary ?? "Booking agreement update"
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  const run = <T extends { error: string } | { success: true }>(task: () => Promise<T>, success: string) =>
    startTransition(async () => {
      const result = await task()
      const error = "error" in result ? result.error : undefined
      setMessage(error ?? success)
      if (!error) router.refresh()
    })
  const saveAndContinue = () =>
    startTransition(async () => {
      const result = await updateLegalAcceptanceDraftAction({
        versionId: draft!.id,
        expectedRevision: draft!.revision,
        changeSummary: summary,
        configuration: config!,
      })
      if ("error" in result) {
        setMessage(result.error)
        return
      }
      setMessage("Legal settings saved.")
      const navigationError = await completeOwnerSetupStep("legal", nextHref, router)
      if (navigationError) setMessage(navigationError)
    })
  if (!draft || !config)
    return (
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">Should customers agree before booking?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Publish your rental terms and privacy notice first, then set up the agreement customers see.</p>
        {canEdit ? (
          <Button
            className="mt-4"
            onClick={() =>
              run(
                () =>
                  createLegalAcceptanceDraftAction({
                    source: data.liveAcceptance ? "LIVE" : "DEFAULT",
                  }),
                "You can now set up the booking agreement.",
              )
            }
            disabled={pending}
          >
            Set up booking agreement
          </Button>
        ) : (
          <p className="mt-3 text-sm">View-only access</p>
        )}
        {message ? <p className="mt-3 text-sm">{message}</p> : null}
      </section>
    )
  const published = data.documents.filter(({ status }) => status === "PUBLISHED")
  const set = <K extends keyof typeof config>(key: K, value: (typeof config)[K]) => setConfig((current) => (current ? { ...current, [key]: value } : current))
  const updateLabels = (locale: string, field: string, value: string) =>
    set(
      "translations",
      config.translations.map((item) => (item.locale === locale ? { ...item, [field]: value } : item)),
    )
  return (
    <section className="space-y-5 rounded-xl border bg-background p-5">
      <div>
        <h2 className="font-semibold">Should customers agree before booking?</h2>
        <p className="text-sm text-muted-foreground">Choose what customers must confirm before sending a booking.</p>
      </div>
      <label className="flex gap-3 rounded-lg border p-3">
        <Checkbox checked={config.bookingEnforcementEnabled} onCheckedChange={(value) => set("bookingEnforcementEnabled", value === true)} disabled={!canEdit} />
        <span>
          <span className="font-medium">Ask customers to agree before booking</span>
          <span className="block text-sm text-muted-foreground">Turn this off only if customers do not need to confirm your terms online.</span>
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <DocumentControl
          label="Rental Terms"
          type="RENTAL_TERMS"
          documents={published}
          documentId={config.termsDocument.id}
          mode={config.termsAcceptance}
          presentation={config.termsPresentation}
          disabled={!canEdit}
          onDocument={(id) => {
            const document = published.find((item) => item.id === id)!
            set("termsDocument", {
              id: document.id,
              type: "RENTAL_TERMS",
              publicationStatus: "PUBLISHED",
              availableLocales: document.translations.map(({ locale }) => locale),
              contentHash: document.manifestHash ?? "",
            })
          }}
          onMode={(value) => set("termsAcceptance", value)}
          onPresentation={(value) => set("termsPresentation", value)}
        />
        <DocumentControl
          label="Privacy Notice"
          type="PRIVACY_NOTICE"
          documents={published}
          documentId={config.privacyDocument.id}
          mode={config.privacyAcknowledgment}
          presentation={config.privacyPresentation}
          disabled={!canEdit}
          onDocument={(id) => {
            const document = published.find((item) => item.id === id)!
            set("privacyDocument", {
              id: document.id,
              type: "PRIVACY_NOTICE",
              publicationStatus: "PUBLISHED",
              availableLocales: document.translations.map(({ locale }) => locale),
              contentHash: document.manifestHash ?? "",
            })
          }}
          onMode={(value) => set("privacyAcknowledgment", value)}
          onPresentation={(value) => set("privacyPresentation", value)}
        />
      </div>
      <div>
        <h3 className="font-medium">Languages customers can book in</h3>
        <div className="mt-2 flex flex-wrap gap-3">
          {data.supportedLocales.map((locale) => (
            <label key={locale} className="flex gap-2 rounded border p-2 text-sm">
              <Checkbox
                checked={config.requiredLocales.includes(locale)}
                onCheckedChange={(value) => {
                  const requiredLocales = value === true ? [...config.requiredLocales, locale] : config.requiredLocales.filter((item) => item !== locale)
                  let translations = config.translations
                  if (value === true && !translations.some((item) => item.locale === locale))
                    translations = [
                      ...translations,
                      {
                        locale,
                        termsCheckboxLabel: "I acknowledge the Rental Terms.",
                        termsLinkLabel: "Rental Terms",
                        privacyCheckboxLabel: "I acknowledge that I have read the Privacy Notice.",
                        privacyLinkLabel: "Privacy Notice",
                      },
                    ]
                  setConfig({ ...config, requiredLocales, translations })
                }}
                disabled={!canEdit}
              />
              {locale}
            </label>
          ))}
        </div>
      </div>
      {config.requiredLocales.map((locale) => {
        const labels = config.translations.find((item) => item.locale === locale)
        if (!labels) return null
        return (
          <div key={locale} className="rounded-lg border p-4">
            <h3 className="font-medium">Words customers see · {locale}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input value={labels.termsLinkLabel} onChange={(event) => updateLabels(locale, "termsLinkLabel", event.target.value)} disabled={!canEdit} placeholder="Rental Terms link label" />
              <Input value={labels.termsCheckboxLabel ?? ""} onChange={(event) => updateLabels(locale, "termsCheckboxLabel", event.target.value)} disabled={!canEdit} placeholder="Rental Terms acknowledgement" />
              <Input value={labels.privacyLinkLabel} onChange={(event) => updateLabels(locale, "privacyLinkLabel", event.target.value)} disabled={!canEdit} placeholder="Privacy Notice link label" />
              <Input value={labels.privacyCheckboxLabel ?? ""} onChange={(event) => updateLabels(locale, "privacyCheckboxLabel", event.target.value)} disabled={!canEdit} placeholder="Privacy Notice acknowledgement" />
            </div>
          </div>
        )
      })}
      <details className="rounded-lg border p-4 text-sm">
        <summary className="cursor-pointer font-medium">Advanced record keeping</summary>
        <label className="mt-4 flex gap-2">
          <Checkbox checked={config.retainRenderedSnapshot} onCheckedChange={(value) => set("retainRenderedSnapshot", value === true)} disabled={!canEdit} />
          Keep an exact copy of what each customer agreed to
        </label>
      </details>
      <label className="flex gap-2 text-sm">
        <Checkbox checked={config.showInConfirmation} onCheckedChange={(value) => set("showInConfirmation", value === true)} disabled={!canEdit} />
        Include links to the agreed documents in confirmations
      </label>
      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <Button onClick={nextHref ? saveAndContinue : () => run(
            () => updateLegalAcceptanceDraftAction({
              versionId: draft.id,
              expectedRevision: draft.revision,
              changeSummary: summary,
              configuration: config,
            }),
            "Booking agreement saved.",
          )} disabled={pending}>
            {editing ? ownerSetupSaveLabel(nextHref) : nextHref ? "Save and finish" : "Save changes"}
          </Button>
        ) : null}
        {canValidate && !nextHref ? (
          <Button variant="outline" onClick={() => run(() => validateLegalAcceptanceDraftAction(), "The booking agreement looks ready.")} disabled={pending}>
            Check for problems
          </Button>
        ) : null}
        {canAttach && !nextHref ? (
          <Button variant="outline" onClick={() => run(() => attachLegalDraftToReleaseAction({ versionId: draft.id }), "Booking agreement added to the next update.")} disabled={pending}>
            Add to next update
          </Button>
        ) : null}
      </div>
      {message ? <p className="rounded bg-muted p-2 text-sm">{message}</p> : null}
    </section>
  )
}

function DocumentControl({ label, type, documents, documentId, mode, presentation, disabled, onDocument, onMode, onPresentation }: { label: string; type: string; documents: LegalAdministrationPageData["documents"]; documentId: string; mode: "REQUIRED" | "DISPLAY_ONLY" | "DISABLED"; presentation: "INLINE" | "DIALOG"; disabled: boolean; onDocument: (id: string) => void; onMode: (value: "REQUIRED" | "DISPLAY_ONLY" | "DISABLED") => void; onPresentation: (value: "INLINE" | "DIALOG") => void }) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">{label}</h3>
      <select className="w-full rounded border p-2" value={documentId} onChange={(event) => onDocument(event.target.value)} disabled={disabled}>
        {documents
          .filter((item) => item.type === type)
          .map((item) => (
            <option key={item.id} value={item.id}>
              Published copy {item.versionNumber} · {item.translations.map(({ locale }) => locale).join(", ")}
            </option>
          ))}
      </select>
      <select className="w-full rounded border p-2" value={mode} onChange={(event) => onMode(event.target.value as typeof mode)} disabled={disabled}>
        <option value="REQUIRED">Customer must tick a checkbox</option>
        <option value="DISPLAY_ONLY">Show the link without a checkbox</option>
        <option value="DISABLED">Do not show this document</option>
      </select>
      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">Advanced display choice</summary>
        <select className="mt-2 w-full rounded border p-2" value={presentation} onChange={(event) => onPresentation(event.target.value as typeof presentation)} disabled={disabled}>
          <option value="DIALOG">Open on a separate screen</option>
          <option value="INLINE">Show on the booking page</option>
        </select>
      </details>
    </div>
  )
}
