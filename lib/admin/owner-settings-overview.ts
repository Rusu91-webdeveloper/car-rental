import "server-only"

import type { Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/db"
import { CONFIGURATION_DOMAIN_METADATA } from "@/lib/business-configuration/domain-metadata"
import {
  CONFIGURATION_DOMAIN_IDS,
} from "@/lib/business-configuration/types"
import type { ConfigurationOverview } from "@/lib/business-configuration/workflow-service"

const DATABASE_DOMAIN_TO_ID = {
  GENERAL_RENTAL: "general-rental",
  PRICING_BILLING: "pricing-billing",
  INSURANCE: "insurance",
  CUSTOMER_DRIVER_REQUIREMENTS: "customer-driver-requirements",
  BOOKING_WORKFLOW: "booking-workflow",
  DOCUMENT_POLICY: "document-policy",
  PAYMENTS: "payments",
  CONFIRMATIONS: "confirmations",
  LEGAL_ACCEPTANCE: "legal-acceptance",
} as const

function issueCounts(snapshot: Prisma.JsonValue | null) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { blockerCount: 0, warningCount: 0 }
  }

  const issues = (snapshot as Record<string, unknown>).issues
  if (!Array.isArray(issues)) return { blockerCount: 0, warningCount: 0 }

  return {
    blockerCount: issues.filter(
      (issue) =>
        issue &&
        typeof issue === "object" &&
        !Array.isArray(issue) &&
        (issue as Record<string, unknown>).severity === "BLOCKER",
    ).length,
    warningCount: issues.filter(
      (issue) =>
        issue &&
        typeof issue === "object" &&
        !Array.isArray(issue) &&
        (issue as Record<string, unknown>).severity === "WARNING",
    ).length,
  }
}

/**
 * Loads only the status fields used by the dashboard setup guide. The full
 * configuration overview expands every release relation and performs runtime
 * validation, which belongs on configuration pages rather than the dashboard.
 */
export async function loadOwnerSettingsOverview(
  db: PrismaClient = prisma,
): Promise<Pick<ConfigurationOverview, "domainStatuses" | "legalHealth">> {
  const [versions, legalDocuments] = await Promise.all([
    db.configurationVersion.findMany({
      where: { status: { in: ["DRAFT", "VALIDATED", "RELEASED"] } },
      orderBy: [{ domain: "asc" }, { updatedAt: "desc" }],
      distinct: ["domain"],
      select: {
        domain: true,
        versionNumber: true,
        status: true,
        validationStatus: true,
        validationSnapshot: true,
        generalRental: { select: { supportedLocales: true } },
      },
    }),
    db.legalDocumentVersion.findMany({
      where: { status: { in: ["PUBLISHED", "DRAFT"] } },
      select: {
        type: true,
        status: true,
        translations: { select: { locale: true } },
      },
      orderBy: [{ type: "asc" }, { versionNumber: "desc" }],
    }),
  ])

  const latestByDomain = new Map(
    versions.map((version) => [DATABASE_DOMAIN_TO_ID[version.domain], version]),
  )
  const domainStatuses = CONFIGURATION_DOMAIN_IDS.map((domain) => {
    const version = latestByDomain.get(domain)
    const configured = Boolean(version)
    const counts = issueCounts(version?.validationSnapshot ?? null)
    const blockerCount = configured
      ? Math.max(counts.blockerCount, version?.validationStatus === "BLOCKED" ? 1 : 0)
      : 1
    const warningCount = Math.max(
      counts.warningCount,
      version?.validationStatus === "WARNING" ? 1 : 0,
    )
    const hasDraftChanges = version?.status === "DRAFT" || version?.status === "VALIDATED"
    const status = !configured || blockerCount > 0
      ? "Action required"
      : hasDraftChanges
        ? "Draft changes"
        : warningCount > 0
          ? "Warning"
          : "Ready"

    return {
      domain,
      label: CONFIGURATION_DOMAIN_METADATA[domain].label,
      route: CONFIGURATION_DOMAIN_METADATA[domain].route,
      liveVersion: version?.status === "RELEASED" ? version.versionNumber : undefined,
      draftVersion: hasDraftChanges ? version?.versionNumber : undefined,
      configured,
      validationStatus: version?.validationStatus ?? "NOT_VALIDATED",
      warningCount,
      blockerCount,
      status,
    }
  })

  const published = legalDocuments.filter(({ status }) => status === "PUBLISHED")
  const requiredTypes = ["RENTAL_TERMS", "PRIVACY_NOTICE"]
  const supportedLocales =
    latestByDomain.get("general-rental")?.generalRental?.supportedLocales ?? []
  const missingTranslations = requiredTypes.flatMap((type) => {
    const document = published.find((item) => item.type === type)
    const locales = document?.translations.map(({ locale }) => locale) ?? []
    return supportedLocales
      .filter((locale) => !locales.includes(locale))
      .map((locale) => `${type === "RENTAL_TERMS" ? "Rental terms" : "Privacy notice"}: ${locale}`)
  })

  return {
    domainStatuses,
    legalHealth: {
      requiredTypes,
      publishedLanguages: [
        ...new Set(published.flatMap(({ translations }) => translations.map(({ locale }) => locale))),
      ].sort(),
      missingTranslations,
      unpublishedDrafts: legalDocuments.filter(({ status }) => status === "DRAFT").length,
      configured: requiredTypes.every((type) => published.some((document) => document.type === type)),
    },
  }
}
