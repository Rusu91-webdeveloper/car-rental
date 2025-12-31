"use client"

import Link from "@/navigation"
import { useState } from "react"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ClientOnly } from "@/components/client-only"
import { useTranslations } from "next-intl"

export default function HelpPage() {
  const t = useTranslations()
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const faqs = [
    {
      question: t("help.faqs.booking.question"),
      answer: t("help.faqs.booking.answer"),
    },
    {
      question: t("help.faqs.documents.question"),
      answer: t("help.faqs.documents.answer"),
    },
    {
      question: t("help.faqs.modify.question"),
      answer: t("help.faqs.modify.answer"),
    },
    {
      question: t("help.faqs.pricing.question"),
      answer: t("help.faqs.pricing.answer"),
    },
    {
      question: t("help.faqs.late.question"),
      answer: t("help.faqs.late.answer"),
    },
    {
      question: t("help.faqs.longTerm.question"),
      answer: t("help.faqs.longTerm.answer"),
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-background px-4 py-4 border-b border-border sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </Link>
            <h1 className="text-xl font-bold">{t("help.title")}</h1>
          </div>
          <ClientOnly>
            <LanguageSwitcher />
          </ClientOnly>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">{t("help.heading")}</h2>
          <p className="text-muted-foreground">{t("help.subtitle")}</p>
        </div>

        <div className="space-y-3 mb-8">
          {faqs.map((faq, index) => (
            <div key={index} className="border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted transition-colors"
              >
                <span className="font-semibold text-left">{faq.question}</span>
                <svg
                  className={`w-5 h-5 transition-transform ${openFaq === index ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openFaq === index && (
                <div className="px-6 pb-4">
                  <p className="text-muted-foreground leading-relaxed">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="bg-muted p-6 rounded-xl">
          <h3 className="font-semibold mb-2">{t("help.stillNeedHelpTitle")}</h3>
          <p className="text-muted-foreground text-sm mb-4">{t("help.stillNeedHelpBody")}</p>
          <Link
            href="/contact"
            className="inline-block px-6 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-colors"
          >
            {t("help.contactSupport")}
          </Link>
        </div>
      </div>
    </div>
  )
}
