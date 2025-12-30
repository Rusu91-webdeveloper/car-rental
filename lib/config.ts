// Configuration and feature flags
const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true"
const adminEmailsFromEnv = (process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean)

export const config = {
  // Demo mode - bypasses authentication and payment integrations
  isDemoMode,

  // App URL
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",

  // Features
  features: {
    emailEnabled: !!process.env.RESEND_API_KEY,
    paymentsEnabled: !!process.env.STRIPE_SECRET_KEY && !isDemoMode,
    authEnabled: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !isDemoMode,
  },

  // Admin emails (automatically get admin role)
  adminEmails: adminEmailsFromEnv.length > 0 ? adminEmailsFromEnv : ["admin@rentcar.com"],
} as const

export function requireProduction() {
  if (config.isDemoMode) {
    throw new Error("This feature requires production mode with proper integrations configured")
  }
}
