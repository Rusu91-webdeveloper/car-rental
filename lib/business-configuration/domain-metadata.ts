import type { ConfigurationDomainId } from "./types"

export const CONFIGURATION_DOMAIN_METADATA: Record<
  ConfigurationDomainId,
  { label: string; description: string; route: string }
> = {
  "general-rental": {
    label: "General rental",
    description: "Timezone, currency, and supported customer languages.",
    route: "/admin/business-configuration/advanced",
  },
  "pricing-billing": {
    label: "Pricing and billing",
    description: "Rental duration, rate selection, tax, and billing rules.",
    route: "/admin/business-configuration/pricing",
  },
  insurance: {
    label: "Insurance",
    description: "Customer-facing insurance availability and pricing.",
    route: "/admin/business-configuration/insurance",
  },
  "customer-driver-requirements": {
    label: "Driver and customer information",
    description: "Eligibility rules and required booking information.",
    route: "/admin/business-configuration/driver-requirements",
  },
  "booking-workflow": {
    label: "Booking flow",
    description: "The supported steps customers complete while booking.",
    route: "/admin/business-configuration/booking-flow",
  },
  "document-policy": {
    label: "Documents",
    description: "Document requirements, access, and retention preferences.",
    route: "/admin/business-configuration/documents",
  },
  payments: {
    label: "Payments",
    description: "Supported payment methods and deposit rules.",
    route: "/admin/business-configuration/payments",
  },
  confirmations: {
    label: "Confirmations",
    description: "Safe content included in customer confirmations.",
    route: "/admin/business-configuration/confirmations",
  },
  "legal-acceptance": {
    label: "Legal",
    description: "Published terms, privacy notice, and acknowledgement rules.",
    route: "/admin/business-configuration/legal",
  },
}

export const BUSINESS_CONFIGURATION_NAVIGATION = [
  { label: "Overview", segment: "overview", capability: "configuration.view" },
  { label: "Pricing", segment: "pricing", capability: "pricing.manage" },
  { label: "Billing rules", segment: "billing", capability: "pricing.manage" },
  { label: "Insurance", segment: "insurance", capability: "configuration.view" },
  { label: "Driver requirements", segment: "driver-requirements", capability: "configuration.view" },
  { label: "Customer information", segment: "customer-information", capability: "configuration.view" },
  { label: "Booking flow", segment: "booking-flow", capability: "configuration.view" },
  { label: "Documents", segment: "documents", capability: "documents.view" },
  { label: "Payments", segment: "payments", capability: "configuration.view" },
  { label: "Legal", segment: "legal", capability: "legal.edit" },
  { label: "Confirmations", segment: "confirmations", capability: "configuration.view" },
  { label: "Advanced", segment: "advanced", capability: "configuration.view" },
] as const
