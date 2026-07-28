import type React from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { NextIntlClientProvider } from "next-intl"
import { getMessages } from "next-intl/server"
import { DemoBanner } from "@/components/demo-banner"
import { Footer } from "@/components/footer"
import { Toaster } from "@/components/ui/toaster"
import { getBusinessInfo } from "@/lib/business-info"
import { locales } from "@/i18n"

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const isGerman = locale === "de"
  return {
    title: {
      absolute: isGerman ? "Qujo Autovermietung GmbH" : "Qujo Car Rental",
    },
    description: isGerman
      ? "Zuverlässige Mietwagen, transparente Preise und persönlicher Service – einfach online bei Qujo buchen."
      : "Reliable rental cars, transparent prices and personal service — book online with Qujo.",
  }
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
        <Toaster />
      </div>
    </NextIntlClientProvider>
  )
}
