"use client"

import { useEffect } from "react"
import { signIn } from "next-auth/react"
import { useSearchParams } from "next/navigation"

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
      <div className="min-h-screen flex items-center justify-center bg-muted p-4">
        <div className="max-w-sm rounded-xl border border-border bg-background p-6 text-center shadow-sm">
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
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <div className="text-center">
        <p className="text-muted-foreground">Redirecting to Google sign-in...</p>
      </div>
    </div>
  )
}
