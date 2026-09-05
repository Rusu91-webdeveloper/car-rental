/**
 * Google is the only OAuth provider for which the application permits
 * email-based account linking. The verified-email guard must run before
 * Auth.js links an OAuth identity to an existing admin-created user.
 */
export const googleAccountLinkingOptions = {
  allowDangerousEmailAccountLinking: true,
} as const

export function hasVerifiedGoogleEmail(profile: unknown): profile is {
  email: string
  email_verified: true
} {
  if (!profile || typeof profile !== "object") {
    return false
  }

  const googleProfile = profile as {
    email?: unknown
    email_verified?: unknown
  }

  return (
    typeof googleProfile.email === "string" &&
    googleProfile.email.length > 0 &&
    googleProfile.email_verified === true
  )
}
