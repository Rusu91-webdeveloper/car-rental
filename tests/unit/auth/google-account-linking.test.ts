import { describe, expect, it } from "vitest"
import {
  googleAccountLinkingOptions,
  hasVerifiedGoogleEmail,
} from "@/lib/auth/google-account-linking"

describe("Google account linking", () => {
  it("enables email linking for the Google provider", () => {
    expect(googleAccountLinkingOptions).toEqual({
      allowDangerousEmailAccountLinking: true,
    })
  })

  it("accepts only a non-empty email explicitly verified by Google", () => {
    expect(
      hasVerifiedGoogleEmail({
        email: "admin@example.com",
        email_verified: true,
      }),
    ).toBe(true)

    expect(
      hasVerifiedGoogleEmail({
        email: "admin@example.com",
        email_verified: false,
      }),
    ).toBe(false)
    expect(hasVerifiedGoogleEmail({ email: "admin@example.com" })).toBe(false)
    expect(hasVerifiedGoogleEmail({ email: "", email_verified: true })).toBe(false)
    expect(hasVerifiedGoogleEmail(null)).toBe(false)
  })
})
