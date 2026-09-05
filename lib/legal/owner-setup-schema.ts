import { z } from "zod"

export const OWNER_LEGAL_LOCALES = ["en", "de"] as const

const bilingualContentSchema = z
  .array(
    z.object({
      locale: z.enum(OWNER_LEGAL_LOCALES),
      title: z.string().trim().min(1, "Add a customer-facing title").max(300),
      canonicalContent: z
        .string()
        .trim()
        .min(80, "Add at least 80 characters of legal wording")
        .max(500_000),
    }),
  )
  .length(2)
  .superRefine((translations, context) => {
    for (const locale of OWNER_LEGAL_LOCALES) {
      if (!translations.some((translation) => translation.locale === locale)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Add the ${locale === "en" ? "English" : "German"} wording`,
        })
      }
    }
  })

const documentSchema = z.object({
  id: z.string().min(1),
  revision: z.number().int().positive(),
  translations: bilingualContentSchema,
})

const agreementLabelsSchema = z
  .array(
    z.object({
      locale: z.enum(OWNER_LEGAL_LOCALES),
      termsCheckboxLabel: z.string().trim().min(1).max(500),
      termsLinkLabel: z.string().trim().min(1).max(200),
      privacyCheckboxLabel: z.string().trim().min(1).max(500),
      privacyLinkLabel: z.string().trim().min(1).max(200),
    }),
  )
  .length(2)
  .superRefine((translations, context) => {
    for (const locale of OWNER_LEGAL_LOCALES) {
      if (!translations.some((translation) => translation.locale === locale)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Add the ${locale === "en" ? "English" : "German"} customer labels`,
        })
      }
    }
  })

export const ownerLegalSetupSchema = z.object({
  rentalTerms: documentSchema,
  privacyNotice: documentSchema,
  agreement: z.object({
    requireAgreement: z.boolean(),
    translations: agreementLabelsSchema,
  }),
})

export type OwnerLegalSetupInput = z.infer<typeof ownerLegalSetupSchema>
