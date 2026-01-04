import type React from "react"
import { notFound } from "next/navigation"
import { NextIntlClientProvider } from "next-intl"
import { getMessages } from "next-intl/server"
import { DemoBanner } from "@/components/demo-banner"
import { Footer } from "@/components/footer"
import { getBusinessInfo } from "@/lib/business-info"
import { locales } from "@/i18n"

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params
  if (!locales.includes(locale as (typeof locales)[number])) {
    notFound()
  }

  const messages = await getMessages({ locale })
  const businessInfo = await getBusinessInfo()

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="flex min-h-screen flex-col">
        <DemoBanner />
        <main className="flex-1">{children}</main>
        <Footer businessInfo={businessInfo} />
      </div>
    </NextIntlClientProvider>
  )
}
