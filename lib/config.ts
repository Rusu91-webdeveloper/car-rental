// Configuration and feature flags
const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const nextAuthSecret = process.env.NEXTAUTH_SECRET
const adminEmailsFromEnv = (
  process.env.ADMIN_EMAILS ||
  process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
  process.env.ADMIN_EMAIL ||
  ""
)
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean)
const smtpEnabled = Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS)

export const config = {
  // App URL
  appUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000",

  // Features
  features: {
    emailEnabled: smtpEnabled || !!process.env.RESEND_API_KEY,
    paymentsEnabled: !!process.env.STRIPE_SECRET_KEY,
    authEnabled: !!googleClientId && !!googleClientSecret && !!nextAuthSecret,
  },

  // Admin emails (automatically get admin role)
  adminEmails: adminEmailsFromEnv.length > 0 ? adminEmailsFromEnv : ["admin@rentcar.com"],
} as const
