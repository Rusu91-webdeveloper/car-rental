import { getCompanySettings } from "@/app/actions/settings"
import { DocumentPolicyEditor } from "@/app/[locale]/admin/business-configuration/documents/policy-editor"
import { BusinessProfileForm } from "@/components/admin/business-profile-form"
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied"
import { NotificationContactsForm } from "@/components/admin/notification-contacts-form"
import { PaymentDetailsForm } from "@/components/admin/payment-details-form"
import { BillingRuleForm } from "@/components/business-configuration/billing-rule-form"
import { BookingFlowStepList } from "@/components/business-configuration/booking-flow-step-list"
import { ConfirmationContentForm } from "@/components/business-configuration/confirmation-content-form"
import { CustomerFieldRequirementTable } from "@/components/business-configuration/customer-field-requirement-table"
import { DriverRequirementsForm } from "@/components/business-configuration/driver-requirements-form"
import { InsuranceConfigurationForm } from "@/components/business-configuration/insurance-configuration-form"
import { PaymentInstructionForm } from "@/components/business-configuration/notification-configuration-form"
import { PricingIssueList } from "@/components/business-configuration/pricing-issue-list"
import { LegalAcceptanceConfigurationForm } from "@/components/legal/legal-acceptance-configuration-form"
import { LegalDocumentList } from "@/components/legal/legal-document-list"
import {
  ensureOwnerDraftRelease,
  prepareOwnerBookingExperienceEdit,
  prepareOwnerLegalEdit,
  prepareOwnerNotificationEdit,
  prepareOwnerPricingEdit,
} from "@/lib/admin/owner-settings-edit"
import type { OwnerSettingsStep } from "@/lib/admin/owner-settings-guide"
import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { prisma } from "@/lib/db"
import { PrismaDocumentConfigurationRepository } from "@/lib/document-configuration/prisma-repository"
import { loadLegalAdministrationPage } from "@/lib/legal/service"
import { loadNotificationConfigurationPage } from "@/lib/notification-configuration/service"
import { loadPhase6ConfigurationPage } from "@/lib/phase6-admin/service"
import { loadPricingConfigurationPage } from "@/lib/pricing-admin/service"
import { readPrivateDocumentEnvironment } from "@/lib/private-documents/infrastructure/environment"

interface OwnerSettingsStepContentProps {
  step: OwnerSettingsStep
  adminId: string
  nextHref: string
  editing: boolean
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
}: OwnerSettingsStepContentProps) {
  if (step.id === "business-profile") {
    const settings = requireCompanySettings(
      await getCompanySettings(),
      "Business settings are unavailable.",
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
        <PricingIssueList title="What needs attention" issues={data.issues} />
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
            title="What needs attention"
            issues={data.issues.filter((issue) => issue.domain === "insurance")}
          />
        </>
      )
    }

    if (step.id === "booking-flow") {
      return (
        <BookingFlowStepList
          key={`${data.draftWorkflow?.id}-${data.draftWorkflow?.revision}`}
          data={data}
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
            title="What needs attention"
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
    if (!caps.canViewDocuments) {
      return (
        <div className="rounded-xl border bg-card p-6">
          <h2 className="text-lg font-semibold">You do not have access to customer documents</h2>
          <p className="mt-2 text-sm text-muted-foreground">Ask an owner to grant document access.</p>
        </div>
      )
    }
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
    const settings = requireCompanySettings(settingsResult, "Payment settings are unavailable.")
    return (
      <>
        <PaymentDetailsForm value={settings} />
        <PaymentInstructionForm
          key={`${data.draftPayment?.id ?? "live"}-${data.draftPayment?.revision ?? 0}`}
          data={data}
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
      "Notification settings are unavailable.",
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
    const data = editing
      ? await prepareOwnerLegalEdit(adminId)
      : await loadLegalAdministrationPage()
    return (
      <>
        <LegalDocumentList
          data={data}
          canEdit={caps.canEditLegal}
          canPublish={caps.canPublishLegal}
          canValidate={caps.canValidate}
        />
        <LegalAcceptanceConfigurationForm
          data={data}
          canEdit={caps.canEditLegal}
          canValidate={caps.canValidate}
          canAttach={caps.canEdit}
          nextHref={nextHref}
          editing={editing}
        />
        <PricingIssueList title="What needs attention" issues={data.issues} />
      </>
    )
  }

  return null
}
