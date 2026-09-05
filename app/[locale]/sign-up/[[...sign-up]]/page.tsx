"use client"

import { useEffect } from "react"
import { signIn } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"

export default function SignUpPage() {
  const t = useTranslations("auth")
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") || searchParams.get("redirect_url") || "/"

  useEffect(() => {
    // Google OAuth handles both sign-in and sign-up
    // Redirect to Google OAuth sign-in
    signIn("google", { callbackUrl })
  }, [callbackUrl])

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <div className="text-center">
        <p className="text-muted-foreground">{t("redirectingToSignUp")}</p>
      </div>
    </div>
  )
}
