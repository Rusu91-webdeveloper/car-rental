import type {
  BookingStepConfiguration,
  BookingWorkflowConfiguration,
  InsuranceConfiguration,
} from "@/lib/business-configuration/domains"
import type { ConfigurationValidationIssue } from "@/lib/business-configuration/types"
import type { EffectiveBookingField, EffectiveBookingStep } from "./types"

const labels = {
  VEHICLE_AND_DATES: "Vehicle and rental dates",
  CUSTOMER_INFORMATION: "Customer information",
  DRIVER_INFORMATION: "Driver information",
  INSURANCE: "Insurance",
  DOCUMENTS: "Documents",
  LEGAL_ACCEPTANCE: "Terms and privacy",
  PAYMENT: "Payment or booking request",
  REVIEW: "Review",
  CONFIRMATION: "Confirmation",
} as const
const unavailable = new Set(["DOCUMENTS", "LEGAL_ACCEPTANCE"])

export function validateBookingWorkflow(input: {
  workflow: BookingWorkflowConfiguration
  insurance: InsuranceConfiguration
  fields: EffectiveBookingField[]
}) {
  const issues: ConfigurationValidationIssue[] = []
  const byStep = new Map(input.workflow.steps.map((step) => [step.step, step]))
  const blocker = (code: string, step: BookingStepConfiguration["step"], message: string) =>
    issues.push({
      code,
      domain: "booking-workflow",
      field: `steps.${step}`,
      severity: "BLOCKER",
      adminMessage: message,
      remediation: "Choose a supported step mode.",
    })
  for (const step of [
    "VEHICLE_AND_DATES",
    "CUSTOMER_INFORMATION",
    "DRIVER_INFORMATION",
    "REVIEW",
    "CONFIRMATION",
  ] as const)
    if (byStep.get(step)?.requirement !== "REQUIRED")
      blocker(
        step === "CONFIRMATION"
          ? "CONFIRMATION_STEP_REQUIRED"
          : step === "CUSTOMER_INFORMATION"
            ? "CUSTOMER_STEP_REQUIRED"
            : step === "DRIVER_INFORMATION"
              ? "DRIVER_STEP_REQUIRED"
              : "BOOKING_STEP_REQUIRED",
        step,
        `${labels[step]} must remain required.`,
      )
  for (const step of unavailable)
    if (byStep.get(step as BookingStepConfiguration["step"])?.requirement !== "HIDDEN")
      blocker(
        step === "DOCUMENTS" ? "DOCUMENT_STEP_NOT_AVAILABLE" : "LEGAL_STEP_NOT_AVAILABLE",
        step as BookingStepConfiguration["step"],
        `${labels[step as keyof typeof labels]} is available in a later phase and must remain hidden.`,
      )
  const insuranceStep = byStep.get("INSURANCE")
  if (input.insurance.enabled && insuranceStep?.requirement === "HIDDEN")
    blocker("INSURANCE_STEP_REQUIRED", "INSURANCE", "Insurance is enabled, so the Insurance step must be present.")
  if (!input.insurance.enabled && insuranceStep?.requirement !== "HIDDEN")
    blocker("WORKFLOW_DOMAIN_CONFLICT", "INSURANCE", "Insurance is disabled, so its step must be hidden.")
  if (input.insurance.selectionMode === "MANDATORY" && insuranceStep?.requirement !== "REQUIRED")
    blocker("INSURANCE_STEP_REQUIRED", "INSURANCE", "Required insurance must use a required step.")
  if (
    input.fields.some(({ required, section }) => required && section === "CUSTOMER") &&
    byStep.get("CUSTOMER_INFORMATION")?.requirement === "HIDDEN"
  )
    blocker(
      "WORKFLOW_FIELD_CONFLICT",
      "CUSTOMER_INFORMATION",
      "Required customer fields need the Customer information step.",
    )
  return issues
}

export function resolveEffectiveBookingFlow(workflow: BookingWorkflowConfiguration): EffectiveBookingStep[] {
  return [...workflow.steps]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((step) => ({
      step: step.step,
      label: labels[step.step],
      visible: step.requirement !== "HIDDEN" && !unavailable.has(step.step),
      required: step.requirement === "REQUIRED",
      available: !unavailable.has(step.step),
      reason: unavailable.has(step.step) ? "Available in a later setup phase." : undefined,
      displayOrder: step.displayOrder,
    }))
}
