import type {
  BookingWorkflowConfiguration,
  CustomerDriverRequirementsConfiguration,
  InsuranceConfiguration,
} from "@/lib/business-configuration/domains"
import type { ConfigurationValidationIssue } from "@/lib/business-configuration/types"

export interface Phase6Version<T> {
  id: string
  versionNumber: number
  revision: number
  status: string
  validationStatus: string
  changeSummary: string
  updatedAt: string
  updatedBy: string
  configuration: T
}

export interface Phase6Vehicle {
  id: string
  name: string
  slug: string
  status: string
  activeForBooking: boolean
}

export interface Phase6AdminPageData {
  currency: string
  activeRelease?: { id: string; releaseNumber: number }
  draftRelease?: { id: string; releaseNumber: number; revision: number }
  liveInsurance?: Phase6Version<InsuranceConfiguration>
  draftInsurance?: Phase6Version<InsuranceConfiguration>
  liveCustomerDriver?: Phase6Version<CustomerDriverRequirementsConfiguration>
  draftCustomerDriver?: Phase6Version<CustomerDriverRequirementsConfiguration>
  liveWorkflow?: Phase6Version<BookingWorkflowConfiguration>
  draftWorkflow?: Phase6Version<BookingWorkflowConfiguration>
  vehicles: Phase6Vehicle[]
  issues: ConfigurationValidationIssue[]
  attached: { insurance: boolean; customerDriver: boolean; workflow: boolean }
  insuranceQuoteExample?: {
    billableDays: number
    unselectedGrandTotal: number
    selectedGrandTotal: number
    insuranceSubtotal: number
  }
}
