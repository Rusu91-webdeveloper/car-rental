import { describe, expect, it } from "vitest"
import {
  legalContentHash,
  legalContentIsUnsafe,
  normalizeCanonicalLegalText,
  normalizeLegalLocale,
  renderLegalPlainText,
} from "@/lib/legal/content"
import { safeLegalValidationSnapshot, validateLegalDraft } from "@/lib/legal/validation"

const meaningful = "These rental terms explain the booking, vehicle use, customer responsibilities, return process, charges, and cancellation rules. ".repeat(3)

describe("legal plain-text content", () => {
  it("normalizes text and hashes it deterministically", () => {
    expect(normalizeCanonicalLegalText("  Terms  \r\nSecond line  ")).toBe("Terms\nSecond line")
    expect(legalContentHash("Terms\r\nSecond line  ")).toBe(legalContentHash("Terms\nSecond line"))
    expect(legalContentHash("Terms")).toMatch(/^[a-f0-9]{64}$/)
  })

  it("escapes content in the shared renderer", () => {
    expect(renderLegalPlainText("A & B\n<not markup>")).toBe("<p>A &amp; B<br>&lt;not markup&gt;</p>")
  })

  it.each([
    "<script>alert(1)</script>",
    "<iframe src='https://example.test'></iframe>",
    "<img src=x onerror=alert(1)>",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "{{ executableTemplate }}",
    "{% include 'remote' %}",
  ])("rejects unsafe or executable input: %s", (value) => {
    expect(legalContentIsUnsafe(value)).toBe(true)
  })

  it("renders ordinary URLs as inert plain text", () => {
    expect(legalContentIsUnsafe("Read https://example.test/privacy for context.")).toBe(false)
    expect(renderLegalPlainText("Read https://example.test/privacy for context.")).not.toContain("<a")
  })
})

describe("legal draft validation", () => {
  it("normalizes supported locales and produces a bounded safe snapshot", () => {
    const result = validateLegalDraft({
      primaryLocale: "en_us",
      supportedLocales: ["en-US"],
      requiredLocales: ["en-US"],
      translations: [{ locale: "EN-us", title: "Rental Terms", canonicalContent: meaningful }],
    })
    expect(result.outcome).toBe("VALID")
    expect(result.translations[0].locale).toBe("en-US")
    expect(result.manifestHash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(safeLegalValidationSnapshot(result))).not.toContain(meaningful)
  })

  it("reports missing titles, content, primary locale, and required translations", () => {
    const result = validateLegalDraft({
      primaryLocale: "de",
      supportedLocales: ["de", "en"],
      requiredLocales: ["de", "en"],
      translations: [{ locale: "de", title: "", canonicalContent: "" }],
    })
    expect(result.outcome).toBe("BLOCKED")
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["LEGAL_TITLE_REQUIRED", "LEGAL_CONTENT_REQUIRED", "LEGAL_TRANSLATION_MISSING"]),
    )
  })

  it("rejects duplicate normalized and unsupported locales", () => {
    const result = validateLegalDraft({
      primaryLocale: "en",
      supportedLocales: ["en"],
      requiredLocales: ["en"],
      translations: [
        { locale: "en", title: "Terms", canonicalContent: meaningful },
        { locale: "EN", title: "Terms duplicate", canonicalContent: meaningful },
        { locale: "fr", title: "Conditions", canonicalContent: meaningful },
      ],
    })
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["LEGAL_TRANSLATION_DUPLICATE", "LEGAL_LOCALE_UNSUPPORTED"]),
    )
  })

  it("rejects unsafe content", () => {
    const result = validateLegalDraft({
      primaryLocale: "en",
      supportedLocales: ["en"],
      requiredLocales: ["en"],
      translations: [{ locale: "en", title: "Terms", canonicalContent: `${meaningful}<script>x</script>` }],
    })
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "LEGAL_CONTENT_UNSAFE" })]))
  })

  it("normalizes only supported two-part locale identifiers", () => {
    expect(normalizeLegalLocale("de_de")).toBe("de-DE")
    expect(normalizeLegalLocale("english")).toBeUndefined()
    expect(normalizeLegalLocale("en-US-extra")).toBeUndefined()
  })
})
