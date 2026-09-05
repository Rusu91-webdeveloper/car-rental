import "server-only"

import { prisma } from "./db"

const COMPANY_NAME = "Qujo Autovermietung GmbH"

const PLACEHOLDERS = new Set([
  "rentcar gmbh",
  "info@rentcar.de",
  "+49 (0) 30 12345678",
  "musterstraße 123",
  "10115 berlin",
  "max mustermann",
  "hrb 123456 b",
  "amtsgericht berlin-charlottenburg",
  "de123456789",
  "max mustermann, musterstraße 123, 10115 berlin, deutschland",
  "support@rentcar.com",
  "admin@rentcar.com",
])

function publicValue(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized && !PLACEHOLDERS.has(normalized.toLowerCase()) ? normalized : null
}

function publicEmail(value: string | null | undefined) {
  const normalized = publicValue(value)
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null
  return normalized.toLowerCase().includes("@rentcar.") ? null : normalized
}

function publicPhone(value: string | null | undefined) {
  const normalized = publicValue(value)
  if (!normalized) return null
  const digits = normalized.replace(/\D/g, "")
  return digits.length >= 7 && !/^(\d)\1+$/.test(digits) ? normalized : null
}

function publicGermanVatId(value: string | null | undefined) {
  const normalized = publicValue(value)?.replace(/\s/g, "").toUpperCase()
  return normalized && /^DE\d{9}$/.test(normalized) ? normalized : null
}

export interface PublicBusinessInfo {
  companyName: string
  companyEmail: string | null
  companyPhone: string | null
  companyAddress: string | null
  companyCity: string | null
  companyState: string | null
  companyZipCode: string | null
  companyCountry: string | null
  managingDirector: string | null
  commercialRegister: string | null
  registerCourt: string | null
  vatId: string | null
  responsiblePerson: string | null
  supportEmail: string | null
  adminEmail: string | null
}

export async function getBusinessInfo(): Promise<PublicBusinessInfo> {
  try {
    const settings = await prisma.companySettings.findUnique({
      where: { id: "company-settings" },
    })

    if (!settings) return defaultBusinessInfo()

    const companyEmail =
      publicEmail(settings.companyEmail) ??
      publicEmail(settings.supportEmail) ??
      publicEmail(process.env.PUBLIC_COMPANY_EMAIL) ??
      publicEmail(process.env.SUPPORT_EMAIL)

    return {
      companyName: COMPANY_NAME,
      companyEmail,
      companyPhone: publicPhone(settings.companyPhone),
      companyAddress: publicValue(settings.companyAddress),
      companyCity: publicValue(settings.companyCity),
      companyState: publicValue(settings.companyState),
      companyZipCode: publicValue(settings.companyZipCode),
      companyCountry: publicValue(settings.companyCountry),
      managingDirector: publicValue(settings.managingDirector),
      commercialRegister: publicValue(settings.commercialRegister),
      registerCourt: publicValue(settings.registerCourt),
      vatId: publicGermanVatId(settings.vatId),
      responsiblePerson: publicValue(settings.responsiblePerson),
      supportEmail:
        publicEmail(settings.supportEmail) ??
        companyEmail ??
        publicEmail(process.env.SUPPORT_EMAIL) ??
        publicEmail(process.env.PUBLIC_COMPANY_EMAIL),
      adminEmail: publicEmail(settings.adminEmail) ?? publicEmail(process.env.ADMIN_EMAIL),
    }
  } catch (error) {
    console.error("[GET_BUSINESS_INFO_ERROR]", error)
    return defaultBusinessInfo()
  }
}

function defaultBusinessInfo(): PublicBusinessInfo {
  const companyEmail = publicEmail(process.env.PUBLIC_COMPANY_EMAIL)
  return {
    companyName: COMPANY_NAME,
    companyEmail,
    companyPhone: publicPhone(process.env.PUBLIC_COMPANY_PHONE),
    companyAddress: publicValue(process.env.PUBLIC_COMPANY_ADDRESS),
    companyCity: publicValue(process.env.PUBLIC_COMPANY_CITY),
    companyState: publicValue(process.env.PUBLIC_COMPANY_STATE),
    companyZipCode: publicValue(process.env.PUBLIC_COMPANY_ZIP_CODE),
    companyCountry: publicValue(process.env.PUBLIC_COMPANY_COUNTRY),
    managingDirector: publicValue(process.env.PUBLIC_MANAGING_DIRECTOR),
    commercialRegister: publicValue(process.env.PUBLIC_COMMERCIAL_REGISTER),
    registerCourt: publicValue(process.env.PUBLIC_REGISTER_COURT),
    vatId: publicGermanVatId(process.env.PUBLIC_VAT_ID),
    responsiblePerson: publicValue(process.env.PUBLIC_RESPONSIBLE_PERSON),
    supportEmail: publicEmail(process.env.SUPPORT_EMAIL) ?? companyEmail,
    adminEmail: publicEmail(process.env.ADMIN_EMAIL),
  }
}
