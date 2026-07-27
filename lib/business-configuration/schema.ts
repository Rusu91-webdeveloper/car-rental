import { z } from "zod";
import {
  BOOKING_STEPS,
  CONFIRMATION_SECTIONS,
  CUSTOMER_FIELD_MODES,
  CUSTOMER_FIELDS,
  DOCUMENT_REQUIREMENT_MODES,
  DOCUMENT_TYPES,
  PAYMENT_METHODS,
  REQUIREMENT_LEVELS,
} from "./domains";

const codeMessage = (code: string, message: string) => `${code}|${message}`;

const localeSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/, "Use a supported locale code");
const uniqueStrings = (values: string[]) =>
  new Set(values).size === values.length;

export const PROVISIONAL_CONFIGURATION_LIMITS = {
  documentRetentionDays: { minimum: 1, maximum: 365 },
} as const;

function isIanaTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const generalRentalConfigurationSchema = z.object({
  businessTimeZone: z
    .string()
    .trim()
    .min(1)
    .refine(isIanaTimeZone, "Use a valid IANA timezone"),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, "Use a three-letter ISO currency code"),
  supportedLocales: z
    .array(localeSchema)
    .min(1, "At least one language is required")
    .refine(uniqueStrings, "Languages must not be repeated"),
});

export const pricingBillingConfigurationSchema = z.object({
  weeklyPricingEnabled: z.boolean(),
  monthlyPricingEnabled: z.boolean(),
  mixedDurationStrategy: z.enum([
    "DAILY_ONLY",
    "LONGEST_BLOCKS_THEN_DAYS",
    "LOWEST_VALID_TOTAL",
  ]),
  rentalMonthDefinition: z.enum([
    "FIXED_28_DAYS",
    "FIXED_30_DAYS",
    "CALENDAR_MONTH",
  ]),
  billableDayRule: z.enum([
    "STARTED_24_HOUR_PERIODS",
    "CALENDAR_DAYS",
    "PICKUP_TIME_BOUNDARY",
  ]),
  gracePeriodMinutes: z.number().int().min(0).max(720),
  preparationBufferMinutes: z.number().int().min(0).max(720),
  minimumRentalMinutes: z.number().int().min(1).max(525_600),
  minimumChargeDays: z.number().int().min(1).max(365),
  pricesIncludeTax: z.boolean(),
  taxRateBps: z.number().int().min(0).max(10_000),
});

export const insuranceConfigurationSchema = z
  .object({
    enabled: z.boolean(),
    customerFacingName: z.string().trim().min(1),
    shortDescription: z.string().trim().max(500).optional(),
    selectionMode: z.enum(["OPTIONAL", "MANDATORY"]),
    pricePerDay: z.number().int().min(0).max(100_000_000),
    taxTreatment: z.enum(["INHERIT_RENTAL", "TAX_INCLUDED", "TAX_EXCLUDED"]),
    availabilityScope: z.enum(["ALL_VEHICLES", "SELECTED_VEHICLES"]),
    vehicleIds: z
      .array(z.string().trim().min(1))
      .refine(uniqueStrings, "Vehicles must not be repeated"),
    showInConfirmation: z.boolean(),
    showCustomerSelection: z.boolean(),
    preselectedByDefault: z.boolean(),
  })
  .superRefine((configuration, context) => {
    if (configuration.enabled && configuration.pricePerDay <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pricePerDay"],
        message: codeMessage(
          "insurance.price_required",
          "Enter a positive daily insurance price",
        ),
      });
    }
    if (
      configuration.availabilityScope === "SELECTED_VEHICLES" &&
      configuration.vehicleIds.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vehicleIds"],
        message: codeMessage(
          "insurance.vehicle_required",
          "Select at least one eligible vehicle",
        ),
      });
    }
    if (configuration.enabled && configuration.selectionMode === "OPTIONAL" && !configuration.showCustomerSelection) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["showCustomerSelection"],
        message: codeMessage("insurance.optional_selection_hidden", "Optional insurance must show a customer choice"),
      });
    }
    if ((!configuration.enabled || configuration.selectionMode === "MANDATORY") && configuration.showCustomerSelection) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["showCustomerSelection"],
        message: codeMessage("insurance.selection_not_applicable", "Only optional insurance can show a customer selection"),
      });
    }
    if (configuration.preselectedByDefault && !configuration.showCustomerSelection) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preselectedByDefault"],
        message: codeMessage("insurance.preselection_requires_choice", "Preselection requires a visible customer choice"),
      });
    }
  });

const requirementSchema = z.enum(REQUIREMENT_LEVELS);
const customerFieldModeSchema = z.enum(CUSTOMER_FIELD_MODES);
const documentRequirementModeSchema = z.enum(DOCUMENT_REQUIREMENT_MODES);
const customerFieldsSchema = z.object(
  Object.fromEntries(
    CUSTOMER_FIELDS.map((field) => [field, customerFieldModeSchema]),
  ) as Record<(typeof CUSTOMER_FIELDS)[number], typeof customerFieldModeSchema>,
);

export const customerDriverRequirementsConfigurationSchema = z
  .object({
    minimumDriverAge: z.number().int().min(18).max(99),
    maximumDriverAge: z.number().int().min(18).max(120).optional(),
    minimumLicenceHeldMonths: z.number().int().min(0).max(1_200),
    licenceMustCoverRentalEnd: z.boolean(),
    allowedLicenceCountries: z
      .array(
        z
          .string()
          .trim()
          .regex(/^[A-Z]{2}$/, "Use two-letter country codes"),
      )
      .refine(uniqueStrings, "Countries must not be repeated"),
    fields: customerFieldsSchema,
  })
  .superRefine((configuration, context) => {
    if (
      configuration.maximumDriverAge !== undefined &&
      configuration.maximumDriverAge < configuration.minimumDriverAge
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maximumDriverAge"],
        message: codeMessage(
          "driver.age_range",
          "Maximum driver age must not be below minimum driver age",
        ),
      });
    }
    for (const field of ["FIRST_NAME", "LAST_NAME", "EMAIL"] as const) {
      if (configuration.fields[field] !== "REQUIRED") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", field],
          message: codeMessage(
            "customer.system_field_required",
            `${field} is required for booking integrity`,
          ),
        });
      }
    }
    if (configuration.fields.DATE_OF_BIRTH !== "REQUIRED") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fields", "DATE_OF_BIRTH"],
        message: codeMessage(
          "driver.birth_date_required",
          "Date of birth is required when age rules are active",
        ),
      });
    }
    if (
      configuration.minimumLicenceHeldMonths > 0 &&
      configuration.fields.LICENCE_ISSUE_DATE !== "REQUIRED"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fields", "LICENCE_ISSUE_DATE"],
        message: codeMessage(
          "driver.licence_issue_date_required",
          "Licence issue date is required when a minimum holding period is configured",
        ),
      });
    }
  });

const bookingStepSchema = z.object({
  step: z.enum(BOOKING_STEPS),
  requirement: requirementSchema,
  displayOrder: z.number().int().min(0).max(100),
});

export const bookingWorkflowConfigurationSchema = z
  .object({ steps: z.array(bookingStepSchema).length(BOOKING_STEPS.length) })
  .superRefine(({ steps }, context) => {
    const configuredSteps = new Set(steps.map(({ step }) => step));
    if (configuredSteps.size !== BOOKING_STEPS.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps"],
        message: codeMessage(
          "workflow.steps_unique",
          "Configure every supported booking step exactly once",
        ),
      });
    }
    for (const step of ["VEHICLE_AND_DATES", "CONFIRMATION"] as const) {
      if (
        steps.find((item) => item.step === step)?.requirement !== "REQUIRED"
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", step],
          message: codeMessage(
            "workflow.system_step_required",
            `${step} cannot be optional or hidden`,
          ),
        });
      }
    }
  });

const documentRequirementSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  requirement: documentRequirementModeSchema,
  fileCount: z.number().int().min(1).max(2),
  sides: z.enum(["SINGLE_FILE", "FRONT_AND_BACK"]),
  uploadStage: z.enum(["DURING_BOOKING", "AFTER_REQUEST", "BEFORE_PICKUP"]),
});

export const documentPolicyConfigurationSchema = z.object({
  retentionPreferenceDays: z
    .number()
    .int()
    .min(PROVISIONAL_CONFIGURATION_LIMITS.documentRetentionDays.minimum)
    .max(PROVISIONAL_CONFIGURATION_LIMITS.documentRetentionDays.maximum),
  requirements: z
    .array(documentRequirementSchema)
    .max(DOCUMENT_TYPES.length)
    .refine(
      (requirements) =>
        uniqueStrings(requirements.map(({ documentType }) => documentType)),
      "Document types must not be repeated",
    ),
  permittedRoleIds: z
    .array(z.string().trim().min(1))
    .refine(uniqueStrings, "Roles must not be repeated"),
});

const paymentMethodSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  enabled: z.boolean(),
});

export const paymentConfigurationSchema = z
  .object({
    defaultMethod: z.enum(PAYMENT_METHODS),
    confirmationMode: z.enum(["IMMEDIATE", "REQUIRES_REVIEW"]),
    depositMode: z.enum(["NONE", "FIXED_AMOUNT", "PERCENTAGE_BPS"]),
    depositValue: z.number().int().min(0).max(100_000_000),
    remainingBalanceRule: z.enum([
      "NOT_APPLICABLE",
      "ON_PICKUP",
      "BEFORE_PICKUP",
    ]),
    methods: z.array(paymentMethodSchema).min(1),
    instructions: z.array(
      z.object({
        method: z.enum(PAYMENT_METHODS),
        locale: localeSchema,
        instructions: z.string().trim().min(1).max(5_000),
      }),
    ),
  })
  .superRefine((configuration, context) => {
    const enabled = configuration.methods.filter(({ enabled }) => enabled);
    if (enabled.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["methods"],
        message: codeMessage(
          "payments.method_required",
          "Enable at least one supported payment method",
        ),
      });
    }
    if (!enabled.some(({ method }) => method === configuration.defaultMethod)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultMethod"],
        message: codeMessage(
          "payments.default_not_enabled",
          "The default payment method must be enabled",
        ),
      });
    }
    const instructionKeys = configuration.instructions.map(({ method, locale }) => `${method}:${locale}`);
    if (!uniqueStrings(instructionKeys)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["instructions"],
        message: codeMessage(
          "payments.instructions_unique",
          "Configure at most one instruction per payment method and language",
        ),
      });
    }
    for (const { method } of enabled) {
      if (!configuration.instructions.some((instruction) => instruction.method === method)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["instructions", method],
          message: codeMessage(
            "payments.instructions_required",
            `Add payment instructions for ${method}`,
          ),
        });
      }
    }
    if (
      configuration.depositMode === "NONE" &&
      configuration.depositValue !== 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["depositValue"],
        message: codeMessage(
          "payments.deposit_not_applicable",
          "Deposit value must be zero when deposits are disabled",
        ),
      });
    }
    if (
      configuration.depositMode !== "NONE" &&
      configuration.depositValue <= 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["depositValue"],
        message: codeMessage(
          "payments.deposit_required",
          "Enter a positive deposit value",
        ),
      });
    }
    if (
      configuration.depositMode === "PERCENTAGE_BPS" &&
      configuration.depositValue > 10_000
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["depositValue"],
        message: codeMessage(
          "payments.deposit_percentage_range",
          "Deposit percentage cannot exceed 100%",
        ),
      });
    }
  });

const confirmationSectionSchema = z.object({
  section: z.enum(CONFIRMATION_SECTIONS),
  enabled: z.boolean(),
});

export const confirmationConfigurationSchema = z.object({
  sections: z
    .array(confirmationSectionSchema)
    .refine(
      (sections) => uniqueStrings(sections.map(({ section }) => section)),
      "Confirmation sections must not be repeated",
    ),
  content: z.array(
    z.object({
      locale: localeSchema,
      heading: z.string().trim().max(200).optional(),
      safeContent: z
        .string()
        .trim()
        .max(10_000)
        .refine(
          (value) => !/<\s*script\b/i.test(value),
          "Executable content is not allowed",
        )
        .optional(),
    }),
  ),
});

const legalDocumentReferenceSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(["RENTAL_TERMS", "PRIVACY_NOTICE"]),
  publicationStatus: z.enum(["PUBLISHED", "ARCHIVED"]),
  availableLocales: z
    .array(localeSchema)
    .min(1)
    .refine(uniqueStrings, "Languages must not be repeated"),
  contentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, "Use a SHA-256 content hash"),
});

export const legalAcceptanceConfigurationSchema = z
  .object({
    termsDocument: legalDocumentReferenceSchema,
    privacyDocument: legalDocumentReferenceSchema,
    termsAcceptance: z.enum(["REQUIRED", "DISPLAY_ONLY", "DISABLED"]),
    privacyAcknowledgment: z.enum(["REQUIRED", "DISPLAY_ONLY", "DISABLED"]),
    retainRenderedSnapshot: z.boolean(),
    bookingEnforcementEnabled: z.boolean(),
    requiredLocales: z.array(localeSchema).refine(uniqueStrings, "Languages must not be repeated"),
    termsPresentation: z.enum(["INLINE", "DIALOG"]),
    privacyPresentation: z.enum(["INLINE", "DIALOG"]),
    showInConfirmation: z.boolean(),
    translations: z.array(z.object({
      locale: localeSchema,
      termsCheckboxLabel: z.string().trim().min(1).max(500).optional(),
      termsLinkLabel: z.string().trim().min(1).max(200),
      privacyCheckboxLabel: z.string().trim().min(1).max(500).optional(),
      privacyLinkLabel: z.string().trim().min(1).max(200),
    })).refine((items) => uniqueStrings(items.map(({ locale }) => locale)), "Languages must not be repeated"),
  })
  .superRefine((configuration, context) => {
    if (configuration.bookingEnforcementEnabled && configuration.requiredLocales.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["requiredLocales"], message: codeMessage("LEGAL_PRIMARY_LANGUAGE_MISSING", "Choose at least one required legal language") });
    }
    if (configuration.termsDocument.type !== "RENTAL_TERMS") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["termsDocument", "type"],
        message: codeMessage(
          "legal.terms_type",
          "Select a published rental terms document",
        ),
      });
    }
    if (configuration.privacyDocument.type !== "PRIVACY_NOTICE") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["privacyDocument", "type"],
        message: codeMessage(
          "legal.privacy_type",
          "Select a published privacy notice",
        ),
      });
    }
  });

export const configurationDomainSchemas = {
  "general-rental": generalRentalConfigurationSchema,
  "pricing-billing": pricingBillingConfigurationSchema,
  insurance: insuranceConfigurationSchema,
  "customer-driver-requirements": customerDriverRequirementsConfigurationSchema,
  "booking-workflow": bookingWorkflowConfigurationSchema,
  "document-policy": documentPolicyConfigurationSchema,
  payments: paymentConfigurationSchema,
  confirmations: confirmationConfigurationSchema,
  "legal-acceptance": legalAcceptanceConfigurationSchema,
} as const;
