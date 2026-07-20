"use client"

import { useEffect } from "react"
import { signIn } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import { BrandMark } from "@/components/brand-mark"

export default function SignInPage() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") || searchParams.get("redirect_url") || "/"
  const error = searchParams.get("error")

  useEffect(() => {
    if (error) {
      return
    }

    // Redirect to Google OAuth sign-in
    signIn("google", { callbackUrl })
  }, [callbackUrl, error])

  if (error) {
    const isAccessDenied = error === "AccessDenied"

    return (
      <div className="qujo-page flex min-h-screen items-center justify-center p-4">
        <div className="qujo-panel max-w-sm p-8 text-center">
          <BrandMark className="mb-7 justify-center" />
          <h1 className="text-lg font-semibold mb-2">Sign-in blocked</h1>
          <p className="text-sm text-muted-foreground mb-4">
            {isAccessDenied
              ? "Your account is currently inactive. Please contact an administrator."
              : "Sign-in failed. Please try again."}
          </p>
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl })}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="qujo-page flex min-h-screen items-center justify-center p-4">
      <div className="qujo-panel w-full max-w-sm p-8 text-center">
        <BrandMark className="mb-8 justify-center" />
        <span className="mx-auto mb-4 block h-7 w-7 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <p className="text-sm text-muted-foreground">Redirecting to secure sign-in…</p>
      </div>
    </div>
  )
}
