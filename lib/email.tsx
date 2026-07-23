import { createHash } from "node:crypto"
import nodemailer, { type Transporter } from "nodemailer"
import { formatCents } from "@/lib/money"
import { BOOKING_PAYMENT_WINDOW_HOURS } from "@/lib/constants"
import { getPaymentDetails } from "@/lib/payment-details"
import { prisma } from "@/lib/db"
import { logger } from "@/lib/logger"

const safeEmailConsole = {
  log(message: string, ...discarded: unknown[]) {
    void message
    void discarded
    logger.info("email.operation_succeeded")
  },
  warn(message: string, ...discarded: unknown[]) {
    void message
    void discarded
    logger.warn("email.operation_skipped")
  },
  error(message: string, ...discarded: unknown[]) {
    void message
    void discarded
    logger.error("email.operation_failed")
  },
}
const gmailUser = (process.env.GMAIL_SMTP_USER || process.env.EMAIL_USER)?.trim()
const gmailAppPassword = (process.env.GMAIL_SMTP_APP_PASSWORD || process.env.EMAIL_PASS)?.replace(/\s+/g, "")
const emailFrom = process.env.EMAIL_FROM || (gmailUser ? `Qujo Autovermietung <${gmailUser}>` : "Qujo Autovermietung <noreply@qujo.de>")
let smtpTransport: Transporter | undefined

function getSmtpTransport() {
  if (!gmailUser || !gmailAppPassword) {
    throw new Error("Gmail SMTP is not configured")
  }
  smtpTransport ??= nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  })
  return smtpTransport
}

type SendEmailInput = {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
  idempotencyKey?: string
}

/**
 * Validates email configuration and returns status information
 */
export function getEmailConfigStatus() {
  const hasGmailSmtp = Boolean(gmailUser && gmailAppPassword)

  return {
    enabled: hasGmailSmtp,
    provider: hasGmailSmtp ? "Gmail SMTP" : "None",
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

type LegalAcceptanceEmailReference = {
  type: "RENTAL_TERMS" | "PRIVACY_NOTICE"
  versionNumber: number
  acceptedAt: Date
}

function legalAcceptanceReferencesHtml(references: LegalAcceptanceEmailReference[] | undefined, locale: EmailLocale) {
  if (!references?.length) return ""
  const language = locale === "de" ? "de-DE" : "en-US"
  return references
    .map(
      (reference) =>
        `<div class="detail-row"><span class="detail-label">${reference.type === "RENTAL_TERMS" ? (locale === "de" ? "Mietbedingungen" : "Rental Terms") : locale === "de" ? "Datenschutzhinweis" : "Privacy Notice"}:</span><span class="detail-value">v${reference.versionNumber} · ${reference.acceptedAt.toLocaleString(language)}</span></div>`,
    )
    .join("")
}

function normalizeEmailLocale(locale: string | undefined | null): EmailLocale {
  if (!locale) {
    return "de"
  }
  return locale.toLowerCase().startsWith("de") ? "de" : "en"
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

function configuredTextHtml(value: string | undefined) {
  return value ? escapeHtml(value).replace(/\r?\n/g, "<br>") : ""
}

function resolveSupportEmail(
  settings: {
    supportEmail?: string | null
    companyEmail?: string | null
  } | null,
): string {
  return settings?.supportEmail || settings?.companyEmail || process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL || extractEmailAddress(emailFrom)
}

async function sendEmail({ to, subject, html, replyTo, idempotencyKey }: SendEmailInput) {
  const configStatus = getEmailConfigStatus()

  // Validate email configuration
  if (!configStatus.enabled) {
    const errorMsg = "Email provider not configured. Please set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD"
    safeEmailConsole.error("[EMAIL_ERROR] Configuration:", configStatus)
    safeEmailConsole.error("[EMAIL_ERROR]", errorMsg)
    return { error: errorMsg }
  }

  // Validate recipient email addresses
  const recipients = Array.isArray(to) ? to : [to]
  const invalidEmails = recipients.filter((email) => !isValidEmail(email))
  if (invalidEmails.length > 0) {
    const errorMsg = `Invalid email address(es): ${invalidEmails.join(", ")}`
    safeEmailConsole.error("[EMAIL_ERROR]", errorMsg)
    return { error: errorMsg }
  }

  // Log email configuration status
  safeEmailConsole.log(`[EMAIL] Sending via ${configStatus.provider} to:`, recipients.join(", "))

  try {
    const messageIdDomain = gmailUser?.split("@")[1] || "qujo-email.local"
    const messageId = idempotencyKey
      ? `<${createHash("sha256").update(idempotencyKey).digest("hex")}@${messageIdDomain}>`
      : undefined
    const result = await getSmtpTransport().sendMail({
      from: emailFrom,
      to,
      subject: subject
        .replace(/[\r\n]+/g, " ")
        .trim()
        .slice(0, 255),
      html,
      ...(replyTo ? { replyTo } : {}),
      ...(messageId ? { messageId } : {}),
    })

    safeEmailConsole.log(`[EMAIL] Gmail SMTP email accepted (id: ${result.messageId})`)
    return { id: result.messageId }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Gmail SMTP error"
    safeEmailConsole.error("[EMAIL_ERROR] Gmail SMTP exception:", {
      error: errorMessage,
      to: recipients,
    })
    return { error: "Email delivery failed" }
  }
}

export async function sendContactMessageEmail(input: {
  to: string[]
  name: string
  email: string
  subject: string
  message: string
  locale: "de" | "en"
  idempotencyKey?: string
}) {
  const labels =
    input.locale === "de"
      ? {
          heading: "Neue Nachricht über das Kontaktformular",
          name: "Name",
          email: "E-Mail",
          subject: "Betreff",
          message: "Nachricht",
        }
      : {
          heading: "New contact form message",
          name: "Name",
          email: "Email",
          subject: "Subject",
          message: "Message",
        }

  return sendEmail({
    to: input.to,
    replyTo: input.email,
    idempotencyKey: input.idempotencyKey,
    subject: `[Kontakt] ${input.subject}`,
    html: `
      <!doctype html>
      <html lang="${input.locale}">
        <body style="margin:0;background:#f5f6f3;color:#17231d;font-family:Arial,sans-serif;line-height:1.6">
          <div style="max-width:640px;margin:0 auto;padding:32px 20px">
            <div style="background:#fff;border:1px solid #e2e7e3;border-radius:16px;padding:28px">
              <p style="margin:0 0 8px;color:#5f6d65;font-size:13px;text-transform:uppercase;letter-spacing:.08em">Qujo Autovermietung GmbH</p>
              <h1 style="margin:0 0 24px;font-size:24px">${labels.heading}</h1>
              <p><strong>${labels.name}:</strong> ${escapeHtml(input.name)}</p>
              <p><strong>${labels.email}:</strong> <a href="mailto:${escapeHtml(input.email)}">${escapeHtml(input.email)}</a></p>
              <p><strong>${labels.subject}:</strong> ${escapeHtml(input.subject)}</p>
              <div style="margin-top:24px;padding-top:20px;border-top:1px solid #e2e7e3">
                <p style="margin:0 0 8px"><strong>${labels.message}</strong></p>
                <p style="margin:0;white-space:pre-wrap">${escapeHtml(input.message)}</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
  })
}

export async function sendContactAcknowledgementEmail(input: { to: string; name: string; subject: string; locale: "de" | "en"; idempotencyKey: string }) {
  const isGerman = input.locale === "de"
  const companySettings = await prisma.companySettings.findUnique({
    where: { id: "company-settings" },
    select: { companyName: true, companyEmail: true, supportEmail: true },
  })
  const companyName = companySettings?.companyName || "Qujo Autovermietung GmbH"
  const supportEmail = resolveSupportEmail(companySettings)
  return sendEmail({
    to: input.to,
    replyTo: supportEmail || undefined,
    idempotencyKey: input.idempotencyKey,
    subject: isGerman ? `Wir haben Ihre Nachricht erhalten: ${input.subject}` : `We received your message: ${input.subject}`,
    html: `
      <!doctype html>
      <html lang="${input.locale}">
        <body style="margin:0;background:#f5f6f3;color:#17231d;font-family:Arial,sans-serif;line-height:1.6">
          <div style="max-width:640px;margin:0 auto;padding:32px 20px">
            <div style="background:#fff;border:1px solid #e2e7e3;border-radius:16px;padding:28px">
              <p style="margin:0 0 8px;color:#5f6d65;font-size:13px;text-transform:uppercase;letter-spacing:.08em">${escapeHtml(companyName)}</p>
              <h1 style="margin:0 0 18px;font-size:24px">${isGerman ? "Vielen Dank für Ihre Nachricht" : "Thank you for your message"}</h1>
              <p>${isGerman ? "Hallo" : "Hello"} ${escapeHtml(input.name)},</p>
              <p>${isGerman ? "wir haben Ihre Anfrage erhalten und melden uns so schnell wie möglich bei Ihnen." : "we received your enquiry and will reply as soon as possible."}</p>
              <p><strong>${isGerman ? "Betreff" : "Subject"}:</strong> ${escapeHtml(input.subject)}</p>
              <p style="margin-top:24px;color:#5f6d65;font-size:14px">${isGerman ? "Bei dringenden Fragen erreichen Sie uns unter" : "For urgent questions, contact us at"} ${escapeHtml(supportEmail)}.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  })
}

type BookingApplicationEmailData = {
  applicationId: string
  to: string
  userName: string
  carName: string
  pickupDate: string
  returnDate: string
  location: string
  locale: "de" | "en"
  idempotencyKey: string
}

function applicationDetailsHtml(data: Omit<BookingApplicationEmailData, "to">, isGerman: boolean) {
  return `
    <div style="margin:22px 0;padding:18px;border:1px solid #e2e7e3;border-radius:12px;background:#f8faf8">
      <p style="margin:0 0 8px"><strong>${isGerman ? "Fahrzeug" : "Vehicle"}:</strong> ${escapeHtml(data.carName)}</p>
      <p style="margin:0 0 8px"><strong>${isGerman ? "Abholung" : "Pick-up"}:</strong> ${escapeHtml(data.pickupDate)}</p>
      <p style="margin:0 0 8px"><strong>${isGerman ? "Rückgabe" : "Return"}:</strong> ${escapeHtml(data.returnDate)}</p>
      <p style="margin:0"><strong>${isGerman ? "Ort" : "Location"}:</strong> ${escapeHtml(data.location)}</p>
    </div>
  `
}

function applicationEmailHtml(input: {
  locale: "de" | "en"
  userName: string
  heading: string
  body: string
  details: string
  actionUrl?: string
  actionLabel?: string
}) {
  const isGerman = input.locale === "de"
  return `
    <!doctype html>
    <html lang="${input.locale}">
      <body style="margin:0;background:#f5f6f3;color:#17231d;font-family:Arial,sans-serif;line-height:1.6">
        <div style="max-width:640px;margin:0 auto;padding:32px 20px">
          <div style="background:#fff;border:1px solid #e2e7e3;border-radius:16px;padding:28px">
            <p style="margin:0 0 8px;color:#5f6d65;font-size:13px;text-transform:uppercase;letter-spacing:.08em">Qujo Autovermietung GmbH</p>
            <h1 style="margin:0 0 18px;font-size:24px">${input.heading}</h1>
            <p>${isGerman ? "Hallo" : "Hello"} ${escapeHtml(input.userName)},</p>
            <p>${input.body}</p>
            ${input.details}
            ${input.actionUrl && input.actionLabel ? `<p style="margin:26px 0 4px"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#123c2d;color:#fff;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">${input.actionLabel}</a></p>` : ""}
          </div>
        </div>
      </body>
    </html>
  `
}

export async function sendBookingApplicationSubmittedEmail(data: BookingApplicationEmailData) {
  const isGerman = data.locale === "de"
  return sendEmail({
    to: data.to,
    idempotencyKey: data.idempotencyKey,
    subject: isGerman ? `Ihre Unterlagen werden geprüft – ${data.carName}` : `Your documents are being reviewed – ${data.carName}`,
    html: applicationEmailHtml({
      locale: data.locale,
      userName: data.userName,
      heading: isGerman ? "Unterlagen erfolgreich eingereicht" : "Documents submitted successfully",
      body: isGerman
        ? "Wir haben Ihre Unterlagen erhalten. Unser Team prüft sie jetzt. Sie erhalten eine weitere E-Mail, sobald die Prüfung abgeschlossen ist oder wir ein neues Dokument benötigen."
        : "We received your documents and our team is reviewing them now. We will email you again when the review is complete or if a replacement document is required.",
      details: applicationDetailsHtml(data, isGerman),
      actionUrl: `${configAppUrl()}/${data.locale}/applications/${data.applicationId}`,
      actionLabel: isGerman ? "Antrag ansehen" : "View application",
    }),
  })
}

export async function sendAdminBookingApplicationNotification(
  data: Omit<BookingApplicationEmailData, "to"> & {
    to: string[]
    customerEmail: string
  },
) {
  const isGerman = data.locale === "de"
  return sendEmail({
    to: data.to,
    replyTo: data.customerEmail,
    idempotencyKey: data.idempotencyKey,
    subject: isGerman ? `Neue Dokumentenprüfung – ${data.carName}` : `New document review – ${data.carName}`,
    html: applicationEmailHtml({
      locale: data.locale,
      userName: isGerman ? "Team" : "Team",
      heading: isGerman ? "Ein neuer Antrag wartet auf Prüfung" : "A new application is ready for review",
      body: `${isGerman ? "Kunde" : "Customer"}: ${escapeHtml(data.userName)} (${escapeHtml(data.customerEmail)})`,
      details: applicationDetailsHtml(data, isGerman),
      actionUrl: `${configAppUrl()}/${data.locale}/admin/documents/applications/${data.applicationId}`,
      actionLabel: isGerman ? "Unterlagen prüfen" : "Review documents",
    }),
  })
}

export async function sendDocumentReviewDecisionEmail(
  data: BookingApplicationEmailData & {
    decision: "REJECTED" | "REPLACEMENT_REQUIRED"
    documentName: string
    reason?: string
  },
) {
  const isGerman = data.locale === "de"
  const replacement = data.decision === "REPLACEMENT_REQUIRED"
  const reason = data.reason?.trim()
  const reasonHtml = reason ? `<br><strong>${isGerman ? "Hinweis des Prüfteams" : "Reviewer note"}:</strong> ${escapeHtml(reason)}` : ""
  return sendEmail({
    to: data.to,
    idempotencyKey: data.idempotencyKey,
    subject: isGerman ? `Aktion erforderlich: ${data.documentName}` : `Action required: ${data.documentName}`,
    html: applicationEmailHtml({
      locale: data.locale,
      userName: data.userName,
      heading: isGerman ? "Ein Dokument benötigt Ihre Aufmerksamkeit" : "A document needs your attention",
      body: replacement
        ? isGerman
          ? `Bitte laden Sie eine neue Version von „${escapeHtml(data.documentName)}“ hoch.${reasonHtml}`
          : `Please upload a new version of “${escapeHtml(data.documentName)}”.${reasonHtml}`
        : isGerman
          ? `„${escapeHtml(data.documentName)}“ konnte nicht freigegeben werden. Bitte öffnen Sie Ihren Antrag und folgen Sie den angezeigten Schritten.${reasonHtml}`
          : `“${escapeHtml(data.documentName)}” could not be approved. Open your application and follow the steps shown.${reasonHtml}`,
      details: applicationDetailsHtml(data, isGerman),
      actionUrl: `${configAppUrl()}/${data.locale}/applications/${data.applicationId}`,
      actionLabel: isGerman ? "Dokument ersetzen" : "Replace document",
    }),
  })
}

export async function sendBookingApplicationCancelledEmail(data: BookingApplicationEmailData & { reason?: string }) {
  const isGerman = data.locale === "de"
  const reasonHtml = data.reason?.trim() ? `<br><strong>${isGerman ? "Grund" : "Reason"}:</strong> ${escapeHtml(data.reason)}` : ""
  return sendEmail({
    to: data.to,
    idempotencyKey: data.idempotencyKey,
    subject: isGerman ? `Antrag storniert – ${data.carName}` : `Application cancelled – ${data.carName}`,
    html: applicationEmailHtml({
      locale: data.locale,
      userName: data.userName,
      heading: isGerman ? "Ihr Buchungsantrag wurde storniert" : "Your booking application was cancelled",
      body: `${isGerman ? "Der Buchungsantrag wurde storniert. Bei Fragen antworten Sie bitte auf diese E-Mail." : "The booking application was cancelled. Reply to this email if you have questions."}${reasonHtml}`,
      details: applicationDetailsHtml(data, isGerman),
    }),
  })
}

function configAppUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "")
}

export async function sendProductionAlertTest(input: { to: string; requestedAt: Date; environment: string }) {
  return sendEmail({
    to: input.to,
    subject: "[TEST ONLY] Car Rental production alert delivery verification",
    html: `
      <!doctype html>
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h1>TEST ONLY — production alert delivery verification</h1>
          <p>This message verifies that the configured operational alert path can deliver a test notification.</p>
          <p><strong>Environment:</strong> ${escapeHtml(input.environment)}</p>
          <p><strong>Requested at:</strong> ${escapeHtml(input.requestedAt.toISOString())}</p>
          <p>No production incident has been detected.</p>
        </body>
      </html>
    `,
  })
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
  insuranceName?: string
  insuranceSubtotal?: number
  legalReferences?: LegalAcceptanceEmailReference[]
  confirmationHeading?: string
  confirmationContent?: string
  paymentMode?: "BOOKING_REQUEST" | "BANK_TRANSFER" | "CASH_ON_PICKUP"
  paymentInstructions?: string
  showPaymentInstructions?: boolean
  idempotencyKey?: string
}

export async function sendBookingConfirmationEmail(data: BookingEmailData) {
  try {
    const configStatus = getEmailConfigStatus()
    safeEmailConsole.log("[EMAIL] Attempting to send booking confirmation email:", {
      to: data.to,
      bookingNumber: data.bookingNumber,
      carName: data.carName,
      emailEnabled: configStatus.enabled,
      provider: configStatus.provider,
    })

    if (!configStatus.enabled) {
      safeEmailConsole.warn("[EMAIL] Email is disabled. Skipping booking confirmation email.")
      return { error: "Email is not configured" }
    }

    if (!isValidEmail(data.to)) {
      safeEmailConsole.error("[EMAIL_ERROR] Invalid recipient email:", data.to)
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
    const companyName = companySettings?.companyName || "Qujo Autovermietung"
    const supportEmail = resolveSupportEmail(companySettings)
    const locale = normalizeEmailLocale(data.locale)
    const isGerman = locale === "de"

    const paymentMode = data.paymentMode
    const isTransfer = paymentMode ? paymentMode === "BANK_TRANSFER" : (data.paymentMethod || "TRANSFER") === "TRANSFER"
    const paymentMethodLabel =
      paymentMode === "BOOKING_REQUEST"
        ? isGerman
          ? "Rechnung"
          : "Invoice"
        : paymentMode === "BANK_TRANSFER"
          ? isGerman
            ? "Banküberweisung"
            : "Bank Transfer"
          : paymentMode === "CASH_ON_PICKUP"
            ? isGerman
              ? "Barzahlung bei Abholung"
              : "Cash at Pickup"
            : isTransfer
              ? isGerman
                ? "Banküberweisung"
                : "Bank Transfer"
              : data.paymentMethod === "CARD"
                ? isGerman
                  ? "Karte"
                  : "Card"
                : isGerman
                  ? "Zahlung bei Abholung"
                  : "Pay at Pickup"
    const confirmationHeading = data.confirmationHeading?.trim() || (isGerman ? "Buchung bestätigt!" : "Booking Confirmed!")
    const subjectHeading = confirmationHeading.replace(/[\r\n]+/g, " ")
    const configuredContentHtml = configuredTextHtml(data.confirmationContent)
    const paymentInstructionsHtml =
      data.showPaymentInstructions && data.paymentInstructions
        ? `<div class="payment-instructions"><strong>${isGerman ? "Zahlungsanweisungen" : "Payment Instructions"}</strong><p>${configuredTextHtml(data.paymentInstructions)}</p></div>`
        : ""
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
      isTransfer && !paymentMode && data.transferCode
        ? `
                <div class="transfer-code">
                  ${isGerman ? "Überweisungscode" : "Transfer Code"}: ${data.transferCode}
                </div>
                <p style="text-align: center; color: #666; font-size: 14px;">${isGerman ? "Bitte diesen Code bei der Fahrzeugabholung vorzeigen." : "Please show this code when picking up your vehicle"}</p>
          `
        : ""
    const nextStepsHtml = paymentMode
      ? `
                  <li>${isGerman ? "Folgen Sie den oben angegebenen Zahlungsanweisungen" : "Follow the payment instructions shown above"}</li>
                  <li>${isGerman ? "Bitte einen gültigen Führerschein mitbringen" : "Bring a valid driver's license"}</li>
                  <li>${isGerman ? "Bitte 15 Minuten vor der Abholung am Standort sein" : "Arrive at the pickup location 15 minutes early"}</li>
        `
      : isTransfer
        ? `
                  <li>${isGerman ? "Speichern Sie Ihren Überweisungscode" : "Save your transfer code"} (${data.transferCode || "-"})</li>
                  <li>${isGerman ? "Bitte einen gültigen Führerschein mitbringen" : "Bring a valid driver's license"}</li>
                  <li>${isGerman ? "Bitte 15 Minuten vor der Abholung am Standort sein" : "Arrive at the pickup location 15 minutes early"}</li>
        `
        : `
                  <li>${isGerman ? "Bitte einen gültigen Führerschein mitbringen" : "Bring a valid driver's license"}</li>
                  <li>${isGerman ? "Bitte 15 Minuten vor der Abholung am Standort sein" : "Arrive at the pickup location 15 minutes early"}</li>
                  <li>${isGerman ? "Die Zahlung bei Abholung mit der gewählten Methode abschließen" : "Complete payment using your selected method at pickup"}</li>
        `

    const { id, error } = await sendEmail({
      to: data.to,
      subject: `${subjectHeading} - ${data.carName}`,
      idempotencyKey: data.idempotencyKey || `booking-confirmation-${data.bookingNumber}`,
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
              .payment-instructions { background: #fff; border-left: 4px solid #0066FF; padding: 16px; margin: 20px 0; border-radius: 4px; }
              .details { background: white; padding: 20px; border-radius: 4px; margin: 20px 0; }
              .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🚗 ${escapeHtml(confirmationHeading)}</h1>
              </div>
              <div class="content">
                <p>${isGerman ? "Hallo" : "Hi"} ${data.userName},</p>
                <p>${isGerman ? "Gute Nachrichten! Ihre Buchung wurde bestätigt. Hier sind Ihre Buchungsdetails:" : "Great news! Your booking has been confirmed. Here are your booking details:"}</p>
                ${configuredContentHtml ? `<p>${configuredContentHtml}</p>` : ""}
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
                    <span><strong>${isGerman ? "Rückgabe" : "Drop-off"}:</strong></span>
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
                ${paymentInstructionsHtml}
                ${
                  guaranteeAmount > 0
                    ? `<p style="font-size: 13px; color: #4b5563; margin-top: 10px;">
                    ${isGerman ? "Die Garantie ist eine vorübergehende Sicherheitsreservierung und keine zusätzliche Mietgebühr. Sie wird nach der Rückgabe freigegeben, wenn keine Schäden, Bußgelder oder Verstöße vorliegen." : "The guarantee is a temporary security hold and not an extra rental fee. It is released after return if there are no damages, fines, or policy violations."}
                  </p>`
                    : ""
                }
                
                <p><strong>${isGerman ? "Nächste Schritte" : "Next Steps"}:</strong></p>
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
      safeEmailConsole.error("[EMAIL_ERROR] Booking confirmation failed:", {
        error,
        to: data.to,
        bookingNumber: data.bookingNumber,
        carName: data.carName,
      })
      return { error }
    }

    safeEmailConsole.log("[EMAIL] ✅ Booking confirmation sent successfully:", {
      to: data.to,
      bookingNumber: data.bookingNumber,
      id: id || "unknown",
    })
    return { success: true, id }
  } catch (error) {
    safeEmailConsole.error("[EMAIL_ERROR] Booking confirmation exception:", {
      error: error instanceof Error ? error.message : "Unknown error",
      to: data.to,
      bookingNumber: data.bookingNumber,
    })
    return { error: "Failed to send booking confirmation email" }
  }
}

export async function sendBookingStatusEmail(to: string, userName: string, carName: string, status: string, bookingNumber: string, locale?: "de" | "en") {
  try {
    const configStatus = getEmailConfigStatus()
    safeEmailConsole.log("[EMAIL] Attempting to send booking status email:", {
      to,
      status,
      bookingNumber,
      carName,
      emailEnabled: configStatus.enabled,
      provider: configStatus.provider,
    })

    if (!configStatus.enabled) {
      safeEmailConsole.warn("[EMAIL] Email is disabled. Skipping booking status email.")
      return { error: "Email is not configured" }
    }

    if (!isValidEmail(to)) {
      safeEmailConsole.error("[EMAIL_ERROR] Invalid recipient email:", to)
      return { error: `Invalid email address: ${to}` }
    }

    const emailLocale = normalizeEmailLocale(locale)
    const isGerman = emailLocale === "de"
    let subject = ""
    let message = ""

    switch (status) {
      case "CONFIRMED":
        subject = `${isGerman ? "Buchung bestätigt" : "Booking Confirmed"} - ${carName}`
        message = isGerman ? "Ihre Buchung wurde von unserem Team bestätigt. Alles ist bereit." : "Your booking has been confirmed by our team. You're all set!"
        break
      case "CANCELLED":
        subject = `${isGerman ? "Buchung storniert" : "Booking Cancelled"} - ${carName}`
        message = isGerman
          ? "Ihre Buchung wurde storniert. Bei Fragen kontaktieren Sie bitte den Support."
          : "Your booking has been cancelled. If you have any questions, please contact support."
        break
      case "REJECTED":
        subject = `${isGerman ? "Buchungsupdate" : "Booking Update"} - ${carName}`
        message = isGerman
          ? "Leider können wir Ihre Buchung derzeit nicht bearbeiten. Bitte kontaktieren Sie den Support für weitere Informationen."
          : "Unfortunately, we cannot process your booking at this time. Please contact support for more information."
        break
      default:
        safeEmailConsole.log("[EMAIL] Status email skipped for status:", status)
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
      idempotencyKey: `booking-status-${bookingNumber}-${status.toLowerCase()}`,
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
      safeEmailConsole.error("[EMAIL_ERROR] Booking status email failed:", {
        error,
        to,
        status,
        bookingNumber,
      })
      return { error }
    }

    safeEmailConsole.log("[EMAIL] ✅ Booking status email sent successfully:", {
      to,
      status,
      bookingNumber,
      id: id || "unknown",
    })
    return { success: true, id }
  } catch (error) {
    safeEmailConsole.error("[EMAIL_ERROR] Booking status email exception:", {
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
    safeEmailConsole.log("[EMAIL] Attempting to send booking completion review email:", {
      to: data.to,
      bookingNumber: data.bookingNumber,
      carName: data.carName,
      emailEnabled: configStatus.enabled,
      provider: configStatus.provider,
    })

    if (!configStatus.enabled) {
      safeEmailConsole.warn("[EMAIL] Email is disabled. Skipping booking completion review email.")
      return { error: "Email is not configured" }
    }

    if (!isValidEmail(data.to)) {
      safeEmailConsole.error("[EMAIL_ERROR] Invalid recipient email:", data.to)
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
      idempotencyKey: `booking-completion-${data.bookingNumber}`,
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
                  <div class="row"><span><strong>${isGerman ? "Rückgabe" : "Drop-off"}</strong></span><span>${data.dropoffDate}</span></div>
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
      safeEmailConsole.error("[EMAIL_ERROR] Booking completion review email failed:", {
        error,
        to: data.to,
        bookingNumber: data.bookingNumber,
      })
      return { error }
    }

    safeEmailConsole.log("[EMAIL] ✅ Booking completion review email sent successfully:", {
      to: data.to,
      bookingNumber: data.bookingNumber,
      id: id || "unknown",
    })
    return { success: true, id }
  } catch (error) {
    safeEmailConsole.error("[EMAIL_ERROR] Booking completion review email exception:", {
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
  insuranceName?: string
  insuranceSubtotal?: number
  legalReferences?: LegalAcceptanceEmailReference[]
  transferCode: string
  bookingNumber: string
  locale?: "de" | "en"
  idempotencyKey?: string
}) {
  try {
    const configStatus = getEmailConfigStatus()
    safeEmailConsole.log("[EMAIL] Attempting to send manual payment email:", {
      to: data.to,
      bookingNumber: data.bookingNumber,
      carName: data.carName,
      emailEnabled: configStatus.enabled,
      provider: configStatus.provider,
    })

    if (!configStatus.enabled) {
      safeEmailConsole.warn("[EMAIL] Email is disabled. Skipping manual payment email.")
      return { error: "Email is not configured" }
    }

    if (!isValidEmail(data.to)) {
      safeEmailConsole.error("[EMAIL_ERROR] Invalid recipient email:", data.to)
      return { error: `Invalid email address: ${data.to}` }
    }

    // Get payment details and company settings from database
    const paymentDetails = await getPaymentDetails()
    const companySettings = await prisma.companySettings.findUnique({
      where: { id: "company-settings" },
    })
    if (!paymentDetails.accountName || !paymentDetails.iban) {
      return { error: "Bank transfer details are incomplete" }
    }

    const companyName = companySettings?.companyName || "Car Rental Company"
    const supportEmail = resolveSupportEmail(companySettings)
    const locale = normalizeEmailLocale(data.locale)
    const isGerman = locale === "de"
    const depositPercent = data.totalPrice > 0 ? Math.round((data.depositAmount / data.totalPrice) * 100) : 0
    const guaranteePercentage = companySettings?.guaranteePercentage ?? 0
    const guaranteePercent = Math.round(guaranteePercentage * 100)
    const remainingRentalAtPickup = Math.max(data.totalPrice - data.depositAmount, 0)

    const { id, error } = await sendEmail({
      to: data.to,
      idempotencyKey: data.idempotencyKey || `booking-transfer-instructions-${data.bookingNumber}`,
      subject: `${isGerman ? "Reservierung ausstehend – Zahlung erforderlich" : "Reservation pending – payment required"} - ${data.bookingNumber}`,
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
                <h1>${isGerman ? "Reservierung ausstehend" : "Reservation pending"}</h1>
                <p>${isGerman ? "Das Fahrzeug ist 24 Stunden fur Sie reserviert" : "The vehicle is reserved for you for 24 hours"}</p>
              </div>
              <div class="content">
                <!-- Booking Number -->
                <div class="booking-number-box">
                  <div class="booking-number-label">${isGerman ? "Buchungsnummer" : "Booking Number"}</div>
                  <div class="booking-number-value">${data.bookingNumber}</div>
                </div>

                <!-- Transfer Reference Code -->
                <div class="transfer-code-box">
                  <div class="transfer-code-label">${isGerman ? "Überweisungsreferenzcode" : "Transfer Reference Code"}</div>
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
                    <span class="detail-label">${isGerman ? "Rückgabe:" : "Drop-off:"}</span>
                    <span class="detail-value">${data.dropoffDate}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">${isGerman ? "Standort:" : "Location:"}</span>
                    <span class="detail-value">${data.location}</span>
                  </div>
                  ${data.insuranceName && data.insuranceSubtotal !== undefined ? `<div class="detail-row"><span class="detail-label">${isGerman ? "Versicherung:" : "Insurance:"}</span><span class="detail-value">${data.insuranceName} · ${formatCents(data.insuranceSubtotal, data.currency)}</span></div>` : ""}
                  ${legalAcceptanceReferencesHtml(data.legalReferences, locale)}
                </div>

                <!-- Payment Required -->
                <div class="payment-box">
                  <h4>⚠️ ${isGerman ? "Zahlung erforderlich" : "Payment Required"}</h4>
                  <p style="margin-bottom: 8px;">${isGerman ? "Bitte zahlen Sie per Banküberweisung:" : "Please complete payment via bank transfer:"}</p>
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
                      <strong>${formatCents(remainingRentalAtPickup, data.currency)}</strong>
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
                    ${
                      paymentDetails.iban
                        ? `
                    <div class="bank-detail-row">
                      <span class="bank-detail-label">IBAN:</span>
                      <span class="bank-detail-value">${paymentDetails.iban}</span>
                    </div>
                    `
                        : ""
                    }
                    <div class="bank-detail-row">
                      <span class="bank-detail-label">${isGerman ? "Verwendungszweck:" : "Reference:"}</span>
                      <span class="reference-code">${data.transferCode}</span>
                    </div>
                  </div>

                  <p class="important-note">
                    <strong>${isGerman ? "Wichtig:" : "Important:"}</strong> ${isGerman ? `Bitte den Überweisungscode <strong>${data.transferCode}</strong> im Verwendungszweck angeben, damit wir Ihre Buchung zuordnen können.` : `Include the transfer code <strong>${data.transferCode}</strong> in your payment reference so we can process your booking.`}
                  </p>
                  ${
                    data.guaranteeAmount > 0
                      ? `<p class="important-note"><strong>${isGerman ? "Garantie:" : "Guarantee:"}</strong> ${isGerman ? "Dies ist eine vorübergehende Sicherheitsreservierung und wird nach der Rückgabe freigegeben, wenn keine Probleme vorliegen." : "This is a temporary security hold and is released after vehicle return if no issues are found."}</p>`
                      : ""
                  }
                </div>

                <!-- Next Steps -->
                <div class="next-steps">
                  <h4>📋 ${isGerman ? "Nächste Schritte" : "Next Steps"}</h4>
                  <ol>
                    <li>${isGerman ? `Die Banküberweisung innerhalb von ${BOOKING_PAYMENT_WINDOW_HOURS} Stunden abschließen` : `Complete the bank transfer within ${BOOKING_PAYMENT_WINDOW_HOURS} hours`}</li>
                    <li>${isGerman ? "Sie erhalten eine Bestatigungsmail mit Zahlungsanweisungen" : "You will receive a confirmation email with payment instructions"}</li>
                    <li>${isGerman ? "Sobald die Zahlung geprüft wurde, wird Ihre Buchung bestätigt" : "Once payment is verified, your booking will be confirmed"}</li>
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
      safeEmailConsole.error("[EMAIL_ERROR] Manual payment email failed:", {
        error,
        to: data.to,
        bookingNumber: data.bookingNumber,
        carName: data.carName,
      })
      return { error }
    }

    safeEmailConsole.log("[EMAIL] ✅ Manual payment email sent successfully:", {
      to: data.to,
      bookingNumber: data.bookingNumber,
      id: id || "unknown",
    })
    return { success: true, id }
  } catch (error) {
    safeEmailConsole.error("[EMAIL_ERROR] Manual payment email exception:", {
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
  insuranceName?: string
  insuranceSubtotal?: number
  legalReferences?: LegalAcceptanceEmailReference[]
  idempotencyKey?: string
}) {
  try {
    const configStatus = getEmailConfigStatus()
    safeEmailConsole.log("[EMAIL] Attempting to send pay-at-pickup email:", {
      to: data.to,
      bookingNumber: data.bookingNumber,
      carName: data.carName,
      emailEnabled: configStatus.enabled,
      provider: configStatus.provider,
    })

    if (!configStatus.enabled) {
      safeEmailConsole.warn("[EMAIL] Email is disabled. Skipping pay-at-pickup email.")
      return { error: "Email is not configured" }
    }

    if (!isValidEmail(data.to)) {
      safeEmailConsole.error("[EMAIL_ERROR] Invalid recipient email:", data.to)
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
    const companyAddress = [
      companySettings?.companyAddress,
      [companySettings?.companyZipCode, companySettings?.companyCity].filter(Boolean).join(" "),
      companySettings?.companyCountry,
    ].filter(Boolean).join(", ")
    const companyContact = [companySettings?.companyPhone, companySettings?.companyEmail].filter(Boolean).join(" · ")
    if (
      !companySettings?.companyName ||
      !companySettings.companyAddress ||
      !companySettings.companyZipCode ||
      !companySettings.companyCity ||
      !companySettings.companyCountry ||
      !companySettings.companyPhone ||
      !companySettings.companyEmail
    ) {
      return { error: "Pickup company details are incomplete" }
    }

    const { id, error } = await sendEmail({
      to: data.to,
      idempotencyKey: data.idempotencyKey || `booking-cash-confirmation-${data.bookingNumber}`,
      subject: `${isGerman ? "Buchung bestätigt!" : "Booking Confirmed!"} - ${data.bookingNumber}`,
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
                <h1>${isGerman ? "Buchung bestätigt!" : "Booking Confirmed!"}</h1>
                <p>${isGerman ? "Ihre Reservierung wurde erfolgreich erstellt" : "Your reservation has been created successfully"}</p>
              </div>
              <div class="content">
                <p>${isGerman ? "Hallo" : "Hi"} ${data.userName},</p>
                <p>${isGerman ? "Ihre Buchung wurde mit <strong>Zahlung bei Abholung</strong> als Zahlungsmethode bestätigt." : "Your booking is confirmed with <strong>Pay at Pickup</strong> as your payment method."}</p>

                <div class="box booking-number-box">
                  <div style="font-size: 14px; color: #6b7280;">${isGerman ? "Buchungsnummer" : "Booking Number"}</div>
                  <div style="font-family: monospace; font-size: 24px; font-weight: bold;">${data.bookingNumber}</div>
                </div>

                <div class="details">
                  <h3>${isGerman ? "Buchungsdetails" : "Booking Details"}</h3>
                  <div class="detail-row"><span>${isGerman ? "Fahrzeug:" : "Car:"}</span><strong>${data.carName}</strong></div>
                  <div class="detail-row"><span>${isGerman ? "Abholung:" : "Pick-up:"}</span><strong>${data.pickupDate}</strong></div>
                  <div class="detail-row"><span>${isGerman ? "Rückgabe:" : "Drop-off:"}</span><strong>${data.dropoffDate}</strong></div>
                  <div class="detail-row"><span>${isGerman ? "Standort:" : "Location:"}</span><strong>${data.location}</strong></div>
                  ${companyAddress ? `<div class="detail-row"><span>${isGerman ? "Firmenadresse:" : "Company address:"}</span><strong>${escapeHtml(companyAddress)}</strong></div>` : ""}
                  ${companyContact ? `<div class="detail-row"><span>${isGerman ? "Kontakt:" : "Contact:"}</span><strong>${escapeHtml(companyContact)}</strong></div>` : ""}
                  ${data.insuranceName && data.insuranceSubtotal !== undefined ? `<div class="detail-row"><span>${isGerman ? "Versicherung:" : "Insurance:"}</span><strong>${data.insuranceName} · ${formatCents(data.insuranceSubtotal, data.currency)}</strong></div>` : ""}
                  ${legalAcceptanceReferencesHtml(data.legalReferences, locale)}
                  <div class="detail-row"><span>${isGerman ? "Gesamtbetrag:" : "Total Amount:"}</span><strong>${formatCents(data.totalPrice, data.currency)}</strong></div>
                  ${
                    data.guaranteeAmount > 0
                      ? `<div class="detail-row"><span>${isGerman ? "Erstattbare Garantie" : "Refundable Guarantee"} (${guaranteePercent}%):</span><strong>${formatCents(data.guaranteeAmount, data.currency)}</strong></div>`
                      : ""
                  }
                </div>

                <div class="box pickup-payment-box">
                  <h3 style="margin: 0 0 8px 0;">${isGerman ? "Zahlung bei Abholung" : "Payment at Pickup"}</h3>
                  <p style="margin: 0;">${isGerman ? "Bitte die Zahlung bei der Fahrzeugabholung abschließen." : "Please complete payment at pickup when collecting your vehicle."}</p>
                  ${
                    data.guaranteeAmount > 0
                      ? `<p style="margin-top: 8px;">${isGerman ? "Die Garantie ist eine vorübergehende Sicherheitsreservierung und wird nach der Rückgabe freigegeben, wenn keine Probleme vorliegen." : "The guarantee is a temporary security hold and will be released after return if no issues are found."}</p>`
                      : ""
                  }
                </div>

                <p><strong>${isGerman ? "Nächste Schritte" : "Next steps"}:</strong></p>
                <ol>
                  <li>${isGerman ? "Bitte rechtzeitig am Abholort erscheinen." : "Arrive at the pickup location on time."}</li>
                  <li>${isGerman ? "Buchungsnummer sowie gültigen Ausweis/Führerschein mitbringen." : "Bring your booking number and a valid ID/driving license."}</li>
                  <li>${isGerman ? "Zahlung bei Abholung abschließen." : "Complete payment at pickup."}</li>
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
      safeEmailConsole.error("[EMAIL_ERROR] Pay-at-pickup email failed:", {
        error,
        to: data.to,
        bookingNumber: data.bookingNumber,
      })
      return { error }
    }

    safeEmailConsole.log("[EMAIL] ✅ Pay-at-pickup email sent successfully:", {
      to: data.to,
      bookingNumber: data.bookingNumber,
      id: id || "unknown",
    })
    return { success: true, id }
  } catch (error) {
    safeEmailConsole.error("[EMAIL_ERROR] Pay-at-pickup email exception:", {
      error: error instanceof Error ? error.message : "Unknown error",
      to: data.to,
      bookingNumber: data.bookingNumber,
    })
    return { error: "Failed to send pay-at-pickup email" }
  }
}

export async function sendTransferPaymentConfirmedEmail(data: {
  to: string
  userName: string
  carName: string
  pickupDate: string
  dropoffDate: string
  location: string
  bookingNumber: string
  locale?: "de" | "en"
  idempotencyKey?: string
}) {
  try {
    const locale = normalizeEmailLocale(data.locale)
    const isGerman = locale === "de"
    const settings = await prisma.companySettings.findUnique({ where: { id: "company-settings" } })
    const companyName = settings?.companyName || "Qujo Autovermietung GmbH"
    const supportEmail = resolveSupportEmail(settings)
    const companyAddress = [
      settings?.companyAddress,
      [settings?.companyZipCode, settings?.companyCity].filter(Boolean).join(" "),
      settings?.companyCountry,
    ].filter(Boolean).join(", ")
    const companyContact = [settings?.companyPhone, settings?.companyEmail].filter(Boolean).join(" · ")
    if (
      !settings?.companyName ||
      !settings.companyAddress ||
      !settings.companyZipCode ||
      !settings.companyCity ||
      !settings.companyCountry ||
      !settings.companyPhone ||
      !settings.companyEmail
    ) {
      return { error: "Pickup company details are incomplete" }
    }
    return await sendEmail({
      to: data.to,
      idempotencyKey: data.idempotencyKey || `booking-transfer-confirmed-${data.bookingNumber}`,
      subject: isGerman ? `Zahlung bestätigt – Buchung ${data.bookingNumber}` : `Payment confirmed – booking ${data.bookingNumber}`,
      html: `<!doctype html><html><body style="margin:0;background:#f5f7f5;font-family:Arial,sans-serif;color:#142018">
        <div style="max-width:620px;margin:0 auto;padding:28px 16px">
          <div style="background:#123f2b;color:white;padding:28px;border-radius:14px 14px 0 0"><h1 style="margin:0;font-size:26px">${isGerman ? "Buchung bestätigt" : "Booking confirmed"}</h1></div>
          <div style="background:white;padding:28px;border-radius:0 0 14px 14px">
            <p>${isGerman ? "Hallo" : "Hi"} ${escapeHtml(data.userName)},</p>
            <p>${isGerman ? "wir haben Ihre Anzahlung erhalten. Ihre Buchung ist jetzt bestätigt." : "we have received your deposit. Your booking is now confirmed."}</p>
            <div style="background:#f6f7f3;border:1px solid #dfe4dd;border-radius:10px;padding:18px;line-height:1.8">
              <div><strong>${isGerman ? "Buchungsnummer" : "Booking number"}:</strong> ${escapeHtml(data.bookingNumber)}</div>
              <div><strong>${isGerman ? "Fahrzeug" : "Vehicle"}:</strong> ${escapeHtml(data.carName)}</div>
              <div><strong>${isGerman ? "Abholung" : "Pick-up"}:</strong> ${escapeHtml(data.pickupDate)}</div>
              <div><strong>${isGerman ? "Rückgabe" : "Drop-off"}:</strong> ${escapeHtml(data.dropoffDate)}</div>
              <div><strong>${isGerman ? "Abholort" : "Pick-up location"}:</strong> ${escapeHtml(data.location)}</div>
              ${companyAddress ? `<div><strong>${isGerman ? "Firmenadresse" : "Company address"}:</strong> ${escapeHtml(companyAddress)}</div>` : ""}
              ${companyContact ? `<div><strong>${isGerman ? "Kontakt" : "Contact"}:</strong> ${escapeHtml(companyContact)}</div>` : ""}
            </div>
            <p>${isGerman ? "Bitte bringen Sie zur Abholung Ihren gültigen Führerschein und Ausweis mit." : "Please bring your valid driving licence and ID to pickup."}</p>
            <p style="color:#667168;font-size:13px">${isGerman ? "Die Zahlungsbeträge finden Sie in Ihrer vorherigen Zahlungs-E-Mail." : "Payment amounts remain available in your earlier payment email."}</p>
          </div>
          <p style="text-align:center;color:#687269;font-size:13px">${escapeHtml(companyName)} · ${escapeHtml(supportEmail)}</p>
        </div></body></html>`,
    })
  } catch (error) {
    safeEmailConsole.error("booking.transfer_confirmation_email_failed", error)
    return { error: "Failed to send transfer confirmation email" }
  }
}

export async function sendTransferExpiredEmail(data: {
  to: string
  userName: string
  carName: string
  bookingNumber: string
  locale?: "de" | "en"
  idempotencyKey?: string
}) {
  const locale = normalizeEmailLocale(data.locale)
  const isGerman = locale === "de"
  const settings = await prisma.companySettings.findUnique({
    where: { id: "company-settings" },
    select: { companyName: true, companyEmail: true, supportEmail: true },
  })
  const supportEmail = resolveSupportEmail(settings)
  return sendEmail({
    to: data.to,
    idempotencyKey: data.idempotencyKey || `booking-transfer-expired-${data.bookingNumber}`,
    subject: isGerman ? `Reservierung abgelaufen – ${data.bookingNumber}` : `Reservation expired – ${data.bookingNumber}`,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:600px;margin:0 auto;padding:24px">
      <h1>${isGerman ? "Reservierung abgelaufen" : "Reservation expired"}</h1>
      <p>${isGerman ? "Hallo" : "Hi"} ${escapeHtml(data.userName)},</p>
      <p>${isGerman ? "wir konnten innerhalb von 24 Stunden keinen Zahlungseingang zuordnen. Die Reservierung wurde storniert und das Fahrzeug ist für diesen Zeitraum wieder verfügbar." : "We could not match a payment within 24 hours. The reservation has been cancelled and the vehicle is available for those dates again."}</p>
      <p><strong>${isGerman ? "Buchungsnummer" : "Booking number"}:</strong> ${escapeHtml(data.bookingNumber)}<br><strong>${isGerman ? "Fahrzeug" : "Vehicle"}:</strong> ${escapeHtml(data.carName)}</p>
      <p>${isGerman ? "Falls Sie bereits überwiesen haben, kontaktieren Sie uns bitte unter" : "If you already transferred the payment, please contact us at"} ${escapeHtml(supportEmail)}.</p>
    </div></body></html>`,
  })
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
  idempotencyKey?: string
}) {
  try {
    const configStatus = getEmailConfigStatus()
    safeEmailConsole.log("[EMAIL] Attempting to send admin booking notification:", {
      bookingNumber: data.bookingNumber,
      carName: data.carName,
      emailEnabled: configStatus.enabled,
      provider: configStatus.provider,
    })

    if (!configStatus.enabled) {
      safeEmailConsole.warn("[EMAIL] Email is disabled. Skipping admin booking notification.")
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
      new Set([data.adminEmail, ...(data.adminEmails || []), companySettings?.adminEmail].filter((email): email is string => Boolean(email))),
    )

    if (recipients.length === 0) {
      safeEmailConsole.error("[EMAIL_ERROR] No admin email configured:", {
        adminEmail: data.adminEmail,
        adminEmails: data.adminEmails,
        companyAdminEmail: companySettings?.adminEmail,
      })
      return { error: "No admin email configured" }
    }

    // Validate admin email addresses
    const invalidEmails = recipients.filter((email) => !isValidEmail(email))
    if (invalidEmails.length > 0) {
      safeEmailConsole.error("[EMAIL_ERROR] Invalid admin email addresses:", invalidEmails)
      return {
        error: `Invalid admin email address(es): ${invalidEmails.join(", ")}`,
      }
    }

    safeEmailConsole.log("[EMAIL] Sending admin notification to:", recipients.join(", "))
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
      idempotencyKey: data.idempotencyKey || `booking-created-admin-${data.bookingNumber}`,
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
      safeEmailConsole.error("[EMAIL_ERROR] Admin booking notification failed:", {
        error,
        recipients: recipients.join(", "),
        bookingNumber: data.bookingNumber,
      })
      return { error }
    }

    safeEmailConsole.log("[EMAIL] ✅ Admin booking notification sent successfully:", {
      recipients: recipients.join(", "),
      bookingNumber: data.bookingNumber,
      id: id || "unknown",
    })
    return { success: true, id }
  } catch (error) {
    safeEmailConsole.error("[EMAIL_ERROR] Admin booking notification exception:", {
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
  transferCode?: string
  paymentMethod?: "TRANSFER" | "PAY_AT_PICKUP" | "CARD"
  paymentStatus?: "PENDING" | "DEPOSIT_PAID" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED"
  customerNotified?: boolean
  locale?: "de" | "en"
  bookingNumber: string
  bookingId: string
}) {
  try {
    const configStatus = getEmailConfigStatus()
    safeEmailConsole.log("[EMAIL] Attempting to send admin booking confirmation notification:", {
      bookingNumber: data.bookingNumber,
      carName: data.carName,
      emailEnabled: configStatus.enabled,
      provider: configStatus.provider,
    })

    if (!configStatus.enabled) {
      safeEmailConsole.warn("[EMAIL] Email is disabled. Skipping admin booking confirmation notification.")
      return { error: "Email is not configured" }
    }

    // Get company settings for dynamic values
    const companySettings = await prisma.companySettings.findUnique({
      where: { id: "company-settings" },
    })
    const companyName = companySettings?.companyName || "Car Rental Company"
    const guaranteePercent = Math.round((companySettings?.guaranteePercentage ?? 0) * 100)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const locale = normalizeEmailLocale(data.locale)
    const isGerman = locale === "de"
    const paymentSummary =
      data.paymentStatus === "PAID"
        ? isGerman
          ? "Die Zahlung ist als bezahlt markiert."
          : "Payment is marked as paid."
        : data.paymentMethod === "PAY_AT_PICKUP"
          ? isGerman
            ? "Die Zahlung ist bei der Abholung fällig."
            : "Payment is due at pick-up."
          : isGerman
            ? "Die Banküberweisung ist noch zu prüfen."
            : "The bank transfer is still pending verification."
    const notificationSummary =
      data.customerNotified === false
        ? isGerman
          ? "Die Kunden-E-Mail konnte nicht zugestellt werden und muss erneut versendet werden."
          : "The customer email could not be delivered and must be resent."
        : isGerman
          ? "Der Kunde wurde benachrichtigt."
          : "The customer has been notified."
    const recipients = Array.from(
      new Set([data.adminEmail, ...(data.adminEmails || []), companySettings?.adminEmail].filter((email): email is string => Boolean(email))),
    )

    if (recipients.length === 0) {
      safeEmailConsole.error("[EMAIL_ERROR] No admin email configured:", {
        adminEmail: data.adminEmail,
        adminEmails: data.adminEmails,
        companyAdminEmail: companySettings?.adminEmail,
      })
      return { error: "No admin email configured" }
    }

    // Validate admin email addresses
    const invalidEmails = recipients.filter((email) => !isValidEmail(email))
    if (invalidEmails.length > 0) {
      safeEmailConsole.error("[EMAIL_ERROR] Invalid admin email addresses:", invalidEmails)
      return {
        error: `Invalid admin email address(es): ${invalidEmails.join(", ")}`,
      }
    }

    safeEmailConsole.log("[EMAIL] Sending admin confirmation notification to:", recipients.join(", "))

    const { id, error } = await sendEmail({
      to: recipients,
      idempotencyKey: `booking-confirmation-admin-${data.bookingNumber}`,
      subject: isGerman ? `Buchung bestätigt – ${data.carName} (${data.bookingNumber})` : `Booking confirmed – ${data.carName} (${data.bookingNumber})`,
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
                  <p style="margin: 0;"><strong>${isGerman ? "Bestätigt" : "Confirmed"}:</strong> ${paymentSummary} ${notificationSummary}</p>
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
                  ${
                    data.transferCode
                      ? `<div style="margin-bottom: 10px;">
                    <strong>Transfer Reference Code:</strong>
                    <div class="transfer-code">${data.transferCode}</div>
                  </div>`
                      : ""
                  }
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
                    ${data.transferCode ? `<li>Verify customer's transfer code: <strong>${data.transferCode}</strong></li>` : ""}
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
      safeEmailConsole.error("[EMAIL_ERROR] Admin booking confirmation notification failed:", {
        error,
        recipients: recipients.join(", "),
        bookingNumber: data.bookingNumber,
      })
      return { error }
    }

    safeEmailConsole.log("[EMAIL] ✅ Admin booking confirmation notification sent successfully:", {
      recipients: recipients.join(", "),
      bookingNumber: data.bookingNumber,
      id: id || "unknown",
    })
    return { success: true, id }
  } catch (error) {
    safeEmailConsole.error("[EMAIL_ERROR] Admin booking confirmation notification exception:", {
      error: error instanceof Error ? error.message : "Unknown error",
      bookingNumber: data.bookingNumber,
    })
    return { error: "Failed to send admin booking confirmation notification" }
  }
}
