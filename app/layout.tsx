import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { getLocale } from "next-intl/server"
import { Providers } from "@/components/providers"
import "./globals.css"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "Qujo Autovermietung GmbH",
    template: "%s | Qujo Autovermietung",
  },
  description: "Zuverlässige Mietwagen, transparente Preise und persönlicher Service – einfach online bei Qujo buchen.",
  applicationName: "Qujo Autovermietung",
  icons: {
    icon: [{ url: "/icon.svg?v=qujo-1", type: "image/svg+xml" }],
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()

  return (
    <html lang={locale} className={`${geist.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
