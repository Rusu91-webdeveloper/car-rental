import nodemailer from "nodemailer"
import { Resend } from "resend"
import { formatCents } from "@/lib/money"
import { BOOKING_PAYMENT_WINDOW_HOURS } from "@/lib/constants"
import { getPaymentDetails } from "@/lib/payment-details"
import { prisma } from "@/lib/db"

const resend = new Resend(process.env.RESEND_API_KEY)
const emailFrom = process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || "RentCar <noreply@rentcar.com>"
const smtpHost = process.env.EMAIL_HOST
const smtpPort = process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 587
const smtpUser = process.env.EMAIL_USER
const smtpPass = process.env.EMAIL_PASS
const smtpEnabled = Boolean(smtpHost && smtpUser && smtpPass)
const smtpTransport = smtpEnabled
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })
  : null

type SendEmailInput = {
  to: string | string[]
  subject: string
  html: string
}

/**
 * Validates email configuration and returns status information
 */
export function getEmailConfigStatus() {
  const hasSmtp = Boolean(smtpHost && smtpUser && smtpPass)
  const hasResend = Boolean(process.env.RESEND_API_KEY)
  const isEnabled = hasSmtp || hasResend

  return {
    enabled: isEnabled,
    provider: hasSmtp ? "SMTP" : hasResend ? "Resend" : "None",
    smtp: {
      enabled: hasSmtp,
      host: smtpHost || "Not configured",
      port: smtpPort,
      user: smtpUser ? `${smtpUser.substring(0, 3)}***` : "Not configured",
    },
    resend: {
      enabled: hasResend,
      apiKey: hasResend ? "Configured" : "Not configured",
    },
    from: emailFrom,
  }
}

/**
 * Validates if an email address is in a valid format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function extractEmailAddress(value: string | undefined | null): string {
  if (!value) {
    return ""
  }
  const match = value.match(/<([^>]+)>/)
  return (match?.[1] || value).trim()
}

type EmailLocale = "de" | "en"

function normalizeEmailLocale(locale: string | undefined | null): EmailLocale {
  if (!locale) {
    return "de"
  }
  return locale.toLowerCase().startsWith("de") ? "de" : "en"
}

function resolveSupportEmail(settings: { supportEmail?: string | null; companyEmail?: string | null } | null): string {
  return (
    settings?.supportEmail ||
    settings?.companyEmail ||
    process.env.SUPPORT_EMAIL ||
    process.env.ADMIN_EMAIL ||
    process.env.EMAIL_USER ||
    extractEmailAddress(emailFrom)
  )
}

async function sendEmail({ to, subject, html }: SendEmailInput) {
  const configStatus = getEmailConfigStatus()

  // Validate email configuration
  if (!configStatus.enabled) {
    const errorMsg = "Email provider not configured. Please set SMTP credentials (EMAIL_HOST, EMAIL_USER, EMAIL_PASS) or RESEND_API_KEY"
    console.error("[EMAIL_ERROR] Configuration:", configStatus)
    console.error("[EMAIL_ERROR]", errorMsg)
    return { error: errorMsg }
  }

  // Validate recipient email addresses
  const recipients = Array.isArray(to) ? to : [to]
  const invalidEmails = recipients.filter((email) => !isValidEmail(email))
  if (invalidEmails.length > 0) {
    const errorMsg = `Invalid email address(es): ${invalidEmails.join(", ")}`
    console.error("[EMAIL_ERROR]", errorMsg)
    return { error: errorMsg }
  }

  // Log email configuration status
  console.log(`[EMAIL] Sending via ${configStatus.provider} to:`, recipients.join(", "))

  // Try SMTP first if configured
  if (smtpTransport) {
    try {
      const info = await smtpTransport.sendMail({
        from: emailFrom,
        to,
        subject,
        html,
      })

      console.log(`[EMAIL] SMTP email sent successfully (messageId: ${info.messageId})`)
      return { id: info.messageId }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown SMTP error"
      console.error("[EMAIL_ERROR] SMTP send failed:", {
        error: errorMessage,
        host: smtpHost,
        port: smtpPort,
        user: smtpUser,
        to: recipients,
      })
      return { error: `SMTP error: ${errorMessage}` }
    }
  }

  // Fallback to Resend
  if (!process.env.RESEND_API_KEY) {
    const errorMsg = "Email provider not configured. SMTP failed and Resend API key is missing"
    console.error("[EMAIL_ERROR]", errorMsg)
    return { error: errorMsg }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to,
      subject,
      html,
    })

    if (error) {
      console.error("[EMAIL_ERROR] Resend send failed:", {
        error: error.message || "Unknown Resend error",
        to: recipients,
      })
      return { error: error.message || "Failed to send email via Resend" }
    }

    console.log(`[EMAIL] Resend email sent successfully (id: ${data?.id})`)
    return { id: data?.id }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Resend error"
    console.error("[EMAIL_ERROR] Resend exception:", {
      error: errorMessage,
      to: recipients,
    })
    return { error: `Resend error: ${errorMessage}` }
  }
}

interface BookingEmailData {
  to: string
  userName: string
  carName: string
  pickupDate: string
  dropoffDate: string
  location: string
  totalPrice: number
  currency?: string
  guaranteeAmount?: number
  transferCode?: string
  paymentMethod?: "TRANSFER" | "PAY_AT_PICKUP" | "CARD"
  bookingNumber: string
  locale?: "de" | "en"
}

export async function sendBookingConfirmationEmail(data: BookingEmailData) {
  try {
    const configStatus = getEmailConfigStatus()
    console.log("[EMAIL] Attempting to send booking confirmation email:", {
      to: data.to,
      bookingNumber: data.bookingNumber,
      carName: data.carName,
      emailEnabled: configStatus.enabled,
      provider: configStatus.provider,
    })

    if (!configStatus.enabled) {
      console.warn("[EMAIL] Email is disabled. Skipping booking confirmation email.")
      return { error: "Email is not configured" }
    }

    if (!isValidEmail(data.to)) {
      console.error("[EMAIL_ERROR] Invalid recipient email:", data.to)
      return { error: `Invalid email address: ${data.to}` }
    }

    const companySettings = await prisma.companySettings.findUnique({
      where: { id: "company-settings" },
      select: {
        companyName: true,
        companyEmail: true,
        supportEmail: true,
      },
    })
    const companyName = companySettings?.companyName || "RentCar"
    const supportEmail = resolveSupportEmail(companySettings)
    const locale = normalizeEmailLocale(data.locale)
    const isGerman = locale === "de"

    const isTransfer = (data.paymentMethod || "TRANSFER") === "TRANSFER"
    const paymentMethodLabel = isTransfer
      ? isGerman
        ? "Bankuberweisung"
        : "Bank Transfer"
      : data.paymentMethod === "CARD"
        ? isGerman
          ? "Karte"
          : "Card"
        : isGerman
          ? "Zahlung bei Abholung"
          : "Pay at Pickup"
    const guaranteeAmount = data.guaranteeAmount ?? 0
    const guaranteeDetailsHtml =
      guaranteeAmount > 0
        ? `
                  <div class="detail-row">
                    <span><strong>${isGerman ? "Erstattbare Kautionsreservierung:" : "Refundable Guarantee Hold:"}</strong></span>
                    <span>${formatCents(guaranteeAmount)}</span>
                  </div>
        `
        : ""
    const transferCodeHtml =
      isTransfer && data.transferCode
        ? `
                <div class="transfer-code">
                  ${isGerman ? "Uberweisungscode" : "Transfer Code"}: ${data.transferCode}
                </div>
                <p style="text-align: center; color: #666; font-size: 14px;">${isGerman ? "Bitte diesen Code bei der Fahrzeugabholung vorzeigen." : "Please show this code when picking up your vehicle"}</p>
          `
        : ""
    const nextStepsHtml = isTransfer
      ? `
                  <li>${isGerman ? "Speichern Sie Ihren Uberweisungscode" : "Save your transfer code"} (${data.transferCode || "-"})</li>
                  <li>${isGerman ? "Bitte einen gultigen Fuhrerschein mitbringen" : "Bring a valid driver's license"}</li>
                  <li>${isGerman ? "Bitte 15 Minuten vor der Abholung am Standort sein" : "Arrive at the pickup location 15 minutes early"}</li>
        `
      : `
                  <li>${isGerman ? "Bitte einen gultigen Fuhrerschein mitbringen" : "Bring a valid driver's license"}</li>
                  <li>${isGerman ? "Bitte 15 Minuten vor der Abholung am Standort sein" : "Arrive at the pickup location 15 minutes early"}</li>
                  <li>${isGerman ? "Die Zahlung bei Abholung mit der gewahlten Methode abschliessen" : "Complete payment using your selected method at pickup"}</li>
        `

    const { id, error } = await sendEmail({
      to: data.to,
      subject: `${isGerman ? "Buchung bestatigt" : "Booking Confirmed"} - ${data.carName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #0066FF; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
              .transfer-code { background: #fff; border: 2px dashed #0066FF; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0; border-radius: 4px; }
              .details { background: white; padding: 20px; border-radius: 4px; margin: 20px 0; }
              .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🚗 ${isGerman ? "Buchung bestatigt!" : "Booking Confirmed!"}</h1>
              </div>
              <div class="content">
                <p>${isGerman ? "Hallo" : "Hi"} ${data.userName},</p>
                <p>${isGerman ? "Gute Nachrichten! Ihre Buchung wurde bestatigt. Hier sind Ihre Buchungsdetails:" : "Great news! Your booking has been confirmed. Here are your booking details:"}</p>
                ${transferCodeHtml}
                
                <div class="details">
                  <div class="detail-row">
                    <span><strong>${isGerman ? "Buchungsnummer" : "Booking Number"}:</strong></span>
                    <span>${data.bookingNumber}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>${isGerman ? "Fahrzeug" : "Vehicle"}:</strong></span>
                    <span>${data.carName}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>${isGerman ? "Abholung" : "Pick-up"}:</strong></span>
                    <span>${data.pickupDate}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>${isGerman ? "Ruckgabe" : "Drop-off"}:</strong></span>
                    <span>${data.dropoffDate}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>${isGerman ? "Standort" : "Location"}:</strong></span>
                    <span>${data.location}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>${isGerman ? "Zahlungsmethode" : "Payment Method"}:</strong></span>
                    <span>${paymentMethodLabel}</span>
                  </div>
                  ${guaranteeDetailsHtml}
                  <div class="detail-row" style="border-bottom: none;">
                    <span><strong>${isGerman ? "Gesamtpreis" : "Total Price"}:</strong></span>
                    <span style="color: #0066FF; font-weight: bold;">${formatCents(data.totalPrice, data.currency)}</span>
                  </div>
                </div>
                ${
                  guaranteeAmount > 0
                    ? `<p style="font-size: 13px; color: #4b5563; margin-top: 10px;">
                    ${isGerman ? "Die Garantie ist eine vorubergehende Sicherheitsreservierung und keine zusatzliche Mietgebuhr. Sie wird nach der Ruckgabe freigegeben, wenn keine Schaden, Bussgelder oder Verstosse vorliegen." : "The guarantee is a temporary security hold and not an extra rental fee. It is released after return if there are no damages, fines, or policy violations."}
                  </p>`
                    : ""
                }
                
                <p><strong>${isGerman ? "Nachste Schritte" : "Next Steps"}:</strong></p>
                <ul>
                  ${nextStepsHtml}
                </ul>
              </div>
              <div class="footer">
                <p>${isGerman ? "Fragen? Kontaktieren Sie uns unter" : "Questions? Contact us at"} ${supportEmail}</p>
                <p>&copy; ${new Date().getFullYear()} ${companyName}. ${isGerman ? "Alle Rechte vorbehalten." : "All rights reserved."}</p>
              </div>
            </div>
          </body>
        </html>
      `,
    })

    if (error) {
      console.error("[EMAIL_ERROR] Booking confirmation failed:", {
        error,
        to: data.to,
        bookingNumber: data.bookingNumber,
        carName: data.carName,
      })
      return { error }
    }

    console.log("[EMAIL] ✅ Booking confirmation sent successfully:", {
      to: data.to,
      bookingNumber: data.bookingNumber,
      id: id || "unknown",
    })
    return { success: true, id }
  } catch (error) {
    console.error("[EMAIL_ERROR] Booking confirmation exception:", {
      error: error instanceof Error ? error.message : "Unknown error",
      to: data.to,
      bookingNumber: data.bookingNumber,
    })
    return { error: "Failed to send booking confirmation email" }
  }
}

export async function sendBookingStatusEmail(
  to: string,
  userName: string,
  carName: string,
  status: string,
  bookingNumber: string,
  locale?: "de" | "en",
) {
  try {
    const configStatus = getEmailConfigStatus()
    console.log("[EMAIL] Attempting to send booking status email:", {
      to,
      status,
      bookingNumber,
      carName,
      emailEnabled: configStatus.enabled,
      provider: configStatus.provider,
    })

    if (!configStatus.enabled) {
      console.warn("[EMAIL] Email is disabled. Skipping booking status email.")
      return { error: "Email is not configured" }
    }

    if (!isValidEmail(to)) {
      console.error("[EMAIL_ERROR] Invalid recipient email:", to)
      return { error: `Invalid email address: ${to}` }
    }

    const emailLocale = normalizeEmailLocale(locale)
    const isGerman = emailLocale === "de"
    let subject = ""
    let message = ""

    switch (status) {
      case "CONFIRMED":
        subject = `${isGerman ? "Buchung bestatigt" : "Booking Confirmed"} - ${carName}`
        message = isGerman
          ? "Ihre Buchung wurde von unserem Team bestatigt. Alles ist bereit."
          : "Your booking has been confirmed by our team. You're all set!"
        break
      case "CANCELLED":
        subject = `${isGerman ? "Buchung storniert" : "Booking Cancelled"} - ${carName}`
        message = isGerman
          ? "Ihre Buchung wurde storniert. Bei Fragen kontaktieren Sie bitte den Support."
          : "Your booking has been cancelled. If you have any questions, please contact support."
        break
      case "REJECTED":
        subject = `${isGerman ? "Buchungsupdate" : "Booking Update"} - ${carName}`
        message =
          isGerman
            ? "Leider konnen wir Ihre Buchung derzeit nicht bearbeiten. Bitte kontaktieren Sie den Support fur weitere Informationen."
            : "Unfortunately, we cannot process your booking at this time. Please contact support for more information."
        break
      default:
        console.log("[EMAIL] Status email skipped for status:", status)
        return { success: true }
    }

    const companySettings = await prisma.companySettings.findUnique({
      where: { id: "company-settings" },
      select: {
        companyEmail: true,
        supportEmail: true,
      },
    })
    const supportEmail = resolveSupportEmail(companySettings)

    const { id, error } = await sendEmail({
      to,
      subject,
      html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2>${isGerman ? "Buchungsstatus-Update" : "Booking Status Update"}</h2>
              <p>${isGerman ? "Hallo" : "Hi"} ${userName},</p>
              <p>${message}</p>
              <p><strong>${isGerman ? "Buchungsnummer" : "Booking Number"}:</strong> ${bookingNumber}</p>
              <p><strong>${isGerman ? "Fahrzeug" : "Vehicle"}:</strong> ${carName}</p>
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 14px;">${isGerman ? "Fragen? Kontaktieren Sie uns unter" : "Questions? Contact us at"} ${supportEmail}</p>
            </div>
          </body>
        </html>
      `,
    })

    if (error) {
      console.error("[EMAIL_ERROR] Booking status email failed:", {
        error,
        to,
        status,
        bookingNumber,
      })
      return { error }
    }

    console.log("[EMAIL] ✅ Booking status email sent successfully:", {
      to,
      status,
      bookingNumber,
      id: id || "unknown",
    })
    return { success: true, id }
  } catch (error) {
    console.error("[EMAIL_ERROR] Booking status email exception:", {
      error: error instanceof Error ? error.message : "Unknown error",
      to,
      status,
      bookingNumber,
    })
    return { error: "Failed to send booking status email" }
  }
}

export async function sendBookingCompletionReviewEmail(data: {
  to: string
  userName: string
  carName: string
  bookingNumber: string
  pickupDate: string
  dropoffDate: string
  reviewUrl: string
  locale?: "de" | "en"
}) {
  try {
    const configStatus = getEmailConfigStatus()
    console.log("[EMAIL] Attempting to send booking completion review email:", {
      to: data.to,
      bookingNumber: data.bookingNumber,
      carName: data.carName,
      emailEnabled: configStatus.enabled,
      provider: configStatus.provider,
    })

    if (!configStatus.enabled) {
      console.warn("[EMAIL] Email is disabled. Skipping booking completion review email.")
      return { error: "Email is not configured" }
    }

    if (!isValidEmail(data.to)) {
      console.error("[EMAIL_ERROR] Invalid recipient email:", data.to)
      return { error: `Invalid email address: ${data.to}` }
    }

    const companySettings = await prisma.companySettings.findUnique({
      where: { id: "company-settings" },
    })

    const companyName = companySettings?.companyName || "Car Rental Company"
    const supportEmail = resolveSupportEmail(companySettings)
    const locale = normalizeEmailLocale(data.locale)
    const isGerman = locale === "de"

    const { id, error } = await sendEmail({
      to: data.to,
      subject: `${isGerman ? "Vielen Dank fur Ihre Buchung" : "Thank you for choosing us"} - ${data.carName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background: #f3f4f6; }
              .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
              .header { background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); color: white; padding: 30px 24px; text-align: center; }
              .content { padding: 28px 24px; }
              .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; margin: 18px 0; }
              .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
              .row:last-child { border-bottom: none; }
              .button-wrap { text-align: center; margin: 26px 0; }
              .button { display: inline-block; background: #2563eb; color: white !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; }
              .footer { text-align: center; padding: 22px 20px; color: #6b7280; font-size: 13px; background: #f9fafb; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin:0 0 8px 0;">${isGerman ? "Vielen Dank fur Ihre Buchung" : "Thank you for your booking"}</h1>
                <p style="margin:0; opacity:0.95;">${isGerman ? "Wir hoffen, Sie hatten eine gute Mieterfahrung." : "We hope you enjoyed your rental experience."}</p>
              </div>
              <div class="content">
                <p>${isGerman ? "Hallo" : "Hi"} ${data.userName},</p>
                <p>${isGerman ? "Ihre Buchung wurde erfolgreich abgeschlossen. Vielen Dank fur Ihr Vertrauen." : "Your booking has been completed successfully. We appreciate your trust."}</p>

                <div class="card">
                  <div class="row"><span><strong>${isGerman ? "Buchungsnummer" : "Booking Number"}</strong></span><span>${data.bookingNumber}</span></div>
                  <div class="row"><span><strong>${isGerman ? "Fahrzeug" : "Vehicle"}</strong></span><span>${data.carName}</span></div>
                  <div class="row"><span><strong>${isGerman ? "Abholung" : "Pick-up"}</strong></span><span>${data.pickupDate}</span></div>
                  <div class="row"><span><strong>${isGerman ? "Ruckgabe" : "Drop-off"}</strong></span><span>${data.dropoffDate}</span></div>
                </div>

                <p>${isGerman ? "Nehmen Sie sich eine Minute Zeit fur eine Bewertung? Ihr Feedback hilft uns, besser zu werden." : "Would you take a minute to rate your experience? Your feedback helps us improve."}</p>
                <div class="button-wrap">
                  <a class="button" href="${data.reviewUrl}">${isGerman ? "Bewertung abgeben" : "Leave a Review"}</a>
                </div>
              </div>
              <div class="footer">
                <p>${isGerman ? "Fragen? Kontaktieren Sie uns unter" : "Questions? Contact us at"} ${supportEmail}</p>
                <p>&copy; ${new Date().getFullYear()} ${companyName}. ${isGerman ? "Alle Rechte vorbehalten." : "All rights reserved."}</p>
              </div>
            </div>
          </body>
        </html>
      `,
    })

    if (error) {
      console.error("[EMAIL_ERROR] Booking completion review email failed:", {
        error,
        to: data.to,
        bookingNumber: data.bookingNumber,
      })
      return { error }
    }

    console.log("[EMAIL] ✅ Booking completion review email sent successfully:", {
      to: data.to,
      bookingNumber: data.bookingNumber,
      id: id || "unknown",
    })
    return { success: true, id }
  } catch (error) {
    console.error("[EMAIL_ERROR] Booking completion review email exception:", {
      error: error instanceof Error ? error.message : "Unknown error",
      to: data.to,
      bookingNumber: data.bookingNumber,
    })
    return { error: "Failed to send booking completion review email" }
  }
}

// Manual Payment Email for Users
export async function sendManualPaymentEmail(data: {
  to: string
  userName: string
  carName: string
  pickupDate: string
  dropoffDate: string
  location: string
  totalPrice: number
  currency?: string
  depositAmount: number
  guaranteeAmount: number
  transferCode: string
  bookingNumber: string
  locale?: "de" | "en"
}) {
  try {
    const configStatus = getEmailConfigStatus()
    console.log("[EMAIL] Attempting to send manual payment email:", {
      to: data.to,
      bookingNumber: data.bookingNumber,
      carName: data.carName,
      emailEnabled: configStatus.enabled,
      provider: configStatus.provider,
    })

    if (!configStatus.enabled) {
      console.warn("[EMAIL] Email is disabled. Skipping manual payment email.")
      return { error: "Email is not configured" }
    }

    if (!isValidEmail(data.to)) {
      console.error("[EMAIL_ERROR] Invalid recipient email:", data.to)
      return { error: `Invalid email address: ${data.to}` }
    }

    // Get payment details and company settings from database
    const paymentDetails = await getPaymentDetails()
    const companySettings = await prisma.companySettings.findUnique({
      where: { id: "company-settings" },
    })

    const companyName = companySettings?.companyName || "Car Rental Company"
    const supportEmail = resolveSupportEmail(companySettings)
    const locale = normalizeEmailLocale(data.locale)
    const isGerman = locale === "de"
    const depositPercentage = companySettings?.depositPercentage ?? 0.2
    const depositPercent = Math.round(depositPercentage * 100)
    const guaranteePercentage = companySettings?.guaranteePercentage ?? 0
    const guaranteePercent = Math.round(guaranteePercentage * 100)
    const remainingRentalAtPickup = Math.max(data.totalPrice - data.depositAmount, 0)

    const { id, error } = await sendEmail({
      to: data.to,
      subject: `${isGerman ? "Buchung bestatigt!" : "Booking Confirmed!"} - ${data.bookingNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 0 auto; background: #f5f5f5; }
              .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 20px; text-align: center; }
              .header h1 { margin: 0 0 10px 0; font-size: 28px; font-weight: bold; }
              .header p { margin: 0; font-size: 16px; opacity: 0.95; }
              .content { background: white; padding: 30px; }
              .booking-number-box { background: #f3f4f6; border-radius: 12px; padding: 20px; margin: 20px 0; }
              .booking-number-label { font-size: 14px; color: #6b7280; margin-bottom: 8px; }
              .booking-number-value { font-family: monospace; font-size: 24px; font-weight: bold; color: #111827; }
              .transfer-code-box { background: #eff6ff; border: 2px solid #3b82f6; border-radius: 12px; padding: 20px; margin: 20px 0; }
              .transfer-code-label { font-size: 14px; font-weight: 600; color: #3b82f6; margin-bottom: 8px; }
              .transfer-code-value { font-family: monospace; font-size: 28px; font-weight: bold; color: #3b82f6; letter-spacing: 2px; margin-bottom: 8px; }
              .transfer-code-hint { font-size: 12px; color: #6b7280; }
              .booking-details { margin: 30px 0; }
              .booking-details h3 { font-size: 18px; font-weight: 600; margin-bottom: 15px; color: #111827; }
              .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
              .detail-row:last-child { border-bottom: none; }
              .detail-label { color: #6b7280; }
              .detail-value { font-weight: 500; color: #111827; }
              .payment-box { background: #fffbeb; border: 1px solid #fbbf24; border-radius: 12px; padding: 20px; margin: 30px 0; }
              .payment-box h4 { margin: 0 0 15px 0; font-size: 18px; font-weight: 600; color: #92400e; display: flex; align-items: center; gap: 8px; }
              .payment-warning { font-size: 14px; color: #78350f; margin-bottom: 15px; }
              .payment-amounts { background: white; border-radius: 8px; padding: 15px; margin: 15px 0; }
              .payment-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
              .payment-row.total { font-size: 18px; font-weight: bold; }
              .bank-details { background: white; border-radius: 8px; padding: 15px; margin: 15px 0; }
              .bank-details h5 { margin: 0 0 10px 0; font-size: 16px; font-weight: 600; color: #92400e; }
              .bank-detail-row { margin: 8px 0; font-size: 14px; }
              .bank-detail-label { font-weight: 600; color: #111827; }
              .bank-detail-value { color: #111827; }
              .reference-code { font-family: monospace; font-size: 18px; font-weight: bold; color: #3b82f6; margin-top: 10px; }
              .important-note { font-size: 12px; margin-top: 15px; color: #92400e; }
              .important-note strong { color: #78350f; }
              .next-steps { background: #eff6ff; border: 1px solid #3b82f6; border-radius: 12px; padding: 20px; margin: 30px 0; }
              .next-steps h4 { margin: 0 0 15px 0; font-size: 18px; font-weight: 600; color: #1e40af; }
              .next-steps ol { margin: 10px 0; padding-left: 20px; }
              .next-steps li { margin: 8px 0; font-size: 14px; color: #1e40af; }
              .footer { text-align: center; padding: 30px 20px; color: #6b7280; font-size: 14px; background: #f9fafb; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>${isGerman ? "Buchung bestatigt!" : "Booking Confirmed!"}</h1>
                <p>${isGerman ? "Ihre Reservierung wurde erfolgreich erstellt" : "Your reservation has been created successfully"}</p>
              </div>
              <div class="content">
                <!-- Booking Number -->
                <div class="booking-number-box">
                  <div class="booking-number-label">${isGerman ? "Buchungsnummer" : "Booking Number"}</div>
                  <div class="booking-number-value">${data.bookingNumber}</div>
                </div>

                <!-- Transfer Reference Code -->
                <div class="transfer-code-box">
                  <div class="transfer-code-label">${isGerman ? "Uberweisungsreferenzcode" : "Transfer Reference Code"}</div>
                  <div class="transfer-code-value">${data.transferCode}</div>
                  <div class="transfer-code-hint">${isGerman ? "Bitte diesen Code als Verwendungszweck bei der Zahlung nutzen" : "Use this code as reference when making payment"}</div>
                </div>

                <!-- Booking Details -->
                <div class="booking-details">
                  <h3>${isGerman ? "Buchungsdetails" : "Booking Details"}</h3>
                  <div class="detail-row">
                    <span class="detail-label">${isGerman ? "Fahrzeug:" : "Car:"}</span>
                    <span class="detail-value">${data.carName}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">${isGerman ? "Abholung:" : "Pick-up:"}</span>
                    <span class="detail-value">${data.pickupDate}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">${isGerman ? "Ruckgabe:" : "Drop-off:"}</span>
                    <span class="detail-value">${data.dropoffDate}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">${isGerman ? "Standort:" : "Location:"}</span>
                    <span class="detail-value">${data.location}</span>
                  </div>
                </div>

                <!-- Payment Required -->
                <div class="payment-box">
                  <h4>⚠️ ${isGerman ? "Zahlung erforderlich" : "Payment Required"}</h4>
                  <p style="margin-bottom: 8px;">${isGerman ? "Bitte zahlen Sie per Bankuberweisung:" : "Please complete payment via bank transfer:"}</p>
                  <p class="payment-warning">
                    <strong>${isGerman ? `Bitte innerhalb von ${BOOKING_PAYMENT_WINDOW_HOURS} Stunden bezahlen, sonst wird die Buchung storniert.` : `Pay within ${BOOKING_PAYMENT_WINDOW_HOURS} hours or the booking will be cancelled.`}</strong>
                  </p>
                  
                  <div class="payment-amounts">
                    <div class="payment-row">
                      <span>${isGerman ? "Anzahlung" : "Deposit"} (${depositPercent}%):</span>
                      <strong>${formatCents(data.depositAmount, data.currency)}</strong>
                    </div>
                    <div class="payment-row">
                      <span>${isGerman ? "Restbetrag bei Abholung:" : "Remaining rental at pickup:"}</span>
                      <strong>${formatCents(remainingRentalAtPickup)}</strong>
                    </div>
                    <div class="payment-row total">
                      <span>${isGerman ? "Gesamtbetrag" : "Total Amount"}:</span>
                      <strong style="color: #3b82f6;">${formatCents(data.totalPrice, data.currency)}</strong>
                    </div>
                    ${
                      data.guaranteeAmount > 0
                        ? `<div class="payment-row">
                      <span>${isGerman ? "Erstattbare Garantie" : "Refundable Guarantee"} (${guaranteePercent}%):</span>
                      <strong>${formatCents(data.guaranteeAmount, data.currency)}</strong>
                    </div>`
                        : ""
                    }
                  </div>

                  <div class="bank-details">
                    <h5>${isGerman ? "Bankdaten" : "Bank Details"}</h5>
                    <div class="bank-detail-row">
                      <span class="bank-detail-label">${isGerman ? "Bankname:" : "Bank Name:"}</span>
                      <span class="bank-detail-value">${paymentDetails.bankName}</span>
                    </div>
                    <div class="bank-detail-row">
                      <span class="bank-detail-label">${isGerman ? "Kontoinhaber:" : "Account Name:"}</span>
                      <span class="bank-detail-value">${paymentDetails.accountName}</span>
                    </div>
                    <div class="bank-detail-row">
                      <span class="bank-detail-label">${isGerman ? "Kontonummer:" : "Account Number:"}</span>
                      <span class="bank-detail-value">${paymentDetails.accountNumber}</span>
                    </div>
                    <div class="bank-detail-row">
                      <span class="bank-detail-label">${isGerman ? "SWIFT-Code:" : "Swift Code:"}</span>
                      <span class="bank-detail-value">${paymentDetails.swiftCode}</span>
                    </div>
                    ${paymentDetails.iban ? `
                    <div class="bank-detail-row">
                      <span class="bank-detail-label">IBAN:</span>
                      <span class="bank-detail-value">${paymentDetails.iban}</span>
                    </div>
                    ` : ''}
                    <div class="bank-detail-row">
                      <span class="bank-detail-label">${isGerman ? "Verwendungszweck:" : "Reference:"}</span>
                      <span class="reference-code">${data.transferCode}</span>
                    </div>
                  </div>

                  <p class="important-note">
                    <strong>${isGerman ? "Wichtig:" : "Important:"}</strong> ${isGerman ? `Bitte den Uberweisungscode <strong>${data.transferCode}</strong> im Verwendungszweck angeben, damit wir Ihre Buchung zuordnen konnen.` : `Include the transfer code <strong>${data.transferCode}</strong> in your payment reference so we can process your booking.`}
                  </p>
                  ${
                    data.guaranteeAmount > 0
                      ? `<p class="important-note"><strong>${isGerman ? "Garantie:" : "Guarantee:"}</strong> ${isGerman ? "Dies ist eine vorubergehende Sicherheitsreservierung und wird nach der Ruckgabe freigegeben, wenn keine Probleme vorliegen." : "This is a temporary security hold and is released after vehicle return if no issues are found."}</p>`
                      : ""
                  }
                </div>

                <!-- Next Steps -->
                <div class="next-steps">
                  <h4>📋 ${isGerman ? "Nachste Schritte" : "Next Steps"}</h4>
                  <ol>
                    <li>${isGerman ? `Die Bankuberweisung innerhalb von ${BOOKING_PAYMENT_WINDOW_HOURS} Stunden abschliessen` : `Complete the bank transfer within ${BOOKING_PAYMENT_WINDOW_HOURS} hours`}</li>
                    <li>${isGerman ? "Sie erhalten eine Bestatigungsmail mit Zahlungsanweisungen" : "You will receive a confirmation email with payment instructions"}</li>
                    <li>${isGerman ? "Sobald die Zahlung gepruft wurde, wird Ihre Buchung bestatigt" : "Once payment is verified, your booking will be confirmed"}</li>
                    <li>${isGerman ? "Danach erhalten Sie eine finale Bestatigung mit Abholdetails" : "You'll receive a final confirmation email with pickup details"}</li>
                  </ol>
                </div>
              </div>
              <div class="footer">
                <p>${isGerman ? "Fragen? Kontaktieren Sie uns unter" : "Questions? Contact us at"} ${supportEmail}</p>
                <p>&copy; ${new Date().getFullYear()} ${companyName}. ${isGerman ? "Alle Rechte vorbehalten." : "All rights reserved."}</p>
              </div>
            </div>
          </body>
        </html>
      `,
    })

    if (error) {
      console.error("[EMAIL_ERROR] Manual payment email failed:", {
        error,
        to: data.to,
        bookingNumber: data.bookingNumber,
        carName: data.carName,
      })
      return { error }
    }

    console.log("[EMAIL] ✅ Manual payment email sent successfully:", {
      to: data.to,
      bookingNumber: data.bookingNumber,
      id: id || "unknown",
    })
    return { success: true, id }
  } catch (error) {
    console.error("[EMAIL_ERROR] Manual payment email exception:", {
      error: error instanceof Error ? error.message : "Unknown error",
      to: data.to,
      bookingNumber: data.bookingNumber,
    })
    return { error: "Failed to send manual payment email" }
  }
}

export async function sendPayAtPickupEmail(data: {
  to: string
  userName: string
  carName: string
  pickupDate: string
  dropoffDate: string
  location: string
  totalPrice: number
  currency?: string
  guaranteeAmount: number
  bookingNumber: string
  locale?: "de" | "en"
}) {
  try {
    const configStatus = getEmailConfigStatus()
    console.log("[EMAIL] Attempting to send pay-at-pickup email:", {
      to: data.to,
      bookingNumber: data.bookingNumber,
      carName: data.carName,
      emailEnabled: configStatus.enabled,
      provider: configStatus.provider,
    })

    if (!configStatus.enabled) {
      console.warn("[EMAIL] Email is disabled. Skipping pay-at-pickup email.")
      return { error: "Email is not configured" }
    }

    if (!isValidEmail(data.to)) {
      console.error("[EMAIL_ERROR] Invalid recipient email:", data.to)
      return { error: `Invalid email address: ${data.to}` }
    }

    const companySettings = await prisma.companySettings.findUnique({
      where: { id: "company-settings" },
    })
    const companyName = companySettings?.companyName || "Car Rental Company"
    const supportEmail = resolveSupportEmail(companySettings)
    const locale = normalizeEmailLocale(data.locale)
    const isGerman = locale === "de"
    const guaranteePercent = Math.round((companySettings?.guaranteePercentage ?? 0) * 100)

    const { id, error } = await sendEmail({
      to: data.to,
      subject: `${isGerman ? "Buchung bestatigt!" : "Booking Confirmed!"} - ${data.bookingNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 0 auto; background: #f5f5f5; }
              .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 20px; text-align: center; }
              .content { background: white; padding: 30px; }
              .box { border-radius: 12px; padding: 20px; margin: 20px 0; }
              .booking-number-box { background: #f3f4f6; }
              .pickup-payment-box { background: #eff6ff; border: 1px solid #3b82f6; }
              .details h3 { font-size: 18px; margin-bottom: 12px; }
              .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
              .detail-row:last-child { border-bottom: none; }
              .footer { text-align: center; padding: 24px 20px; color: #6b7280; font-size: 14px; background: #f9fafb; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>${isGerman ? "Buchung bestatigt!" : "Booking Confirmed!"}</h1>
                <p>${isGerman ? "Ihre Reservierung wurde erfolgreich erstellt" : "Your reservation has been created successfully"}</p>
              </div>
              <div class="content">
                <p>${isGerman ? "Hallo" : "Hi"} ${data.userName},</p>
                <p>${isGerman ? "Ihre Buchung wurde mit <strong>Zahlung bei Abholung</strong> als Zahlungsmethode bestatigt." : "Your booking is confirmed with <strong>Pay at Pickup</strong> as your payment method."}</p>

                <div class="box booking-number-box">
                  <div style="font-size: 14px; color: #6b7280;">${isGerman ? "Buchungsnummer" : "Booking Number"}</div>
                  <div style="font-family: monospace; font-size: 24px; font-weight: bold;">${data.bookingNumber}</div>
                </div>

                <div class="details">
                  <h3>${isGerman ? "Buchungsdetails" : "Booking Details"}</h3>
                  <div class="detail-row"><span>${isGerman ? "Fahrzeug:" : "Car:"}</span><strong>${data.carName}</strong></div>
                  <div class="detail-row"><span>${isGerman ? "Abholung:" : "Pick-up:"}</span><strong>${data.pickupDate}</strong></div>
                  <div class="detail-row"><span>${isGerman ? "Ruckgabe:" : "Drop-off:"}</span><strong>${data.dropoffDate}</strong></div>
                  <div class="detail-row"><span>${isGerman ? "Standort:" : "Location:"}</span><strong>${data.location}</strong></div>
                  <div class="detail-row"><span>${isGerman ? "Gesamtbetrag:" : "Total Amount:"}</span><strong>${formatCents(data.totalPrice, data.currency)}</strong></div>
                  ${
                    data.guaranteeAmount > 0
                      ? `<div class="detail-row"><span>${isGerman ? "Erstattbare Garantie" : "Refundable Guarantee"} (${guaranteePercent}%):</span><strong>${formatCents(data.guaranteeAmount, data.currency)}</strong></div>`
                      : ""
                  }
                </div>

                <div class="box pickup-payment-box">
                  <h3 style="margin: 0 0 8px 0;">${isGerman ? "Zahlung bei Abholung" : "Payment at Pickup"}</h3>
                  <p style="margin: 0;">${isGerman ? "Bitte die Zahlung bei der Fahrzeugabholung abschliessen." : "Please complete payment at pickup when collecting your vehicle."}</p>
                  ${
                    data.guaranteeAmount > 0
                      ? `<p style="margin-top: 8px;">${isGerman ? "Die Garantie ist eine vorubergehende Sicherheitsreservierung und wird nach der Ruckgabe freigegeben, wenn keine Probleme vorliegen." : "The guarantee is a temporary security hold and will be released after return if no issues are found."}</p>`
                      : ""
                  }
                </div>

                <p><strong>${isGerman ? "Nachste Schritte" : "Next steps"}:</strong></p>
                <ol>
                  <li>${isGerman ? "Bitte rechtzeitig am Abholort erscheinen." : "Arrive at the pickup location on time."}</li>
                  <li>${isGerman ? "Buchungsnummer sowie gultigen Ausweis/Fuhrerschein mitbringen." : "Bring your booking number and a valid ID/driving license."}</li>
                  <li>${isGerman ? "Zahlung bei Abholung abschliessen." : "Complete payment at pickup."}</li>
                </ol>
              </div>
              <div class="footer">
                <p>${isGerman ? "Fragen? Kontaktieren Sie uns unter" : "Questions? Contact us at"} ${supportEmail}</p>
                <p>&copy; ${new Date().getFullYear()} ${companyName}. ${isGerman ? "Alle Rechte vorbehalten." : "All rights reserved."}</p>
              </div>
            </div>
          </body>
        </html>
      `,
    })

    if (error) {
      console.error("[EMAIL_ERROR] Pay-at-pickup email failed:", {
        error,
        to: data.to,
        bookingNumber: data.bookingNumber,
      })
      return { error }
    }

    console.log("[EMAIL] ✅ Pay-at-pickup email sent successfully:", {
      to: data.to,
      bookingNumber: data.bookingNumber,
      id: id || "unknown",
    })
    return { success: true, id }
  } catch (error) {
    console.error("[EMAIL_ERROR] Pay-at-pickup email exception:", {
      error: error instanceof Error ? error.message : "Unknown error",
      to: data.to,
      bookingNumber: data.bookingNumber,
    })
    return { error: "Failed to send pay-at-pickup email" }
  }
}

// Admin Notification Email for New Bookings
export async function sendAdminBookingNotification(data: {
  adminEmail?: string
  adminEmails?: string[]
  userName: string
  userEmail: string
  carName: string
  pickupDate: string
  dropoffDate: string
  location: string
  totalPrice: number
  currency?: string
  depositAmount: number
  guaranteeAmount: number
  transferCode: string
  bookingNumber: string
  bookingId: string
  paymentMethod?: "TRANSFER" | "PAY_AT_PICKUP"
}) {
  try {
    const configStatus = getEmailConfigStatus()
    console.log("[EMAIL] Attempting to send admin booking notification:", {
      bookingNumber: data.bookingNumber,
      carName: data.carName,
      emailEnabled: configStatus.enabled,
      provider: configStatus.provider,
    })

    if (!configStatus.enabled) {
      console.warn("[EMAIL] Email is disabled. Skipping admin booking notification.")
      return { error: "Email is not configured" }
    }

    // Get company settings for dynamic values
    const companySettings = await prisma.companySettings.findUnique({
      where: { id: "company-settings" },
    })
    const companyName = companySettings?.companyName || "Car Rental Company"
    const depositPercent = Math.round((companySettings?.depositPercentage ?? 0.2) * 100)
    const guaranteePercent = Math.round((companySettings?.guaranteePercentage ?? 0) * 100)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const recipients = Array.from(
      new Set(
        [data.adminEmail, ...(data.adminEmails || []), companySettings?.adminEmail].filter(
          (email): email is string => Boolean(email),
        ),
      ),
    )

    if (recipients.length === 0) {
      console.error("[EMAIL_ERROR] No admin email configured:", {
        adminEmail: data.adminEmail,
        adminEmails: data.adminEmails,
        companyAdminEmail: companySettings?.adminEmail,
      })
      return { error: "No admin email configured" }
    }

    // Validate admin email addresses
    const invalidEmails = recipients.filter((email) => !isValidEmail(email))
    if (invalidEmails.length > 0) {
      console.error("[EMAIL_ERROR] Invalid admin email addresses:", invalidEmails)
      return { error: `Invalid admin email address(es): ${invalidEmails.join(", ")}` }
    }

    console.log("[EMAIL] Sending admin notification to:", recipients.join(", "))
    const isTransfer = (data.paymentMethod || "TRANSFER") === "TRANSFER"
    const paymentMethodLabel = isTransfer ? "Bank Transfer" : "Pay at Pickup"
    const statusBadge = isTransfer ? "PENDING PAYMENT" : "PAY AT PICKUP"
    const summaryText = isTransfer
      ? "A new booking has been created and is awaiting payment confirmation."
      : "A new booking has been created with payment selected at pickup."
    const actionRequiredText = isTransfer
      ? "⚠️ Action Required: Customer needs to complete bank transfer payment. Confirm booking once payment is received."
      : "ℹ️ Payment Method: Customer selected pay at pickup. Collect payment when handing over the vehicle."
    const paymentDetailsHtml = isTransfer
      ? `
                  <div style="margin-bottom: 10px;">
                    <strong>Transfer Reference Code:</strong>
                    <div class="transfer-code">${data.transferCode}</div>
                    <p style="font-size: 14px; color: #666; margin: 5px 0;">Customer should include this code in their bank transfer</p>
                  </div>
                  <div class="detail-row">
                    <span><strong>Deposit (${depositPercent}%):</strong></span>
                    <span>${formatCents(data.depositAmount, data.currency)}</span>
                  </div>
                  <div class="detail-row" style="border-bottom: none;">
                    <span><strong>Total Amount:</strong></span>
                    <span style="color: #10B981; font-weight: bold; font-size: 18px;">${formatCents(data.totalPrice, data.currency)}</span>
                  </div>
                  ${
                    data.guaranteeAmount > 0
                      ? `<div class="detail-row" style="border-bottom: none;">
                    <span><strong>Refundable Guarantee (${guaranteePercent}%):</strong></span>
                    <span>${formatCents(data.guaranteeAmount, data.currency)}</span>
                  </div>`
                      : ""
                  }
      `
      : `
                  <div class="detail-row">
                    <span><strong>Payment Method:</strong></span>
                    <span>${paymentMethodLabel}</span>
                  </div>
                  <div class="detail-row" style="border-bottom: none;">
                    <span><strong>Amount Due at Pickup:</strong></span>
                    <span style="color: #10B981; font-weight: bold; font-size: 18px;">${formatCents(data.totalPrice, data.currency)}</span>
                  </div>
                  ${
                    data.guaranteeAmount > 0
                      ? `<div class="detail-row" style="border-bottom: none;">
                    <span><strong>Refundable Guarantee (${guaranteePercent}%):</strong></span>
                    <span>${formatCents(data.guaranteeAmount, data.currency)}</span>
                  </div>`
                      : ""
                  }
      `
    const nextStepsHtml = isTransfer
      ? `
                    <li>Wait for customer to complete bank transfer</li>
                    <li>Check bank account for payment with reference: <strong>${data.transferCode}</strong></li>
                    <li>Once payment is confirmed, go to admin dashboard</li>
                    <li>Update booking status to "CONFIRMED"</li>
      `
      : `
                    <li>Prepare the vehicle for pickup</li>
                    <li>Collect payment from the customer at pickup</li>
                    <li>After handover, update booking status to "IN_PROGRESS"</li>
                    <li>Complete booking when vehicle is returned</li>
      `

    const { id, error } = await sendEmail({
      to: recipients,
      subject: `🔔 New Booking - ${data.carName} (${data.bookingNumber})`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
              .alert-box { background: #FFF9E6; border-left: 4px solid #FFB800; padding: 15px; margin: 20px 0; border-radius: 4px; }
              .details { background: white; padding: 20px; border-radius: 4px; margin: 20px 0; }
              .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
              .transfer-code { background: #E8F4FF; border: 2px dashed #0066FF; padding: 10px; text-align: center; font-size: 20px; font-weight: bold; margin: 15px 0; border-radius: 4px; letter-spacing: 2px; color: #0066FF; }
              .action-button { display: inline-block; background: #0066FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🔔 New Booking Received</h1>
              </div>
              <div class="content">
                <p><strong>${summaryText}</strong></p>
                
                <div class="alert-box">
                  <p style="margin: 0;"><strong>${actionRequiredText}</strong></p>
                </div>

                <div class="details">
                  <h3 style="margin-top: 0;">Booking Information</h3>
                  <div class="detail-row">
                    <span><strong>Booking Number:</strong></span>
                    <span>${data.bookingNumber}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Status:</strong></span>
                    <span style="background: #FEF3C7; color: #92400E; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">${statusBadge}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Payment Method:</strong></span>
                    <span>${paymentMethodLabel}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Vehicle:</strong></span>
                    <span>${data.carName}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Pick-up:</strong></span>
                    <span>${data.pickupDate}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Drop-off:</strong></span>
                    <span>${data.dropoffDate}</span>
                  </div>
                  <div class="detail-row" style="border-bottom: none;">
                    <span><strong>Location:</strong></span>
                    <span>${data.location}</span>
                  </div>
                </div>

                <div class="details">
                  <h3 style="margin-top: 0;">Customer Information</h3>
                  <div class="detail-row">
                    <span><strong>Name:</strong></span>
                    <span>${data.userName}</span>
                  </div>
                  <div class="detail-row" style="border-bottom: none;">
                    <span><strong>Email:</strong></span>
                    <span>${data.userEmail}</span>
                  </div>
                </div>

                <div class="details">
                  <h3 style="margin-top: 0;">Payment Details</h3>
                  ${paymentDetailsHtml}
                </div>

                <div style="background: #E8F4FF; padding: 15px; border-radius: 4px; margin: 20px 0;">
                  <h4 style="margin-top: 0; color: #0066FF;">📋 Next Steps:</h4>
                  <ol style="margin: 10px 0; padding-left: 20px;">
                    ${nextStepsHtml}
                  </ol>
                </div>

                <div style="text-align: center; margin: 25px 0;">
                  <a href="${appUrl}/admin" class="action-button">
                    Go to Admin Dashboard →
                  </a>
                </div>
              </div>
              <div class="footer">
                <p>This is an automated notification from your car rental system</p>
                <p>&copy; ${new Date().getFullYear()} ${companyName} Admin</p>
              </div>
            </div>
          </body>
        </html>
      `,
    })

    if (error) {
      console.error("[EMAIL_ERROR] Admin booking notification failed:", {
        error,
        recipients: recipients.join(", "),
        bookingNumber: data.bookingNumber,
      })
      return { error }
    }

    console.log("[EMAIL] ✅ Admin booking notification sent successfully:", {
      recipients: recipients.join(", "),
      bookingNumber: data.bookingNumber,
      id: id || "unknown",
    })
    return { success: true, id }
  } catch (error) {
    console.error("[EMAIL_ERROR] Admin booking notification exception:", {
      error: error instanceof Error ? error.message : "Unknown error",
      bookingNumber: data.bookingNumber,
    })
    return { error: "Failed to send admin booking notification" }
  }
}

// Admin Notification Email for Booking Confirmation
export async function sendAdminBookingConfirmationNotification(data: {
  adminEmail?: string
  adminEmails?: string[]
  userName: string
  userEmail: string
  carName: string
  pickupDate: string
  dropoffDate: string
  location: string
  totalPrice: number
  currency?: string
  guaranteeAmount: number
  transferCode: string
  bookingNumber: string
  bookingId: string
}) {
  try {
    const configStatus = getEmailConfigStatus()
    console.log("[EMAIL] Attempting to send admin booking confirmation notification:", {
      bookingNumber: data.bookingNumber,
      carName: data.carName,
      emailEnabled: configStatus.enabled,
      provider: configStatus.provider,
    })

    if (!configStatus.enabled) {
      console.warn("[EMAIL] Email is disabled. Skipping admin booking confirmation notification.")
      return { error: "Email is not configured" }
    }

    // Get company settings for dynamic values
    const companySettings = await prisma.companySettings.findUnique({
      where: { id: "company-settings" },
    })
    const companyName = companySettings?.companyName || "Car Rental Company"
    const guaranteePercent = Math.round((companySettings?.guaranteePercentage ?? 0) * 100)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const recipients = Array.from(
      new Set(
        [data.adminEmail, ...(data.adminEmails || []), companySettings?.adminEmail].filter(
          (email): email is string => Boolean(email),
        ),
      ),
    )

    if (recipients.length === 0) {
      console.error("[EMAIL_ERROR] No admin email configured:", {
        adminEmail: data.adminEmail,
        adminEmails: data.adminEmails,
        companyAdminEmail: companySettings?.adminEmail,
      })
      return { error: "No admin email configured" }
    }

    // Validate admin email addresses
    const invalidEmails = recipients.filter((email) => !isValidEmail(email))
    if (invalidEmails.length > 0) {
      console.error("[EMAIL_ERROR] Invalid admin email addresses:", invalidEmails)
      return { error: `Invalid admin email address(es): ${invalidEmails.join(", ")}` }
    }

    console.log("[EMAIL] Sending admin confirmation notification to:", recipients.join(", "))

    const { id, error } = await sendEmail({
      to: recipients,
      subject: `✅ Booking Confirmed - ${data.carName} (${data.bookingNumber})`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
              .success-box { background: #D1FAE5; border-left: 4px solid #10B981; padding: 15px; margin: 20px 0; border-radius: 4px; }
              .details { background: white; padding: 20px; border-radius: 4px; margin: 20px 0; }
              .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
              .transfer-code { background: #E8F4FF; border: 2px dashed #0066FF; padding: 10px; text-align: center; font-size: 20px; font-weight: bold; margin: 15px 0; border-radius: 4px; letter-spacing: 2px; color: #0066FF; }
              .action-button { display: inline-block; background: #0066FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>✅ Booking Confirmed</h1>
              </div>
              <div class="content">
                <p><strong>A booking has been confirmed and is ready for pickup.</strong></p>
                
                <div class="success-box">
                  <p style="margin: 0;"><strong>✅ Confirmed:</strong> Payment received and booking is confirmed. Customer has been notified.</p>
                </div>

                <div class="details">
                  <h3 style="margin-top: 0;">Booking Information</h3>
                  <div class="detail-row">
                    <span><strong>Booking Number:</strong></span>
                    <span>${data.bookingNumber}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Status:</strong></span>
                    <span style="background: #D1FAE5; color: #065F46; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">CONFIRMED</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Vehicle:</strong></span>
                    <span>${data.carName}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Pick-up:</strong></span>
                    <span>${data.pickupDate}</span>
                  </div>
                  <div class="detail-row">
                    <span><strong>Drop-off:</strong></span>
                    <span>${data.dropoffDate}</span>
                  </div>
                  <div class="detail-row" style="border-bottom: none;">
                    <span><strong>Location:</strong></span>
                    <span>${data.location}</span>
                  </div>
                </div>

                <div class="details">
                  <h3 style="margin-top: 0;">Customer Information</h3>
                  <div class="detail-row">
                    <span><strong>Name:</strong></span>
                    <span>${data.userName}</span>
                  </div>
                  <div class="detail-row" style="border-bottom: none;">
                    <span><strong>Email:</strong></span>
                    <span>${data.userEmail}</span>
                  </div>
                </div>

                <div class="details">
                  <h3 style="margin-top: 0;">Payment Details</h3>
                  <div style="margin-bottom: 10px;">
                    <strong>Transfer Reference Code:</strong>
                    <div class="transfer-code">${data.transferCode}</div>
                  </div>
                  <div class="detail-row" style="border-bottom: none;">
                    <span><strong>Total Amount:</strong></span>
                    <span style="color: #10B981; font-weight: bold; font-size: 18px;">${formatCents(data.totalPrice, data.currency)}</span>
                  </div>
                  ${
                    data.guaranteeAmount > 0
                      ? `<div class="detail-row" style="border-bottom: none;">
                    <span><strong>Refundable Guarantee (${guaranteePercent}%):</strong></span>
                    <span>${formatCents(data.guaranteeAmount, data.currency)}</span>
                  </div>`
                      : ""
                  }
                </div>

                <div style="background: #E8F4FF; padding: 15px; border-radius: 4px; margin: 20px 0;">
                  <h4 style="margin-top: 0; color: #0066FF;">📋 Next Steps:</h4>
                  <ol style="margin: 10px 0; padding-left: 20px;">
                    <li>Prepare the vehicle for pickup</li>
                    <li>Verify customer's transfer code: <strong>${data.transferCode}</strong></li>
                    <li>Ensure all documentation is ready</li>
                    <li>Customer will arrive on: <strong>${data.pickupDate}</strong></li>
                  </ol>
                </div>

                <div style="text-align: center; margin: 25px 0;">
                  <a href="${appUrl}/admin" class="action-button">
                    View Booking Details →
                  </a>
                </div>
              </div>
              <div class="footer">
                <p>This is an automated notification from your car rental system</p>
                <p>&copy; ${new Date().getFullYear()} ${companyName} Admin</p>
              </div>
            </div>
          </body>
        </html>
      `,
    })

    if (error) {
      console.error("[EMAIL_ERROR] Admin booking confirmation notification failed:", {
        error,
        recipients: recipients.join(", "),
        bookingNumber: data.bookingNumber,
      })
      return { error }
    }

    console.log("[EMAIL] ✅ Admin booking confirmation notification sent successfully:", {
      recipients: recipients.join(", "),
      bookingNumber: data.bookingNumber,
      id: id || "unknown",
    })
    return { success: true, id }
  } catch (error) {
    console.error("[EMAIL_ERROR] Admin booking confirmation notification exception:", {
      error: error instanceof Error ? error.message : "Unknown error",
      bookingNumber: data.bookingNumber,
    })
    return { error: "Failed to send admin booking confirmation notification" }
  }
}
