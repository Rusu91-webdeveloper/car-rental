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

  it("gives owners only the five everyday business destinations", () => {
    const navigation = source("components/admin/admin-navigation.tsx")
    const ownerItems = navigation.slice(
      navigation.indexOf("function ownerItems"),
      navigation.indexOf("function configurationItems"),
    )
    expect(ownerItems.match(/label:/g)).toHaveLength(5)
    expect(ownerItems).toContain(': "Dashboard"')
    expect(ownerItems).toContain(': "Bookings"')
    expect(ownerItems).toContain(': "Cars"')
    expect(ownerItems).toContain(': "Customers"')
    expect(ownerItems).toContain(': "Settings"')
    expect(ownerItems).not.toContain(': "Payments"')
    expect(ownerItems).not.toContain(': "Team"')
    expect(ownerItems).not.toContain(': "Documents"')
    expect(navigation).toContain("const showAdvancedConfiguration = !isAdmin && canViewConfiguration")
  })

  it("presents settings as one checkout-style step instead of a card dashboard", () => {
    const settingsPage = source("app/[locale]/admin/settings/page.tsx")
    const wizard = source("components/admin/owner-settings-wizard.tsx")
    const stepContent = source("components/admin/owner-settings-step-content.tsx")
    expect(settingsPage).toContain("<OwnerSettingsWizard")
    expect(settingsPage).toContain("<OwnerSettingsStepContent")
    expect(settingsPage).toContain("requestedStep ?? guide.nextStep")
    expect(wizard).toContain('{de ? "Schritt" : "Step"} {currentIndex + 1} {de ? "von" : "of"} {guide.total}')
    expect(wizard).toContain("Select any step to review or change it.")
    expect(wizard).toContain("<ArrowLeft")
    expect(stepContent).toContain("nextHref={nextHref}")
    expect(wizard).not.toContain("Draft saved")
    expect(wizard).not.toContain("Before you publish")
    expect(wizard).not.toContain("ConfigurationHealthFinding")
  })

  it("keeps the owner legal step bilingual and hides the advanced publication console", () => {
    const stepContent = source("components/admin/owner-settings-step-content.tsx")
    const legalSetup = source("components/legal/owner-legal-setup-form.tsx")
    const action = source("app/actions/legal-configuration.ts")
    expect(stepContent).toContain("<OwnerLegalSetupForm")
    expect(stepContent).not.toContain("<LegalDocumentList")
    expect(stepContent).not.toContain("<LegalAcceptanceConfigurationForm")
    expect(legalSetup).toContain('OWNER_LEGAL_LOCALES')
    expect(legalSetup).toContain('Save and finish')
    expect(action).toContain("saveOwnerLegalSetupAction")
  })

  it("keeps every owner setup step inside the settings URL", () => {
    const guide = source("lib/admin/owner-settings-guide.ts")
    const wizard = source("components/admin/owner-settings-wizard.tsx")
    expect(guide).toContain("`/admin/settings?step=${stepId}`")
    expect(wizard).toContain("href={step.href}")
    expect(wizard).not.toContain("/admin/bookings/settings/")
    expect(wizard).not.toContain("/admin/documents/settings")
    expect(wizard).not.toContain("/admin/payments")
  })

  it("saves setup progress and advances after successful form submissions", () => {
    const action = source("app/actions/owner-setup.ts")
    const helper = source("components/admin/complete-owner-setup-step.ts")
    expect(action).toContain('action: "owner_setup.step_completed"')
    expect(action).toContain("validateDraftRelease")
    expect(action).toContain("activateDraftRelease")
    expect(action).toContain("activeRelease || completedSteps.length === ownerSetupStepIds.length")
    expect(helper).toContain("completeOwnerSetupStepAction(stepId)")
    expect(helper).toContain("router.push(nextHref)")
    expect(helper).toContain('return "Save and publish"')
  })

  it("keeps technical operations outside the owner navigation", () => {
    const navigation = source("components/admin/admin-navigation.tsx")
    expect(navigation).toContain(': "Publish Changes"')
    expect(navigation).not.toContain('label: "Configuration Releases"')
    expect(navigation).not.toContain("cron")
    expect(navigation).not.toContain("OIDC")
    expect(navigation).not.toContain("recovery evidence")
    expect(navigation).not.toContain('href={advancedHref}')
    expect(navigation).toContain('href="/admin/advanced/configuration"')
  })

  it("publishes owner edits automatically instead of requiring a second review step", () => {
    const settings = source("app/[locale]/admin/settings/page.tsx")
    const publicationPage = source("app/[locale]/admin/advanced/configuration/page.tsx")

    expect(settings).not.toContain("Saved changes are not live yet")
    expect(settings).not.toContain("Review and publish")
    expect(settings).not.toContain('href="/admin/advanced/configuration"')
    expect(publicationPage).not.toContain('user?.role === "ADMIN"')
    expect(publicationPage).not.toContain('redirect({ href: "/admin/settings"')
  })

  it("recovers owner edit pages from duplicate requests and missing draft releases", () => {
    const edit = source("lib/admin/owner-settings-edit.ts")
    const error = source("app/[locale]/admin/settings/error.tsx")
    expect(edit).toContain("prepareWithConflictRetry")
    expect(edit).toContain('"P2002", "P2034"')
    expect(edit).toContain("await repository.findActiveRelease()")
    expect(edit).toContain("requestedEdit || activeRelease")
    expect(error).toContain('window.location.assign(`/${locale}/admin/settings`)')
    expect(error).not.toContain("window.location.pathname")
  })

  it("preserves role checks and restricted-document navigation", () => {
    const layout = source("app/[locale]/admin/layout.tsx")
    const navigation = source("components/admin/admin-navigation.tsx")
    const documentSettings = source("app/[locale]/admin/documents/settings/page.tsx")
    const ownerStepContent = source("components/admin/owner-settings-step-content.tsx")
    expect(layout).toContain('user!.role !== "ADMIN"')
    expect(navigation).toContain("canViewDocuments")
    expect(documentSettings).toContain("caps.canViewDocuments")
    expect(documentSettings).toContain("Ask an owner to grant document access")
    expect(ownerStepContent).not.toContain("if (!caps.canViewDocuments)")
    expect(ownerStepContent).toContain("<DocumentPolicyEditor")
  })

  it("gives each owner destination one plain business question", () => {
    const pages = {
      "app/[locale]/admin/bookings/settings/flow/page.tsx": "What steps do customers complete?",
      "app/[locale]/admin/bookings/settings/duration/page.tsx": "Set your booking schedule, length and tax",
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

  it("gives owners a guided schedule setup instead of seven repetitive forms", () => {
    const billingRules = source("components/business-configuration/billing-rule-form.tsx")
    expect(billingRules).toContain("Quick setup")
    expect(billingRules).toContain("Weekdays 09:00–18:00")
    expect(billingRules).toContain("Weekdays 08:00–18:00")
    expect(billingRules).toContain("Copy Monday to weekdays")
    expect(billingRules).toContain("Copy Monday to every day")
    expect(billingRules).toContain("Vehicle turnaround preview")
    expect(billingRules).toContain("Fix these schedule details before saving")
    expect(billingRules.indexOf('label="Business timezone"')).toBeLessThan(billingRules.indexOf("Advanced rental calculation"))
    expect(billingRules.indexOf('label="Preparation after return"')).toBeLessThan(billingRules.indexOf("Advanced rental calculation"))
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
