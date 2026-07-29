"use client"

import { useState, useTransition, type FormEvent, type ReactNode } from "react"
import { CheckCircle2, CircleAlert, FileCheck2, Loader2, ShieldCheck } from "lucide-react"
import { saveOwnerLegalSetupAction } from "@/app/actions/legal-configuration"
import { completeOwnerSetupStep } from "@/components/admin/complete-owner-setup-step"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useRouter } from "@/navigation"
import { useLocale } from "next-intl"
import type { LegalAdministrationPageData, LegalAdminDocument } from "@/lib/legal/admin-types"
import {
  OWNER_LEGAL_LOCALES,
  type OwnerLegalSetupInput,
} from "@/lib/legal/owner-setup-schema"

type OwnerLegalLocale = (typeof OWNER_LEGAL_LOCALES)[number]
type OwnerDocumentInput = OwnerLegalSetupInput["rentalTerms"]

const defaultTitles = {
  RENTAL_TERMS: { en: "Rental Terms", de: "Mietbedingungen" },
  PRIVACY_NOTICE: { en: "Privacy Notice", de: "Datenschutzerklärung" },
} as const

const defaultLabels = {
  en: {
    locale: "en" as const,
    termsCheckboxLabel: "I agree to the Rental Terms.",
    termsLinkLabel: "Rental Terms",
    privacyCheckboxLabel: "I have read the Privacy Notice.",
    privacyLinkLabel: "Privacy Notice",
  },
  de: {
    locale: "de" as const,
    termsCheckboxLabel: "Ich stimme den Mietbedingungen zu.",
    termsLinkLabel: "Mietbedingungen",
    privacyCheckboxLabel: "Ich habe die Datenschutzerklärung gelesen.",
    privacyLinkLabel: "Datenschutzerklärung",
  },
}

function preferredDocument(
  data: LegalAdministrationPageData,
  type: "RENTAL_TERMS" | "PRIVACY_NOTICE",
) {
  const documents = data.documents.filter((document) => document.type === type)
  return (
    documents.find((document) => document.status === "DRAFT") ??
    documents.find((document) => document.status === "PUBLISHED")
  )
}

function documentInput(
  document: LegalAdminDocument | undefined,
  type: "RENTAL_TERMS" | "PRIVACY_NOTICE",
): OwnerDocumentInput | undefined {
  if (!document) return undefined
  return {
    id: document.id,
    revision: document.revision,
    translations: OWNER_LEGAL_LOCALES.map((locale) => {
      const translation = document.translations.find((item) => item.locale === locale)
      return {
        locale,
        title: translation?.title || defaultTitles[type][locale],
        canonicalContent: translation?.canonicalContent ?? "",
      }
    }),
  }
}

function initialValue(data: LegalAdministrationPageData): OwnerLegalSetupInput | null {
  const rentalTerms = documentInput(preferredDocument(data, "RENTAL_TERMS"), "RENTAL_TERMS")
  const privacyNotice = documentInput(preferredDocument(data, "PRIVACY_NOTICE"), "PRIVACY_NOTICE")
  if (!rentalTerms || !privacyNotice) return null
  const existing = data.draftAcceptance?.configuration ?? data.liveAcceptance?.configuration
  return {
    rentalTerms,
    privacyNotice,
    agreement: {
      requireAgreement:
        existing?.termsAcceptance === "REQUIRED" || existing?.privacyAcknowledgment === "REQUIRED" || !existing,
      translations: OWNER_LEGAL_LOCALES.map((locale) => {
        const labels = existing?.translations.find((translation) => translation.locale === locale)
        return labels
          ? {
              locale,
              termsCheckboxLabel: labels.termsCheckboxLabel || defaultLabels[locale].termsCheckboxLabel,
              termsLinkLabel: labels.termsLinkLabel || defaultLabels[locale].termsLinkLabel,
              privacyCheckboxLabel: labels.privacyCheckboxLabel || defaultLabels[locale].privacyCheckboxLabel,
              privacyLinkLabel: labels.privacyLinkLabel || defaultLabels[locale].privacyLinkLabel,
            }
          : defaultLabels[locale]
      }),
    },
  }
}

function translationIsComplete(translation: OwnerDocumentInput["translations"][number]) {
  return translation.title.trim().length > 0 && translation.canonicalContent.trim().length >= 80
}

export function OwnerLegalSetupForm({
  data,
  canComplete,
  nextHref,
  editing = false,
}: {
  data: LegalAdministrationPageData
  canComplete: boolean
  nextHref?: string
  editing?: boolean
}) {
  const de = useLocale() === "de"
  const languageNames: Record<OwnerLegalLocale, string> = de
    ? { en: "Englisch", de: "Deutsch" }
    : { en: "English", de: "German" }
  const router = useRouter()
  const [value, setValue] = useState<OwnerLegalSetupInput | null>(() => initialValue(data))
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()

  if (!value) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>{de ? "Die rechtlichen Einstellungen konnten nicht vorbereitet werden" : "Legal setup could not be prepared"}</AlertTitle>
        <AlertDescription>
          {de ? "Kehren Sie zu den Einstellungen zurück und öffnen Sie Schritt 10 erneut. Ihre übrigen Unternehmenseinstellungen sind sicher." : "Return to Settings and open Step 10 again. Your other business settings are safe."}
        </AlertDescription>
      </Alert>
    )
  }

  const completedTranslations = [
    ...value.rentalTerms.translations,
    ...value.privacyNotice.translations,
  ].filter(translationIsComplete).length
  const ready = completedTranslations === 4

  function updateDocument(
    key: "rentalTerms" | "privacyNotice",
    locale: OwnerLegalLocale,
    field: "title" | "canonicalContent",
    nextValue: string,
  ) {
    setValue((current) =>
      current
        ? {
            ...current,
            [key]: {
              ...current[key],
              translations: current[key].translations.map((translation) =>
                translation.locale === locale ? { ...translation, [field]: nextValue } : translation,
              ),
            },
          }
        : current,
    )
  }

  function updateAgreement(
    locale: OwnerLegalLocale,
    field: "termsCheckboxLabel" | "termsLinkLabel" | "privacyCheckboxLabel" | "privacyLinkLabel",
    nextValue: string,
  ) {
    setValue((current) =>
      current
        ? {
            ...current,
            agreement: {
              ...current.agreement,
              translations: current.agreement.translations.map((translation) =>
                translation.locale === locale ? { ...translation, [field]: nextValue } : translation,
              ),
            },
          }
        : current,
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready || !canComplete) return
    setMessage(undefined)
    startTransition(async () => {
      const result = await saveOwnerLegalSetupAction(value)
      if ("error" in result) {
        setMessage(de ? "Die rechtlichen Einstellungen konnten nicht gespeichert werden. Bitte versuchen Sie es erneut." : result.error)
        return
      }
      const navigationError = await completeOwnerSetupStep("legal", nextHref, router)
      if (navigationError) setMessage(de ? "Die rechtlichen Einstellungen wurden gespeichert, aber die Einrichtung konnte nicht abgeschlossen werden." : navigationError)
    })
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <Alert className="border-amber-200 bg-amber-50 text-amber-950">
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>{de ? "Verwenden Sie für Ihr Unternehmen freigegebene Formulierungen" : "Use wording approved for your business"}</AlertTitle>
        <AlertDescription className="text-amber-900/80">
          {de ? "Fügen Sie Ihre endgültigen deutschen und englischen Rechtstexte ein. Lassen Sie diese vor der Veröffentlichung von einer qualifizierten Rechtsberatung prüfen." : "Add your final English and German legal wording. A qualified legal professional should review it before you publish."}
        </AlertDescription>
      </Alert>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{de ? "Ihr Fortschritt" : "Your progress"}</p>
            <h2 className="mt-1 text-lg font-semibold">{de ? "Vervollständigen Sie vier Kundendokumente" : "Complete four customer documents"}</h2>
          </div>
          <Badge
            variant={ready ? "outline" : "secondary"}
            className={ready ? "border-emerald-200 bg-emerald-50 text-emerald-700" : undefined}
          >
            {ready ? <CheckCircle2 aria-hidden="true" /> : <FileCheck2 aria-hidden="true" />}
            {de ? `${completedTranslations} von 4 fertig` : `${completedTranslations} of 4 ready`}
          </Badge>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2" aria-label={de ? `${completedTranslations} von 4 Übersetzungen fertig` : `${completedTranslations} of 4 translations ready`}>
          {[0, 1, 2, 3].map((item) => (
            <span
              key={item}
              className={`h-2 rounded-full ${item < completedTranslations ? "bg-emerald-500" : "bg-muted"}`}
            />
          ))}
        </div>
      </section>

      <BilingualDocumentSection
        number="1"
        title={de ? "Mietbedingungen" : "Rental Terms"}
        description={de ? "Erläutern Sie Buchung, Zahlung, Fahrzeugnutzung, Stornierungen, Rückgaben und die Pflichten der Kunden." : "Explain booking, payment, vehicle use, cancellations, returns, and customer responsibilities."}
        value={value.rentalTerms}
        disabled={!canComplete || pending}
        de={de}
        onChange={(locale, field, nextValue) => updateDocument("rentalTerms", locale, field, nextValue)}
      />

      <BilingualDocumentSection
        number="2"
        title={de ? "Datenschutzerklärung" : "Privacy Notice"}
        description={de ? "Erläutern Sie, welche Kundendaten Sie erheben, warum Sie diese benötigen, wie lange Sie sie speichern und wer darauf zugreifen kann." : "Explain what customer information you collect, why you need it, how long you keep it, and who can access it."}
        value={value.privacyNotice}
        disabled={!canComplete || pending}
        de={de}
        onChange={(locale, field, nextValue) => updateDocument("privacyNotice", locale, field, nextValue)}
      />

      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">3</span>
          <div>
            <h2 className="text-lg font-semibold">{de ? "Kundenzustimmung" : "Customer agreement"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{de ? "Diese kurzen Bezeichnungen sehen Kunden während der Buchung." : "These are the short labels customers see during booking."}</p>
          </div>
        </div>
        <label className="mt-5 flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
          <Checkbox
            checked={value.agreement.requireAgreement}
            onCheckedChange={(checked) =>
              setValue((current) =>
                current
                  ? { ...current, agreement: { ...current.agreement, requireAgreement: checked === true } }
                  : current,
              )
            }
            disabled={!canComplete || pending}
          />
          <span>
            <span className="font-medium">{de ? "Bestätigung beider Dokumente durch Kunden verlangen" : "Require customers to confirm both documents"}</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {de ? "Empfohlen. Kunden müssen vor dem Absenden einer Buchung beide Kontrollkästchen aktivieren." : "Recommended. Customers must tick the agreement boxes before submitting a booking."}
            </span>
          </span>
        </label>
        <Tabs defaultValue="en" className="mt-5">
          <TabsList className="grid w-full grid-cols-2 sm:w-80">
            {OWNER_LEGAL_LOCALES.map((locale) => (
              <TabsTrigger key={locale} value={locale}>{languageNames[locale]}</TabsTrigger>
            ))}
          </TabsList>
          {OWNER_LEGAL_LOCALES.map((locale) => {
            const labels = value.agreement.translations.find((translation) => translation.locale === locale)!
            return (
              <TabsContent key={locale} value={locale} className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label={de ? "Link zu den Mietbedingungen" : "Rental Terms link"} htmlFor={`terms-link-${locale}`}>
                  <Input id={`terms-link-${locale}`} value={labels.termsLinkLabel} onChange={(event) => updateAgreement(locale, "termsLinkLabel", event.target.value)} disabled={!canComplete || pending} />
                </Field>
                <Field label={de ? "Kontrollkästchen für Mietbedingungen" : "Rental Terms checkbox"} htmlFor={`terms-checkbox-${locale}`}>
                  <Input id={`terms-checkbox-${locale}`} value={labels.termsCheckboxLabel} onChange={(event) => updateAgreement(locale, "termsCheckboxLabel", event.target.value)} disabled={!canComplete || pending} />
                </Field>
                <Field label={de ? "Link zur Datenschutzerklärung" : "Privacy Notice link"} htmlFor={`privacy-link-${locale}`}>
                  <Input id={`privacy-link-${locale}`} value={labels.privacyLinkLabel} onChange={(event) => updateAgreement(locale, "privacyLinkLabel", event.target.value)} disabled={!canComplete || pending} />
                </Field>
                <Field label={de ? "Kontrollkästchen für Datenschutzerklärung" : "Privacy Notice checkbox"} htmlFor={`privacy-checkbox-${locale}`}>
                  <Input id={`privacy-checkbox-${locale}`} value={labels.privacyCheckboxLabel} onChange={(event) => updateAgreement(locale, "privacyCheckboxLabel", event.target.value)} disabled={!canComplete || pending} />
                </Field>
              </TabsContent>
            )
          })}
        </Tabs>
      </section>

      <section className="sticky bottom-4 z-10 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            {ready ? (
              <span className="inline-flex items-center gap-2 font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {de ? "Beide Sprachen sind fertig" : "Both languages are ready"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <CircleAlert className="h-4 w-4" aria-hidden="true" /> {de ? "Vervollständigen Sie alle vier Sprachregisterkarten" : "Complete all four language tabs to finish"}
              </span>
            )}
          </div>
          <Button type="submit" size="lg" disabled={!ready || !canComplete || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {pending ? (de ? "Wird gespeichert und veröffentlicht…" : "Saving and publishing…") : editing ? (de ? "Änderungen speichern" : "Save changes") : (de ? "Speichern und abschließen" : "Save and finish")}
          </Button>
        </div>
        {message ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {message}
          </p>
        ) : null}
        {!canComplete ? (
          <p className="mt-3 text-sm text-muted-foreground">{de ? "Nur der Geschäftsinhaber kann diese rechtlichen Einstellungen veröffentlichen und abschließen." : "Only the business owner can publish and finish this legal setup."}</p>
        ) : null}
      </section>
    </form>
  )
}

function BilingualDocumentSection({
  number,
  title,
  description,
  value,
  disabled,
  de,
  onChange,
}: {
  number: string
  title: string
  description: string
  value: OwnerDocumentInput
  disabled: boolean
  de: boolean
  onChange: (locale: OwnerLegalLocale, field: "title" | "canonicalContent", value: string) => void
}) {
  const languageNames: Record<OwnerLegalLocale, string> = de
    ? { en: "Englisch", de: "Deutsch" }
    : { en: "English", de: "German" }
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{number}</span>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Tabs defaultValue="en" className="mt-5">
        <TabsList className="grid w-full grid-cols-2 sm:w-80">
          {OWNER_LEGAL_LOCALES.map((locale) => {
            const translation = value.translations.find((item) => item.locale === locale)!
            const complete = translationIsComplete(translation)
            return (
              <TabsTrigger key={locale} value={locale}>
                {languageNames[locale]}
                {complete ? <CheckCircle2 className="text-emerald-600" aria-label={de ? "Vollständig" : "Complete"} /> : <CircleAlert className="text-amber-600" aria-label={de ? "Text erforderlich" : "Needs text"} />}
              </TabsTrigger>
            )
          })}
        </TabsList>
        {OWNER_LEGAL_LOCALES.map((locale) => {
          const translation = value.translations.find((item) => item.locale === locale)!
          const contentLength = translation.canonicalContent.trim().length
          return (
            <TabsContent key={locale} value={locale} className="mt-4 space-y-4">
              <Field label={de ? `Kundentitel auf ${languageNames[locale]}` : `Customer title in ${languageNames[locale]}`} htmlFor={`${title}-title-${locale}`}>
                <Input id={`${title}-title-${locale}`} value={translation.title} onChange={(event) => onChange(locale, "title", event.target.value)} disabled={disabled} />
              </Field>
              <Field label={de ? `${title} auf ${languageNames[locale]}` : `${title} in ${languageNames[locale]}`} htmlFor={`${title}-content-${locale}`}>
                <Textarea id={`${title}-content-${locale}`} className="min-h-72 resize-y leading-6" value={translation.canonicalContent} onChange={(event) => onChange(locale, "canonicalContent", event.target.value)} disabled={disabled} placeholder={de ? `Fügen Sie hier den freigegebenen Text auf ${languageNames[locale]} ein.` : `Paste the approved ${languageNames[locale]} wording here.`} />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className={contentLength >= 80 ? "text-emerald-700" : "text-amber-700"}>
                  {contentLength >= 80 ? (de ? "Text hinzugefügt" : "Wording added") : de ? `Fügen Sie mindestens ${80 - contentLength} weitere Zeichen hinzu` : `Add at least ${80 - contentLength} more characters`}
                </span>
                <span className="text-muted-foreground">{contentLength.toLocaleString(de ? "de-DE" : "en-US")} {de ? "Zeichen" : "characters"}</span>
              </div>
            </TabsContent>
          )
        })}
      </Tabs>
    </section>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  )
}
