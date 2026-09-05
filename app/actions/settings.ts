"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { validIban } from "@/lib/iban"

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null)
const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max)

const businessProfileSchema = z.object({
  companyName: z.literal("Qujo Autovermietung GmbH", { errorMap: () => ({ message: "The registered business name must remain Qujo Autovermietung GmbH" }) }),
  companyEmail: z.string().trim().email("Enter a valid business email"),
  companyPhone: requiredText(40, "Phone number"),
  companyAddress: requiredText(200, "Street address"),
  companyCity: requiredText(120, "City"),
  companyState: optionalText(120),
  companyZipCode: requiredText(30, "Postal code"),
  companyCountry: requiredText(120, "Country"),
  managingDirector: requiredText(160, "Managing director"),
  commercialRegister: requiredText(100, "Commercial register number"),
  registerCourt: requiredText(160, "Register court"),
  vatId: optionalText(40),
  responsiblePerson: optionalText(300),
  currency: z.string().trim().length(3, "Use a three-letter currency code").transform((value) => value.toUpperCase()),
  currencySymbol: z.string().trim().min(1).max(5),
})

const paymentDetailsSchema = z.object({
  bankName: z.string().trim().min(1, "Bank name is required").max(160),
  accountName: z.string().trim().min(1, "Account holder is required").max(160),
  accountNumber: z.string().trim().min(1, "Account number is required").max(80),
  swiftCode: z.string().trim().min(1, "SWIFT/BIC is required").max(30),
  iban: z.string().trim().min(1, "IBAN is required").max(50).refine(validIban, "Enter a valid IBAN").transform((value) => value.replace(/\s+/g, "").toUpperCase()),
  guaranteePercentage: z.number().min(0).max(1),
})

const notificationContactsSchema = z.object({
  supportEmail: z.string().trim().email("Enter a valid customer support email"),
  adminEmail: z.string().trim().email("Enter a valid owner notification email"),
})

async function recordSettingsAudit(
  db: Prisma.TransactionClient,
  adminId: string,
  existingSettings: unknown,
  newValue: unknown,
  reason: string,
) {
  await db.adminAuditLog.create({
    data: {
      adminId,
      action: "SETTINGS_UPDATED",
      targetType: "settings",
      targetId: "company-settings",
      oldValue: existingSettings ? (existingSettings as Prisma.InputJsonValue) : Prisma.JsonNull,
      newValue: newValue as Prisma.InputJsonValue,
      reason,
    },
  })
}

function revalidateOwnerSettings() {
  revalidatePath("/admin")
  revalidatePath("/admin/settings")
  revalidatePath("/admin/payments")
  revalidatePath("/")
  revalidatePath("/impressum")
  revalidatePath("/datenschutz")
  revalidatePath("/agb")
  revalidatePath("/widerruf")
  revalidatePath("/about")
  revalidatePath("/contact")
}

export async function updateBusinessProfile(data: unknown) {
  try {
    const admin = await requireAdmin()
    const validated = businessProfileSchema.parse(data)
    const settings = await prisma.$transaction(async (tx) => {
      const existing = await tx.companySettings.findUnique({ where: { id: "company-settings" } })
      const updated = await tx.companySettings.upsert({
        where: { id: "company-settings" },
        update: validated,
        create: { id: "company-settings", ...validated },
      })
      await recordSettingsAudit(tx, admin.id, existing, validated, "business_profile_updated")
      return updated
    })
    revalidateOwnerSettings()
    return { success: true as const, settings }
  } catch (error) {
    console.error("[UPDATE_BUSINESS_PROFILE_ERROR]", error)
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Check the highlighted details." }
    return { error: error instanceof Error ? error.message : "Business details could not be saved." }
  }
}

export async function updatePaymentDetails(data: unknown) {
  try {
    const admin = await requireAdmin()
    const validated = paymentDetailsSchema.parse(data)
    const settings = await prisma.$transaction(async (tx) => {
      const existing = await tx.companySettings.findUnique({ where: { id: "company-settings" } })
      const updated = await tx.companySettings.upsert({
        where: { id: "company-settings" },
        update: validated,
        create: { id: "company-settings", ...validated },
      })
      await recordSettingsAudit(tx, admin.id, existing, validated, "payment_details_updated")
      return updated
    })
    revalidateOwnerSettings()
    return { success: true as const, settings }
  } catch (error) {
    console.error("[UPDATE_PAYMENT_DETAILS_ERROR]", error)
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Check the payment details." }
    return { error: error instanceof Error ? error.message : "Payment details could not be saved." }
  }
}

export async function updateNotificationContacts(data: unknown) {
  try {
    const admin = await requireAdmin()
    const validated = notificationContactsSchema.parse(data)
    const settings = await prisma.$transaction(async (tx) => {
      const existing = await tx.companySettings.findUnique({ where: { id: "company-settings" } })
      const updated = await tx.companySettings.upsert({
        where: { id: "company-settings" },
        update: validated,
        create: { id: "company-settings", ...validated },
      })
      await recordSettingsAudit(tx, admin.id, existing, validated, "notification_contacts_updated")
      return updated
    })
    revalidateOwnerSettings()
    return { success: true as const, settings }
  } catch (error) {
    console.error("[UPDATE_NOTIFICATION_CONTACTS_ERROR]", error)
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Check the email addresses." }
    return { error: error instanceof Error ? error.message : "Notification contacts could not be saved." }
  }
}

export async function getCompanySettings() {
  try {
    await requireAdmin()
    let settings = await prisma.companySettings.findUnique({
      where: { id: "company-settings" },
    })

    // If settings don't exist, create default settings
    if (!settings) {
      settings = await prisma.companySettings.create({
        data: {
          id: "company-settings",
        },
      })
    }

    return { success: true, settings }
  } catch (error) {
    console.error("[GET_COMPANY_SETTINGS_ERROR]", error)
    return { error: "Failed to fetch company settings" }
  }
}
