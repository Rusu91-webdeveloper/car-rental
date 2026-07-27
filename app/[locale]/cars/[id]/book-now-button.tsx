"use client"

import Link from "@/navigation"
import { useSearchParams } from "next/navigation"
import { useLocale } from "next-intl"

export function BookNowButton({
  carId,
  signInUrl,
  isSignedIn,
  label,
  disabled = false,
}: {
  carId: string
  signInUrl: string
  isSignedIn: boolean
  label: string
  disabled?: boolean
}) {
  const locale = useLocale()
  const searchParams = useSearchParams()
  const pickupDate = searchParams.get("pickupDate")
  const dropoffDate = searchParams.get("dropoffDate")

  // Build checkout URL with date params if they exist
  // Note: Link component from next-intl automatically handles locale prefix
  let checkoutUrl = `/checkout/${carId}`
  const params = new URLSearchParams()
  if (pickupDate) {
    params.set("pickupDate", pickupDate)
  }
  if (dropoffDate) {
    params.set("dropoffDate", dropoffDate)
  }
  if (params.toString()) {
    checkoutUrl += `?${params.toString()}`
  }

  // If not signed in, redirect to sign-in with checkout URL as redirect_url
  // For redirect_url, we need to include the locale since it's used as a query param
  const redirectUrl = `/${locale}/checkout/${carId}${params.toString() ? `?${params.toString()}` : ''}`
  const href = isSignedIn 
    ? checkoutUrl 
    : `${signInUrl}?redirect_url=${encodeURIComponent(redirectUrl)}`

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="cursor-not-allowed rounded-xl bg-muted px-8 py-4 font-semibold text-muted-foreground"
      >
        {label}
      </span>
    )
  }

  return (
    <Link
      href={href}
      className="px-8 py-4 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-colors"
    >
      {label}
    </Link>
  )
}
