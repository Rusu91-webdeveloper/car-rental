import { getCompanySettings } from "@/app/actions/settings"
import { DocumentPolicyEditor } from "@/app/[locale]/admin/business-configuration/documents/policy-editor"
import { BusinessProfileForm } from "@/components/admin/business-profile-form"
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied"
import { NotificationContactsForm } from "@/components/admin/notification-contacts-form"
import { BillingRuleForm } from "@/components/business-configuration/billing-rule-form"
import { BookingFlowStepList } from "@/components/business-configuration/booking-flow-step-list"
import { ConfirmationContentForm } from "@/components/business-configuration/confirmation-content-form"
import { CustomerFieldRequirementTable } from "@/components/business-configuration/customer-field-requirement-table"
import { DriverRequirementsForm } from "@/components/business-configuration/driver-requirements-form"
import { InsuranceConfigurationForm } from "@/components/business-configuration/insurance-configuration-form"
import { PaymentInstructionForm } from "@/components/business-configuration/notification-configuration-form"
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list"
import { OwnerLegalSetupForm } from "@/components/legal/owner-legal-setup-form"
import {
  ensureOwnerDraftRelease,
  loadOwnerBookingWorkflowDependencies,
  prepareOwnerBookingExperienceEdit,
  prepareOwnerLegalEdit,
  prepareOwnerNotificationEdit,
  prepareOwnerPricingEdit,
} from "@/lib/admin/owner-settings-edit"
import type { OwnerSettingsStep } from "@/lib/admin/owner-settings-guide"
import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { prisma } from "@/lib/db"
import { PrismaDocumentConfigurationRepository } from "@/lib/document-configuration/prisma-repository"
import { loadNotificationConfigurationPage } from "@/lib/notification-configuration/service"
import { loadPhase6ConfigurationPage } from "@/lib/phase6-admin/service"
import { loadPricingConfigurationPage } from "@/lib/pricing-admin/service"
import { readPrivateDocumentEnvironment } from "@/lib/private-documents/infrastructure/environment"

interface OwnerSettingsStepContentProps {
  step: OwnerSettingsStep
  adminId: string
  nextHref: string
  editing: boolean
  locale: string
}

function requireCompanySettings(
  result: Awaited<ReturnType<typeof getCompanySettings>>,
  unavailableMessage: string,
) {
  if (!("settings" in result) || !result.settings) {
    throw new Error(result.error ?? unavailableMessage)
  }
  return result.settings
}

export async function OwnerSettingsStepContent({
  step,
  adminId,
  nextHref,
  editing,
  locale,
}: OwnerSettingsStepContentProps) {
  const de = locale === "de"
  if (step.id === "business-profile") {
    const settings = requireCompanySettings(
      await getCompanySettings(),
      de ? "Die Unternehmenseinstellungen sind nicht verfügbar." : "Business settings are unavailable.",
    )
    return <BusinessProfileForm value={settings} nextHref={nextHref} />
  }

  const caps = await getBusinessConfigurationCapabilities()
  if (!caps.canView) return <ConfigurationAccessDenied />

  if (step.id === "rental-rules") {
    const data = editing
      ? await prepareOwnerPricingEdit(adminId)
      : await loadPricingConfigurationPage()
    return (
      <>
        <BillingRuleForm
          key={`${data.draftPricing?.id ?? "none"}-${data.draftPricing?.revision ?? 0}`}
          data={data}
          canManage={caps.canManagePricing}
          nextHref={nextHref}
        />
        <PricingIssueList title={de ? "Was benötigt Aufmerksamkeit?" : "What needs attention"} issues={data.issues} />
      </>
    )
  }

  if (["insurance", "booking-flow", "driver-rules", "customer-information"].includes(step.id)) {
    const data = editing
      ? await prepareOwnerBookingExperienceEdit(adminId)
      : await loadPhase6ConfigurationPage()

    if (step.id === "insurance") {
      return (
        <>
          <InsuranceConfigurationForm
            key={`${data.draftInsurance?.id}-${data.draftInsurance?.revision}`}
            data={data}
            canEdit={caps.canManageInsurance}
            nextHref={nextHref}
          />
          <PricingIssueList
            title={de ? "Was benötigt Aufmerksamkeit?" : "What needs attention"}
            issues={data.issues.filter((issue) => issue.domain === "insurance")}
          />
        </>
      )
    }

    if (step.id === "booking-flow") {
      const { documents, legal, dependencyKey } = await loadOwnerBookingWorkflowDependencies(data.draftRelease?.id)
      return (
        <BookingFlowStepList
          key={`${data.draftWorkflow?.id}-${data.draftWorkflow?.revision}-${dependencyKey}`}
          data={data}
          documents={documents}
          legal={legal}
          canEdit={caps.canManageBookingWorkflow}
          nextHref={nextHref}
        />
      )
    }

    if (step.id === "driver-rules") {
      return (
        <>
          <DriverRequirementsForm
            key={`${data.draftCustomerDriver?.id}-${data.draftCustomerDriver?.revision}`}
            data={data}
            canEdit={caps.canManageDriverRequirements}
            nextHref={nextHref}
          />
          <PricingIssueList
            title={de ? "Was benötigt Aufmerksamkeit?" : "What needs attention"}
            issues={data.issues.filter((issue) => issue.domain === "customer-driver-requirements")}
          />
        </>
      )
    }

    return (
      <CustomerFieldRequirementTable
        key={`${data.draftCustomerDriver?.id}-${data.draftCustomerDriver?.revision}`}
        data={data}
        canEdit={caps.canManageCustomerFields}
        nextHref={nextHref}
      />
    )
  }

  if (step.id === "documents") {
    if (editing) await ensureOwnerDraftRelease(adminId)
    const environment = readPrivateDocumentEnvironment()
    const data = await new PrismaDocumentConfigurationRepository(prisma).load(
      caps.canEdit,
      environment.issues.length
        ? environment.issues
        : ["DOCUMENT_NONPRODUCTION_WORKFLOW_DISABLED"],
    )
    return <DocumentPolicyEditor data={data} nextHref={nextHref} />
  }

  if (step.id === "payments") {
    const [settingsResult, data] = await Promise.all([
      getCompanySettings(),
      editing
        ? prepareOwnerNotificationEdit(adminId)
        : loadNotificationConfigurationPage(),
    ])
    const settings = requireCompanySettings(
      settingsResult,
      de ? "Die Zahlungseinstellungen sind nicht verfügbar." : "Payment settings are unavailable.",
    )
    return (
      <>
        <PaymentInstructionForm
          key={`${data.draftPayment?.id ?? "live"}-${data.draftPayment?.revision ?? 0}`}
          data={data}
          paymentProfile={settings}
          canEdit={caps.canManagePayments}
          nextHref={nextHref}
        />
      </>
    )
  }

  if (step.id === "customer-messages") {
    const [settingsResult, data] = await Promise.all([
      getCompanySettings(),
      editing
        ? prepareOwnerNotificationEdit(adminId)
        : loadNotificationConfigurationPage(),
    ])
    const settings = requireCompanySettings(
      settingsResult,
      de ? "Die Benachrichtigungseinstellungen sind nicht verfügbar." : "Notification settings are unavailable.",
    )
    return (
      <>
        <NotificationContactsForm
          supportEmail={settings.supportEmail}
          adminEmail={settings.adminEmail}
        />
        <ConfirmationContentForm
          key={`${data.draftConfirmation?.id ?? "live"}-${data.draftConfirmation?.revision ?? 0}`}
          data={data}
          canEdit={caps.canManageConfirmations}
          nextHref={nextHref}
        />
      </>
    )
  }

  if (step.id === "legal") {
    const data = await prepareOwnerLegalEdit(adminId)
    return (
      <OwnerLegalSetupForm
        key={`${data.documents.map(({ id, revision }) => `${id}:${revision}`).join("|")}-${data.draftAcceptance?.revision ?? "none"}`}
        data={data}
        canComplete={caps.canEditLegal && caps.canPublishLegal && caps.canValidate && caps.canEdit}
        nextHref={nextHref}
        editing={editing}
      />
    )
  }

  return null
}
