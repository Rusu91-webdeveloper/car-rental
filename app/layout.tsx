import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import { Analytics } from "@vercel/analytics/next"
import { getLocale } from "next-intl/server"
import { config } from "@/lib/config"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "RentCar - Book Your Perfect Ride",
  description:
    "Find and rent the perfect car for your next trip. Choose from luxury, electric, SUV, and sedan options.",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()

  const content = (
    <html lang={locale}>
      <body className={`font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )

  // In demo mode, skip Clerk provider
  if (config.isDemoMode) {
    return content
  }

  // In production mode, wrap with Clerk
  // Clerk will automatically use NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY from environment
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      // Production-specific configuration will be handled via environment variables
      // Clerk reads domain configuration from NEXT_PUBLIC_CLERK_DOMAIN if set
    >
      {content}
    </ClerkProvider>
  )
}
