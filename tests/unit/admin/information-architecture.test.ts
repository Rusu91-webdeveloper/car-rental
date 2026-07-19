import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { CONFIGURATION_DOMAIN_METADATA } from "@/lib/business-configuration/domain-metadata"

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("owner-facing admin information architecture", () => {
  it("maps every configuration domain away from slug-based routes", () => {
    for (const metadata of Object.values(CONFIGURATION_DOMAIN_METADATA)) {
      expect(metadata.route).toMatch(/^\/admin\//)
      expect(metadata.route).not.toContain("business-configuration")
    }
  })

  it("keeps technical operations outside the everyday navigation", () => {
    const navigation = source("components/admin/admin-navigation.tsx")
    expect(navigation).toContain('label: "Dashboard"')
    expect(navigation).toContain('label: "Settings"')
    expect(navigation).toContain('label: "Publish Changes"')
    expect(navigation).not.toContain('label: "Configuration Releases"')
    expect(navigation).not.toContain("cron")
    expect(navigation).not.toContain("OIDC")
    expect(navigation).not.toContain("recovery evidence")
    expect(navigation).toContain("const advancedHref = isAdmin")
    expect(navigation).toContain('? "/admin/advanced"')
    expect(navigation).toContain(': "/admin/advanced/configuration"')
  })

  it("preserves role checks and restricted-document navigation", () => {
    const layout = source("app/[locale]/admin/layout.tsx")
    const navigation = source("components/admin/admin-navigation.tsx")
    const documentSettings = source("app/[locale]/admin/documents/settings/page.tsx")
    expect(layout).toContain('user!.role !== "ADMIN"')
    expect(navigation).toContain("canViewDocuments")
    expect(documentSettings).toContain("caps.canViewDocuments")
    expect(documentSettings).toContain("Ask an owner to grant document access")
  })

  it("gives each owner destination one plain business question", () => {
    const pages = {
      "app/[locale]/admin/bookings/settings/flow/page.tsx": "What steps do customers complete?",
      "app/[locale]/admin/bookings/settings/duration/page.tsx": "Set your booking length and tax",
      "app/[locale]/admin/bookings/driver-rules/page.tsx": "Who is allowed to drive?",
      "app/[locale]/admin/cars/pricing/page.tsx": "What should each car cost?",
      "app/[locale]/admin/cars/rental-rules/page.tsx": "Should customers be offered insurance?",
      "app/[locale]/admin/customers/settings/page.tsx": "What information do you need from customers?",
      "app/[locale]/admin/documents/settings/page.tsx": "Which documents must customers provide?",
      "app/[locale]/admin/payments/page.tsx": "How can customers pay?",
      "app/[locale]/admin/settings/legal/page.tsx": "What must customers agree to?",
      "app/[locale]/admin/team/page.tsx": "Who can manage the business?",
    }
    for (const [path, question] of Object.entries(pages)) expect(source(path)).toContain(question)
  })

  it("removes owner-facing release jargon and required change notes", () => {
    const dailyForms = [
      "components/business-configuration/billing-rule-form.tsx",
      "components/business-configuration/booking-flow-step-list.tsx",
      "components/business-configuration/driver-requirements-form.tsx",
      "components/business-configuration/insurance-configuration-form.tsx",
      "components/business-configuration/notification-configuration-form.tsx",
      "components/business-configuration/confirmation-content-form.tsx",
      "components/legal/legal-document-list.tsx",
    ]
    for (const path of dailyForms) expect(source(path)).not.toContain("Change summary")
    const bookings = source("app/[locale]/admin/admin-client.tsx")
    expect(bookings).not.toContain("Exact release provenance")
    expect(bookings).not.toContain("Hash verified")
    expect(bookings).not.toContain("insurance version")
  })

  it("redirects legacy configuration routes to owner-facing destinations", () => {
    const config = source("next.config.mjs")
    expect(config).toContain('source: "/:locale/admin/business-configuration"')
    expect(config).toContain('destination: "/:locale/admin/settings"')
    expect(config).toContain('pricing: "cars/pricing"')
    expect(config).toContain('"booking-flow": "bookings/settings/flow"')
    expect(config).toContain('documents: "documents/settings"')
  })

  it("uses section-specific writes against the existing CompanySettings source", () => {
    const actions = source("app/actions/settings.ts")
    expect(actions).toContain("updateBusinessProfile")
    expect(actions).toContain("updatePaymentDetails")
    expect(actions).toContain("updateNotificationContacts")
    expect(actions).toContain("prisma.companySettings.upsert")
    expect(actions).toContain('recordSettingsAudit(admin.id, existing, validated, "business_profile_updated")')
    expect(actions).not.toContain("updateCompanySettings")
    expect(source("prisma/schema.prisma")).not.toContain("model OwnerSetup")
  })
})
