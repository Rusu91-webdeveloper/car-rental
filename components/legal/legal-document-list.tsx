"use client"

import { useState, useTransition } from "react"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LegalContent } from "./legal-content"
import { archiveLegalVersionAction, createLegalDraftAction, discardLegalDraftAction, publishLegalVersionAction, updateLegalDraftAction, validateLegalDraftAction } from "@/app/actions/legal-configuration"
import type { LegalAdministrationPageData, LegalAdminDocument } from "@/lib/legal/admin-types"

const label = (type: string) => (type === "RENTAL_TERMS" ? "Rental Terms" : "Privacy Notice")

export function LegalDocumentList({ data, canEdit, canPublish, canValidate }: { data: LegalAdministrationPageData; canEdit: boolean; canPublish: boolean; canValidate: boolean }) {
  const router = useRouter()
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  const run = <T extends { error: string } | { success: true }>(task: () => Promise<T>, success: string) =>
    startTransition(async () => {
      const result = await task()
      const error = "error" in result ? result.error : undefined
      setMessage(error ?? success)
      if (!error) router.refresh()
    })
  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-amber-50 p-4 text-sm text-amber-950">
        <strong>Legal review required.</strong> Legal text should be reviewed by a qualified legal professional before publication.
      </section>
      {(["RENTAL_TERMS", "PRIVACY_NOTICE"] as const).map((type) => {
        const items = data.documents.filter((document) => document.type === type)
        const draft = items.find(({ status }) => status === "DRAFT")
        const latest = items.find(({ status }) => status === "PUBLISHED")
        return (
          <section key={type} className="rounded-xl border bg-background p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{label(type)}</h2>
                <p className="text-sm text-muted-foreground">{latest ? `Customers can read this in ${latest.translations.map(({ locale }) => locale).join(", ")}` : "Not available to customers yet"}</p>
              </div>
              {!draft && canEdit ? (
                <Button
                  onClick={() =>
                    run(
                      () =>
                        createLegalDraftAction({
                          type,
                          primaryLocale: data.supportedLocales[0],
                          changeSummary: `Update ${label(type)}`,
                          sourceDocumentId: latest?.id,
                        }),
                      "You can now edit this document.",
                    )
                  }
                  disabled={pending}
                >
                  {latest ? "Edit document" : "Add document"}
                </Button>
              ) : null}
            </div>
            {draft ? <LegalDraftEditor document={draft} supportedLocales={data.supportedLocales} canEdit={canEdit} canPublish={canPublish} canValidate={canValidate} run={run} pending={pending} /> : null}
            {items.filter(({ status }) => status !== "DRAFT").length ? (
              <details className="mt-5 border-t pt-4">
                <summary className="cursor-pointer font-medium">Previous copies</summary>
                <div className="mt-2 space-y-2">
                  {items
                    .filter(({ status }) => status !== "DRAFT")
                    .map((document) => (
                      <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
                        <span>
                          Version {document.versionNumber} · {document.status === "PUBLISHED" ? "Published" : "Archived"} · {document.publishedAt ? new Date(document.publishedAt).toLocaleString() : "Earlier copy"}
                        </span>
                        {document.status === "PUBLISHED" && canPublish ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (window.confirm("Stop offering this copy to new customers? Existing bookings will keep their record."))
                                run(
                                  () =>
                                    archiveLegalVersionAction({
                                      documentId: document.id,
                                    }),
                                  "This copy is no longer offered to new customers.",
                                )
                            }}
                          >
                            Stop using
                          </Button>
                        ) : null}
                      </div>
                    ))}
                </div>
              </details>
            ) : null}
          </section>
        )
      })}
      {message ? <p className="rounded border bg-muted p-3 text-sm">{message}</p> : null}
    </div>
  )
}

function LegalDraftEditor({ document, supportedLocales, canEdit, canPublish, canValidate, run, pending }: { document: LegalAdminDocument; supportedLocales: string[]; canEdit: boolean; canPublish: boolean; canValidate: boolean; run: <T extends { error: string } | { success: true }>(task: () => Promise<T>, success: string) => void; pending: boolean }) {
  const [primaryLocale, setPrimaryLocale] = useState(document.primaryLocale ?? supportedLocales[0])
  const summary = document.changeSummary || `Update ${label(document.type)}`
  const [translations, setTranslations] = useState(
    document.translations.map(({ locale, title, canonicalContent }) => ({
      locale,
      title,
      canonicalContent,
    })),
  )
  const [previewLocale, setPreviewLocale] = useState(document.primaryLocale ?? supportedLocales[0])
  const current = translations.find(({ locale }) => locale === previewLocale) ?? translations[0]
  const update = (locale: string, field: "title" | "canonicalContent", value: string) => setTranslations((items) => items.map((item) => (item.locale === locale ? { ...item, [field]: value } : item)))
  return (
    <div className="mt-5 space-y-4 border-t pt-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Primary language
          <select className="mt-1 w-full rounded-md border p-2" value={primaryLocale} onChange={(event) => setPrimaryLocale(event.target.value)} disabled={!canEdit}>
            {supportedLocales.map((locale) => (
              <option key={locale}>{locale}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {supportedLocales.map((locale) => (
          <Button
            key={locale}
            size="sm"
            variant={previewLocale === locale ? "default" : "outline"}
            onClick={() => {
              setPreviewLocale(locale)
              if (!translations.some((item) => item.locale === locale) && canEdit) setTranslations((items) => [...items, { locale, title: "", canonicalContent: "" }])
            }}
          >
            {locale}
            {translations.some((item) => item.locale === locale) ? "" : " +"}
          </Button>
        ))}
      </div>
      {current ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="text-sm font-medium">
              Customer title
              <Input className="mt-1" value={current.title} onChange={(event) => update(current.locale, "title", event.target.value)} disabled={!canEdit} />
            </label>
            <label className="block text-sm font-medium">
              Text customers read
              <textarea className="mt-1 min-h-80 w-full rounded-md border bg-background p-3 font-mono text-sm" value={current.canonicalContent} onChange={(event) => update(current.locale, "canonicalContent", event.target.value)} disabled={!canEdit} />
            </label>
            <p className="text-xs text-muted-foreground">Paste the final wording here. Formatting and links are kept simple for safety.</p>
          </div>
          <div className="rounded-lg border p-4">
            <div className="mb-4 rounded bg-amber-100 p-2 text-xs font-medium text-amber-950">Customer preview · {current.locale}</div>
            <h3 className="mb-4 text-xl font-semibold">{current.title || "Untitled legal document"}</h3>
            <LegalContent content={current.canonicalContent || "Preview appears here."} />
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <Button
            onClick={() =>
              run(
                () =>
                  updateLegalDraftAction({
                    documentId: document.id,
                    expectedRevision: document.revision,
                    primaryLocale,
                    changeSummary: summary,
                    translations,
                  }),
                "Document changes saved.",
              )
            }
            disabled={pending}
          >
            Save changes
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">View-only access</span>
        )}
        {canValidate ? (
          <Button
            variant="outline"
            onClick={() =>
              run(
                () =>
                  validateLegalDraftAction({
                    documentId: document.id,
                    expectedRevision: document.revision,
                  }),
                "The document looks ready.",
              )
            }
            disabled={pending}
          >
            Check for problems
          </Button>
        ) : null}
        {canPublish ? (
          <Button
            variant="outline"
            onClick={() => {
              if (window.confirm(`Publish ${label(document.type)} for new bookings? You will need to create a new copy to change it later.`))
                run(
                  () =>
                    publishLegalVersionAction({
                      documentId: document.id,
                      expectedRevision: document.revision,
                      warningsAcknowledged: true,
                    }),
                  "Document published for new bookings.",
                )
            }}
            disabled={pending}
          >
            Publish for customers
          </Button>
        ) : null}
        {canEdit ? (
          <Button
            variant="destructive"
            onClick={() => {
              if (window.confirm("Undo all unpublished changes to this document?"))
                run(
                  () =>
                    discardLegalDraftAction({
                      documentId: document.id,
                      expectedRevision: document.revision,
                    }),
                  "Unpublished changes removed.",
                )
            }}
            disabled={pending}
          >
            Undo changes
          </Button>
        ) : null}
      </div>
    </div>
  )
}
