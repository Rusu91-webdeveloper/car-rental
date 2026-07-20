"use client"

import type React from "react"
import { useState, useTransition } from "react"
import { useLocale, useTranslations } from "next-intl"
import Link from "@/navigation"
import { submitContactMessage } from "@/app/actions/contact"

const EMPTY_FORM = { name: "", email: "", subject: "", message: "", website: "" }

export function ContactForm() {
  const t = useTranslations("contact")
  const locale = useLocale() === "en" ? "en" : "de"
  const [form, setForm] = useState(EMPTY_FORM)
  const [status, setStatus] = useState<"idle" | "success" | "error" | "rate-limit">("idle")
  const [pending, startTransition] = useTransition()
  const set = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }))

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setStatus("idle")
    startTransition(async () => {
      const result = await submitContactMessage({ ...form, locale })
      if (result.success) {
        setForm(EMPTY_FORM)
        setStatus("success")
      } else {
        setStatus(result.code === "RATE_LIMIT" ? "rate-limit" : "error")
      }
    })
  }

  return (
    <form onSubmit={submit} className="qujo-panel space-y-5 p-6 sm:p-8">
      {status !== "idle" ? (
        <div
          role="status"
          className={`rounded-xl border p-4 text-sm font-medium ${status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}
        >
          {status === "success" ? t("success") : status === "rate-limit" ? t("rateLimit") : t("error")}
        </div>
      ) : null}

      <div className="absolute -left-[10000px]" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => set("website", event.target.value)} />
      </div>

      <Field label={t("form.name")} id="contact-name">
        <input id="contact-name" type="text" autoComplete="name" minLength={2} maxLength={100} value={form.name} onChange={(event) => set("name", event.target.value)} className="qujo-contact-input" required />
      </Field>
      <Field label={t("form.email")} id="contact-email">
        <input id="contact-email" type="email" autoComplete="email" maxLength={254} value={form.email} onChange={(event) => set("email", event.target.value)} className="qujo-contact-input" required />
      </Field>
      <Field label={t("form.subject")} id="contact-subject">
        <input id="contact-subject" type="text" minLength={3} maxLength={160} value={form.subject} onChange={(event) => set("subject", event.target.value)} className="qujo-contact-input" required />
      </Field>
      <Field label={t("form.message")} id="contact-message">
        <textarea id="contact-message" rows={6} minLength={10} maxLength={5000} value={form.message} onChange={(event) => set("message", event.target.value)} className="qujo-contact-input resize-y" required />
      </Field>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("privacy.before")} <Link href="/datenschutz" className="font-medium text-foreground underline underline-offset-2">{t("privacy.link")}</Link> {t("privacy.after")}
      </p>
      <button type="submit" disabled={pending} className="w-full rounded-xl bg-primary py-3.5 font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-wait disabled:opacity-60">
        {pending ? t("form.sending") : t("form.send")}
      </button>
    </form>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div><label htmlFor={id} className="mb-2 block text-sm font-medium">{label}</label>{children}</div>
}
