// Configuration and feature flags
const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const nextAuthSecret = process.env.NEXTAUTH_SECRET
const adminEmailsFromEnv = (
  process.env.ADMIN_EMAILS ||
  process.env.ADMIN_EMAIL ||
  ""
)
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean)

export const config = {
  // App URL
  appUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000",

  // Features
  features: {
    emailEnabled: !!process.env.RESEND_API_KEY,
    authEnabled: !!googleClientId && !!googleClientSecret && !!nextAuthSecret,
  },

  // Admin emails (automatically get admin role)
  adminEmails:
    adminEmailsFromEnv.length > 0
      ? adminEmailsFromEnv
      : process.env.NODE_ENV === "production"
        ? []
        : ["admin@rentcar.com"],
} as const
