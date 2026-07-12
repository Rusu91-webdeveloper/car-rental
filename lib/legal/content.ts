import { createHash } from "node:crypto"

export const LEGAL_VALIDATOR_VERSION = "legal-plain-text-v1"

export function normalizeLegalLocale(locale: string) {
  const trimmed = locale.trim().replace(/_/g, "-")
  const [language, region, ...rest] = trimmed.split("-")
  if (!language || rest.length > 0 || !/^[A-Za-z]{2}$/.test(language) || (region && !/^[A-Za-z]{2}$/.test(region))) return undefined
  return region ? `${language.toLowerCase()}-${region.toUpperCase()}` : language.toLowerCase()
}

export function normalizeCanonicalLegalText(value: string) {
  return value.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+$/g, "")).join("\n").trim()
}

export function legalContentHash(canonicalContent: string) {
  return createHash("sha256").update(normalizeCanonicalLegalText(canonicalContent), "utf8").digest("hex")
}

export function legalManifestHash(translations: Array<{ locale: string; contentHash: string }>) {
  const canonicalManifest = [...translations].sort((a, b) => a.locale.localeCompare(b.locale)).map(({ locale, contentHash }) => `${locale}:${contentHash}`).join("\n")
  return createHash("sha256").update(canonicalManifest, "utf8").digest("hex")
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

export function renderLegalPlainText(value: string) {
  return normalizeCanonicalLegalText(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("")
}

export function legalContentIsUnsafe(value: string) {
  const normalized = value.toLowerCase()
  return /<\/?[a-z][^>]*>/i.test(value) || /javascript\s*:/i.test(value) || /data\s*:\s*text\/html/i.test(value) || /on[a-z]+\s*=/i.test(value) || normalized.includes("{{") || normalized.includes("{%")
}
