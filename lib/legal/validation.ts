import { configurationValidationResult, type ConfigurationValidationIssue } from "@/lib/business-configuration/types"
import { LEGAL_VALIDATOR_VERSION, legalContentHash, legalContentIsUnsafe, legalManifestHash, normalizeCanonicalLegalText, normalizeLegalLocale, renderLegalPlainText } from "./content"
import type { LegalDraftValidation, LegalTranslationInput } from "./types"

function issue(code: string, severity: "BLOCKER" | "WARNING", message: string, locale?: string, field?: string): ConfigurationValidationIssue {
  return { code, domain: "legal-acceptance", severity, affectedResource: locale, field, adminMessage: message, remediation: severity === "BLOCKER" ? "Correct the legal draft before publication." : "Review this warning before publication." }
}

export function validateLegalDraft(input: { primaryLocale?: string; supportedLocales: string[]; requiredLocales: string[]; translations: LegalTranslationInput[] }): LegalDraftValidation {
  const issues: ConfigurationValidationIssue[] = []
  const supported = new Set(input.supportedLocales.map(normalizeLegalLocale).filter(Boolean))
  const normalizedPrimary = input.primaryLocale ? normalizeLegalLocale(input.primaryLocale) : undefined
  const seen = new Set<string>()
  const translations = input.translations.map((translation) => {
    const locale = normalizeLegalLocale(translation.locale) ?? translation.locale
    const title = translation.title.trim()
    const canonicalContent = normalizeCanonicalLegalText(translation.canonicalContent)
    if (!title) issues.push(issue("LEGAL_TITLE_REQUIRED", "BLOCKER", "A customer-facing legal title is required.", locale, "title"))
    if (!canonicalContent) issues.push(issue("LEGAL_CONTENT_REQUIRED", "BLOCKER", "Legal content is required.", locale, "canonicalContent"))
    else if (canonicalContent.length < 80) issues.push(issue("LEGAL_CONTENT_REQUIRED", "BLOCKER", "Legal content must contain meaningful text.", locale, "canonicalContent"))
    else if (canonicalContent.length < 300) issues.push(issue("LEGAL_CONTENT_SHORT", "WARNING", "This legal translation is unusually short.", locale, "canonicalContent"))
    if (legalContentIsUnsafe(translation.canonicalContent)) issues.push(issue("LEGAL_CONTENT_UNSAFE", "BLOCKER", "Raw markup, scripts, template expressions, and unsafe links are not supported.", locale, "canonicalContent"))
    if (!supported.has(locale)) issues.push(issue("LEGAL_LOCALE_UNSUPPORTED", "BLOCKER", "This language is not supported by the application.", locale, "locale"))
    if (seen.has(locale)) issues.push(issue("LEGAL_TRANSLATION_DUPLICATE", "BLOCKER", "A language may appear only once in a legal version.", locale, "locale"))
    seen.add(locale)
    return { locale, title, canonicalContent, contentHash: legalContentHash(canonicalContent), sanitizedHtml: renderLegalPlainText(canonicalContent) }
  })
  if (!normalizedPrimary || !seen.has(normalizedPrimary)) issues.push(issue("LEGAL_PRIMARY_LANGUAGE_MISSING", "BLOCKER", "The primary legal language must have a translation.", normalizedPrimary, "primaryLocale"))
  for (const locale of input.requiredLocales.map(normalizeLegalLocale).filter(Boolean) as string[]) if (!seen.has(locale)) issues.push(issue("LEGAL_TRANSLATION_MISSING", "BLOCKER", "A required booking-language translation is missing.", locale, "translations"))
  const result = configurationValidationResult(issues)
  return { ...result, translations, manifestHash: result.outcome === "BLOCKED" ? undefined : legalManifestHash(translations) }
}

export function safeLegalValidationSnapshot(result: LegalDraftValidation) {
  return { validatorVersion: LEGAL_VALIDATOR_VERSION, outcome: result.outcome, issues: result.issues.slice(0, 100).map(({ code, severity, affectedResource, field, remediation }) => ({ code, severity, locale: affectedResource, field, remediation })) }
}
