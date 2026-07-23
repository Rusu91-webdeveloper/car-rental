"use server"

import { createHash } from "node:crypto"
import { headers } from "next/headers"
import { contactMessageSchema } from "@/lib/contact"
import { getBusinessInfo } from "@/lib/business-info"
import { config } from "@/lib/config"
import { sendContactAcknowledgementEmail, sendContactMessageEmail } from "@/lib/email"
import { enforceRateLimit, RateLimitExceededError } from "@/lib/rate-limit"

const INVALID_RECIPIENTS = new Set(["admin@rentcar.com", "support@rentcar.com"])

export async function submitContactMessage(input: unknown) {
  try {
    const parsed = contactMessageSchema.safeParse(input)
    if (!parsed.success) return { success: false as const, code: "INVALID" as const }

    // A filled honeypot is treated as accepted so automated senders receive no signal.
    if (parsed.data.website) return { success: true as const }

    const requestHeaders = await headers()
    const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    const clientIp = forwarded || requestHeaders.get("x-real-ip") || "unknown"
    await enforceRateLimit("public-contact-ip", clientIp, {
      limit: 5,
      windowMs: 10 * 60_000,
    })
    await enforceRateLimit("public-contact-email", parsed.data.email.toLowerCase(), { limit: 3, windowMs: 10 * 60_000 })

    const businessInfo = await getBusinessInfo()
    const recipients = [...new Set([businessInfo.adminEmail, ...config.adminEmails])]
      .filter((value): value is string => Boolean(value))
      .filter((value) => !INVALID_RECIPIENTS.has(value.toLowerCase()))

    if (!recipients.length) {
      console.error("[CONTACT_EMAIL_ERROR] No owner notification recipient is configured")
      return { success: false as const, code: "UNAVAILABLE" as const }
    }

    const messageKey = createHash("sha256").update(`${parsed.data.email.toLowerCase()}\n${parsed.data.subject}\n${parsed.data.message}`).digest("hex")
    const delivery = await sendContactMessageEmail({
      to: recipients,
      name: parsed.data.name,
      email: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
      locale: parsed.data.locale,
      idempotencyKey: `contact-owner-${messageKey}`,
    })
    if ("error" in delivery) return { success: false as const, code: "DELIVERY" as const }

    const acknowledgement = await sendContactAcknowledgementEmail({
      to: parsed.data.email,
      name: parsed.data.name,
      subject: parsed.data.subject,
      locale: parsed.data.locale,
      idempotencyKey: `contact-customer-${messageKey}`,
    })
    if ("error" in acknowledgement) {
      console.error("[CONTACT_ACKNOWLEDGEMENT_ERROR] Customer acknowledgement could not be delivered")
    }
    return { success: true as const }
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return {
        success: false as const,
        code: "RATE_LIMIT" as const,
        retryAfterSeconds: error.retryAfterSeconds,
      }
    }
    console.error("[CONTACT_MESSAGE_ERROR]", error)
    return { success: false as const, code: "UNAVAILABLE" as const }
  }
}
