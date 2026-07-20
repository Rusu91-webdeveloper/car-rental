"use client"

import Link from "@/navigation"
import { useState } from "react"
import { PublicPageHeader } from "@/components/public-page-header"
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
    <div className="qujo-page">
      <PublicPageHeader title={t("help.title")} />

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="qujo-kicker mb-3">{t("help.kicker")}</p>
          <h1 className="mb-3 text-4xl font-extrabold sm:text-5xl">{t("help.heading")}</h1>
          <p className="text-lg text-muted-foreground">{t("help.subtitle")}</p>
        </div>

        <div className="space-y-3 mb-8">
          {faqs.map((faq, index) => (
            <div key={index} className="overflow-hidden rounded-[1.1rem] border border-black/[0.07] bg-white shadow-sm">
              <button
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="flex w-full items-center justify-between px-5 py-5 text-left transition-colors hover:bg-[#f6f6f1] sm:px-6"
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
                <div className="border-t border-black/[0.06] px-5 py-5 sm:px-6">
                  <p className="leading-relaxed text-muted-foreground">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-[1.35rem] bg-[#13251d] p-6 text-white sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-8">
          <div>
          <h3 className="mb-2 text-xl font-semibold">{t("help.stillNeedHelpTitle")}</h3>
          <p className="mb-4 text-sm text-white/60 sm:mb-0">{t("help.stillNeedHelpBody")}</p>
          </div>
          <Link
            href="/contact"
            className="inline-block shrink-0 rounded-xl bg-[#cbe85d] px-6 py-3 font-bold text-[#13251d] transition-colors hover:bg-[#d9f477]"
          >
            {t("help.contactSupport")}
          </Link>
        </div>
      </div>
    </div>
  )
}
