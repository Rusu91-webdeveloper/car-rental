# Graph Report - car-rental-app  (2026-07-14)

## Corpus Check
- 488 files · ~292,365 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3552 nodes · 7929 edges · 248 communities (168 shown, 80 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 100 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d5cb450c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 38
- Community 40
- Community 41
- Community 47
- Community 48
- Community 49
- Community 50
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Vercel Deployment Readiness Checklist
- money.ts
- Summary of Changes - Manual Payment System Implementation
- service.ts
- prisma-repository.ts
- pricing-configuration.ts
- configuration-overview.tsx
- Phase 8E-A — Vercel Blob private-storage design
- checkout-client.tsx
- service.ts
- booking-applications.ts
- repositories.ts
- migration.sql
- enforceRateLimit
- Business Configuration Architecture Proposal
- migration.sql
- server.ts
- page.tsx
- Email Configuration Guide
- Quick Start Guide - Manual Payment System
- page.tsx
- phase8e-nonproduction-integration-guard.test.ts
- migration.sql
- prisma-repository.ts
- Phase 2B — Schema and Migration Evidence
- Phase 8C — Private-document schema and migrations
- Project Setup Complete! 🎉
- Vercel Server-Side Error Troubleshooting Guide
- policy-editor.tsx
- Phase 8E-C — Vercel Blob non-production integration
- migration.sql
- Phase 8E-B — Vercel Blob private-storage adapter
- devDependencies
- Missing /cars Page - FIXED ✅
- ApplicationMutationInput
- Phase 8F-B — customer and administrator private-document workflow
- vehicle-rate-table.tsx
- Delivery phases
- Phase 5 — Pricing and Billing Administration
- bookings.ts
- carousel.tsx
- Current State Audit
- Phase 8D — Provider-neutral private-document lifecycle
- Internationalization (i18n) Implementation Guide
- Status Definitions
- Phase 3 — Centralized Pricing Engine
- Phase 7 — Legal publication and booking acceptance
- migration.sql
- form.tsx
- Phase 4 — Business Configuration Shell and Release Workflow
- Next.js 16 Params & Booking Errors - FIXED ✅
- SignOutButton Error - FIXED ✅
- duration.ts
- Car Rental App - Production Setup Guide
- Phase 8F-A — manual private-document review prerequisites
- What Needs to Happen 🔄
- workflow-errors.ts
- Phase 6 — Insurance, driver, customer, and booking workflow
- Option 3: Manually Set User as Admin
- health.ts
- Architecture Graph Summary
- Phase 1 Foundation Evidence
- Fix Vercel Database URL Issue
- migration.sql
- page.tsx
- Open Questions Requiring Client or Technical Approval
- MIGRATION_NOTES.md
- i18n Implementation Status
- overrides
- migration.sql
- verify-phase8f-review-concurrency.ts
- phase8c-schema-migration.test.ts
- package.json
- migration.sql
- migration.sql
- migration.sql
- bootstrap-restricted-roles.ts
- Simplified i18n Implementation - Step by Step
- migration.sql
- Requirements Gap Analysis
- reauth-action.ts
- migration.sql
- migration.sql
- migration.sql
- phase8fb-booking-application-schema.test.ts
- eslint-config-next
- input-otp
- @radix-ui/react-tabs
- @radix-ui/react-toast
- server-only
- tailwindcss-animate
- @vercel/analytics
- @vercel/blob
- prisma
- tailwindcss
- @tailwindcss/postcss
- @types/nodemailer
- typescript
- migration.sql
- "CustomerDocument"
- migration.sql
- phase8fb-booking-application-verification.sql
- phase6-schema-migration.test.ts
- phase8d-replacement-migration.test.ts
- phase7-schema-migration.test.ts
- demo-banner.tsx
- eslint
- prisma
- migration.sql

## God Nodes (most connected - your core abstractions)
1. `cn()` - 278 edges
2. `documentError()` - 95 edges
3. `DocumentLifecycleRepository` - 53 edges
4. `PrivateObjectReference` - 51 edges
5. `PrismaDocumentLifecycleRepository` - 46 edges
6. `InMemoryDocumentLifecycleRepository` - 42 edges
7. `requireCapability()` - 40 edges
8. `Button()` - 37 edges
9. `ApplicationMutationInput` - 33 edges
10. `VercelBlobPrivateStorageAdapter` - 32 edges

## Surprising Connections (you probably didn't know these)
- `AdminDashboard()` --indirect_call--> `Calendar()`  [INFERRED]
  app/[locale]/admin/admin-client.tsx → components/ui/calendar.tsx
- `DocumentReviewQueuePage()` --calls--> `loadRestrictedDocumentActor()`  [EXTRACTED]
  app/[locale]/admin/documents/page.tsx → lib/private-documents/server/request-context.ts
- `mapDomains()` --indirect_call--> `sides()`  [INFERRED]
  lib/business-configuration/prisma-repository.ts → app/[locale]/applications/[applicationId]/booking-application-client.tsx
- `MobileMenuContent()` --calls--> `cn()`  [EXTRACTED]
  components/mobile-menu.tsx → lib/utils.ts
- `NavigationMenuContent()` --calls--> `cn()`  [EXTRACTED]
  components/navigation-menu.tsx → lib/utils.ts

## Import Cycles
- None detected.

## Communities (248 total, 80 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.10
Nodes (40): createAdminUser(), createManualReservation(), createManualReservationSchema, deleteAdminUser(), deleteManualReservation(), encodeManualReservationReason(), getAdminStats(), getAllBookings() (+32 more)

### Community 1 - "Community 1"
Cohesion: 0.10
Nodes (16): AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay(), AlertDialogTitle() (+8 more)

### Community 2 - "Community 2"
Cohesion: 0.14
Nodes (21): AdminPage(), ManualReservationPayload, parseManualReservationPayload(), CarsPage(), CheckoutPage(), HomePage(), ProfilePage(), SavedPage() (+13 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (41): firaMono, metadata, notoSans, Providers(), Toast, ToastAction, ToastActionElement, ToastClose (+33 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (39): Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay(), SheetTitle(), Sidebar() (+31 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (73): AccordionContent(), AccordionItem(), AccordionTrigger(), Avatar(), AvatarFallback(), AvatarImage(), BreadcrumbEllipsis(), BreadcrumbItem() (+65 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (36): base, createNotificationConfigurationDraftAction(), failure(), manualMethod, refresh(), updateConfirmationContentDraftAction(), updatePaymentInstructionDraftAction(), ConfigurationSectionPage() (+28 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (19): scripts, build, db:backup, db:deploy, db:migrate, db:push, db:seed, db:studio (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.19
Nodes (26): BookingEmailData, configuredTextHtml(), EmailLocale, escapeHtml(), extractEmailAddress(), getEmailConfigStatus(), getResend(), getSmtpTransport() (+18 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (29): ./*, dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+21 more)

### Community 10 - "Community 10"
Cohesion: 0.10
Nodes (12): HoverCardContent(), Progress(), ResizableHandle(), ResizablePanelGroup(), Slider(), Spinner(), Switch(), ToggleGroup() (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.14
Nodes (16): Command(), CommandDialog(), CommandGroup(), CommandInput(), CommandItem(), CommandList(), CommandSeparator(), CommandShortcut() (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.06
Nodes (4): PrivateDocumentLifecycleService, TERMINAL_INTENTS, documentError(), InMemoryDocumentLifecycleRepository

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (24): companySettingsSchema, getCompanySettings(), ContactPage(), DatenschutzPage(), ImpressumPage(), LocaleLayout(), DemoLogin(), WiderrufPage() (+16 more)

### Community 14 - "Community 14"
Cohesion: 0.25
Nodes (3): hasAuthEnv, config, intlMiddleware

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (14): NavigationMenu(), NavigationMenuContent(), NavigationMenuProps, DropdownMenu(), DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel() (+6 more)

### Community 16 - "Community 16"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 17 - "Community 17"
Cohesion: 0.10
Nodes (24): filterCarsByAvailability(), toggleSavedCar(), Car, CarsClient(), BookNowButton(), CarAvailabilityCalendar(), CarAvailabilityCalendarProps, UnavailableDateRange (+16 more)

### Community 18 - "Community 18"
Cohesion: 0.06
Nodes (8): DeletionRecord, objectFrom(), PrismaDocumentLifecycleRepository, decide(), firstClient, main(), parsed, secondClient

### Community 19 - "Community 19"
Cohesion: 0.06
Nodes (11): authorized(), JOBS, POST(), expireBookingApplications(), DocumentCleanupService, DocumentDeletionService, PrivateDocumentOperationsMonitoringService, DocumentLifecycleRepository (+3 more)

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (9): ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut(), ContextMenuSubContent() (+1 more)

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (8): normalizeDatabaseUrl(), backupData(), prisma, prisma, prisma, updateExistingCarsYear(), args, command

### Community 23 - "Community 23"
Cohesion: 0.20
Nodes (6): AppError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError

### Community 24 - "Community 24"
Cohesion: 0.20
Nodes (11): FilterBar(), FilterBarProps, Select(), SelectContent(), SelectItem(), SelectLabel(), SelectScrollDownButton(), SelectScrollUpButton() (+3 more)

### Community 25 - "Community 25"
Cohesion: 0.08
Nodes (23): Administrator and operational validation, Blob and OIDC verification, Concise production checklist, Controlled deployment sequence, Critical launch blockers, Database and migrations, Email, Blob, OIDC, and workers, End-to-end business workflow (+15 more)

### Community 26 - "Community 26"
Cohesion: 0.06
Nodes (30): Architecture review, Authentication and authorization, Blob provisioning, Concurrency and transaction integrity, Critical blockers, Data exposure and logging, Dependency review, Deployment (+22 more)

### Community 27 - "Community 27"
Cohesion: 0.06
Nodes (34): sha256(), validateDocumentFile(), evaluateDocumentInfrastructureHealth(), evaluateProductionDocumentHealth(), isVercelBlobNotFound(), VercelBlobClient, VercelBlobGet, VercelBlobHead (+26 more)

### Community 28 - "Community 28"
Cohesion: 0.07
Nodes (32): AuthorizationDecision, AuthorizationDenialReason, CAPABILITIES, Capability, CapabilityPrincipal, RESTRICTED_DOCUMENT_CAPABILITIES, CapabilityRepository, DbClient (+24 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (24): updateInsuranceDraftAction(), BookingFlowPage(), CustomerInformationPage(), DriverRequirementsPage(), InsurancePage(), BusinessConfigurationLayout(), InsuranceConfigurationForm(), Phase6DraftLiveComparison() (+16 more)

### Community 30 - "Community 30"
Cohesion: 0.05
Nodes (43): BOOKING_STEPS, CONFIRMATION_SECTIONS, ConfirmationContentTranslation, ConfirmationSection, CUSTOMER_FIELD_MODES, CUSTOMER_FIELDS, CustomerDocumentType, CustomerFieldMode (+35 more)

### Community 31 - "Community 31"
Cohesion: 0.25
Nodes (7): DemoBooking, DemoCar, demoCars, DemoStore, DemoUser, demoUsers, useDemoStore

### Community 32 - "Community 32"
Cohesion: 0.29
Nodes (5): GET(), LogData, Logger, LogLevel, sanitize()

### Community 33 - "Community 33"
Cohesion: 0.54
Nodes (7): "AdminAuditLog", "BlockedDate", "Booking", "Car", "Payment", "SavedCar", "User"

### Community 34 - "Community 34"
Cohesion: 0.28
Nodes (11): CalendarDate, compare(), evaluateDriverEligibility(), fullMonths(), fullYears(), parseDate(), zonedDate(), validBusinessConfigurationDomains() (+3 more)

### Community 35 - "Community 35"
Cohesion: 0.29
Nodes (6): AppState, Booking, Car, initialCars, User, useStore

### Community 36 - "Community 36"
Cohesion: 0.47
Nodes (5): "Account", "CompanySettings", "Session", "User", "VerificationToken"

### Community 38 - "Community 38"
Cohesion: 0.09
Nodes (18): AuditEventList(), actorName(), domainByDatabaseValue, mapDomains(), PrismaBusinessConfigurationRepository, releaseAggregate(), ReleaseRow, versionSummary() (+10 more)

### Community 47 - "Community 47"
Cohesion: 0.13
Nodes (15): @auth/prisma-adapter, next-auth, dependencies, @auth/prisma-adapter, next-auth, @radix-ui/react-checkbox, @radix-ui/react-context-menu, @radix-ui/react-dialog (+7 more)

### Community 58 - "Community 58"
Cohesion: 0.07
Nodes (42): CustomerDocumentStatus, ACTIVE_PDF_MARKERS, detect(), safeExtension(), UNSAFE_EXTENSIONS, ValidatedDocumentFile, CUSTOMER_REVIEW_MESSAGES, ReadinessCode (+34 more)

### Community 60 - "Community 60"
Cohesion: 0.06
Nodes (74): archiveLegalVersionAction(), attachLegalDraftToReleaseAction(), createLegalAcceptanceDraftAction(), createLegalDraftAction(), discardLegalDraftAction(), failure(), publishLegalVersionAction(), refresh() (+66 more)

### Community 62 - "Community 62"
Cohesion: 0.04
Nodes (47): 10. Restricted authorization proposal, 11.1 Upload session, 11.2 Upload intent, 11.3 Customer document and quarantine, 11.4 Malware scan, 11.5 Replacement, 11.6 Retention and legal hold, 11.7 Deletion (+39 more)

### Community 66 - "Community 66"
Cohesion: 0.13
Nodes (24): BusinessConfigurationOverviewPage(), ConfigurationOverview(), ConfigurationDbClient, activateDraftRelease(), buildReleasePreview(), changedDomains(), coverage(), fleetIssues() (+16 more)

### Community 67 - "Community 67"
Cohesion: 0.12
Nodes (27): updateBookingWorkflowDraftAction(), BookingFlowStepList(), labels, unavailable, inputKey, maskLicenceNumber(), metadata, normalizeAndValidateBookingFields() (+19 more)

### Community 72 - "Community 72"
Cohesion: 0.08
Nodes (40): POST(), PUT(), POST(), schema, POST(), GET(), DELETE(), POST() (+32 more)

### Community 74 - "Community 74"
Cohesion: 0.04
Nodes (46): 10. File validation policy, 11. Authorization and signed access, 12. Retention, legal hold, and deletion, 13.1 Document-policy administration boundary, 13. Health and release integration, 14. Audit vocabulary, 15. Incident runbook, 16. Owner decisions (+38 more)

### Community 75 - "Community 75"
Cohesion: 0.04
Nodes (45): 10. Backfill and validation queries, 11. Historical and runtime compatibility, 12. Rollback and forward recovery, 13. Risks and mitigations, 14. Genuine owner decisions, 15. Exact Phase 2B file scope, 16. Approval checklist, 17. Phase 2A validation evidence (+37 more)

### Community 87 - "Community 87"
Cohesion: 0.13
Nodes (30): ConfiguredRentalQuote, ActiveInsuranceOffer, PublicBookingConfiguration, PricingError, CurrencyCode, fractionToBasisPoints(), money, normalizeCurrency() (+22 more)

### Community 93 - "Community 93"
Cohesion: 0.08
Nodes (43): "BookingStepRule_immutable", "BookingWorkflowConfigVersion_immutable", "BusinessConfigurationRelease", "BusinessConfigurationRelease_immutable", "ConfigurationVersion", "ConfigurationVersion_immutable", "ConfigurationVersion_payload_domain_check", "ConfirmationConfigVersion_immutable" (+35 more)

### Community 100 - "Community 100"
Cohesion: 0.05
Nodes (40): 1. **`app/actions/bookings.ts`**, 1. Customer Email (Automatic), 2. Admin Email (Automatic), 2. **`app/checkout/[id]/checkout-client.tsx`**, 3. **`app/checkout/[id]/booking-success-modal.tsx`** (NEW), 3. Confirmation Email (Automatic when admin confirms), 4. **`lib/email.tsx`**, Add Multiple Admin Emails (+32 more)

### Community 102 - "Community 102"
Cohesion: 0.17
Nodes (29): attachPhase6DraftsAction(), base, createPhase6DraftAction(), createSchema, customerSchema, discardPhase6DraftAction(), failure(), insuranceSchema (+21 more)

### Community 118 - "Vercel Deployment Readiness Checklist"
Cohesion: 0.05
Nodes (39): 1. Enable Image Optimization, 1. Middleware Deprecation Warning, 1. Pre-Deployment Checklist, 2. Clerk Peer Dependency Warnings, 2. Deploy to Vercel, 2. Set Up Monitoring, 3. Database Migrations, 3. Post-Deployment (+31 more)

### Community 119 - "money.ts"
Cohesion: 0.18
Nodes (11): generatePricingPreviewAction(), BillingConfigurationPage(), PricingConfigurationPage(), DraftLivePricingComparison(), PricingVersionHeader(), QuoteCard(), QuotePreviewPanel(), VehicleRateEditor() (+3 more)

### Community 120 - "Summary of Changes - Manual Payment System Implementation"
Cohesion: 0.06
Nodes (34): 1. **Booking Flow Without Stripe** ✅, 2. **Beautiful Success Modal** ✅, 3. **Email System** ✅, 4. **Admin Workflow** ✅, Admin Control, Admin Email (Automatic):, Admin Journey:, Automatic Emails (+26 more)

### Community 121 - "service.ts"
Cohesion: 0.05
Nodes (67): applicationMutationSchema, beginBookingApplication(), beginSchema, cancelSavedBookingApplication(), confirmRenewedApplicationTerms(), customerSchema, finalizeSavedBookingApplication(), getBookingApplication() (+59 more)

### Community 122 - "prisma-repository.ts"
Cohesion: 0.13
Nodes (22): databaseUserHasCapability(), ActiveLegalDocumentRecord, ActivePhase6Record, mapLegalDocument(), PrismaBookingConfigurationRepository, BookingWorkflowConfiguration, CustomerDriverRequirementsConfiguration, InsuranceConfiguration (+14 more)

### Community 123 - "pricing-configuration.ts"
Cohesion: 0.18
Nodes (29): actionError(), attachPricingDraftToReleaseAction(), bulkSchema, createPricingDraftAction(), discardPricingDraftAction(), draftSchema, previewSchema, revalidatePricing() (+21 more)

### Community 124 - "configuration-overview.tsx"
Cohesion: 0.14
Nodes (14): CapabilityGuard(), ConfigurationEmptyState(), ConfigurationHealthSummary(), ConfigurationIssueList(), ConfigurationStatusBadge(), labels, styles, DomainStatusCard() (+6 more)

### Community 125 - "Phase 8E-A — Vercel Blob private-storage design"
Cohesion: 0.06
Nodes (30): 10. Post-upload verification, 11. Read/download architecture, 12. Caching and response headers, 13. Malware scanner recommendation, 14. Recent authentication, 15. Deletion and replacement, 16. Retention and workers, 17. Environment configuration (+22 more)

### Community 126 - "checkout-client.tsx"
Cohesion: 0.27
Nodes (7): BusinessInfo, FooterProps, ButtonGroup(), ButtonGroupSeparator(), ButtonGroupText(), buttonGroupVariants, Separator()

### Community 127 - "service.ts"
Cohesion: 0.10
Nodes (28): CONFIGURATION_HEALTH_STATUS, ConfigurationDomainHealth, ConfigurationHealthDomainInput, ConfigurationHealthFinding, ConfigurationHealthReport, ConfigurationHealthStatus, evaluateConfigurationHealth(), findingFromIssue() (+20 more)

### Community 128 - "booking-applications.ts"
Cohesion: 0.10
Nodes (10): PrivateObjectMetadata, PrivateObjectRead, PrivateObjectReference, ShortLivedAccessGrant, UploadTarget, PrivateDocumentStorage, StorageHealth, GrantState (+2 more)

### Community 129 - "repositories.ts"
Cohesion: 0.12
Nodes (15): DurationInput, DbClient, PrismaPricingContextRepository, ActiveBusinessConfigurationRepository, ActiveReleasePricingRecord, BookingPricingSnapshotRepository, FleetRateSetRepository, LegacyVehicleRateRecord (+7 more)

### Community 130 - "migration.sql"
Cohesion: 0.12
Nodes (25): "CustomerDocument", "CustomerDocument_hold_summary_consistency", "CustomerDocument_scan_summary_consistency", "DocumentDeletionAttempt", "DocumentDeletionAttempt_append_only", "DocumentDeletionRequest", "DocumentDeletionRequest_lifecycle", "DocumentLegalHold" (+17 more)

### Community 131 - "enforceRateLimit"
Cohesion: 0.19
Nodes (10): SubmittedLegalAcknowledgements, LegacyPricingAdapterInput, quoteLegacyPricing(), assertRequiredLegalAcknowledgements(), AuthoritativeBookingInput, createAuthoritativeBooking(), bookingTotalFromSnapshot(), toBookingPricingSnapshotData() (+2 more)

### Community 132 - "Business Configuration Architecture Proposal"
Cohesion: 0.08
Nodes (25): 10. Focused commit sequence, 11. Decisions that still require owner approval, 12. Approval checkpoint, 1. Evidence and constraints, 2. Configuration-domain decision, 3. Proposed Prisma contracts, 4. Server-side configuration health, 5. Cross-domain release validation (+17 more)

### Community 133 - "migration.sql"
Cohesion: 0.18
Nodes (25): "BookingStepRule", "BookingWorkflowConfigVersion", "BusinessConfigurationRelease", "ConfigurationVersion", "ConfirmationConfigVersion", "ConfirmationContentTranslation", "ConfirmationSectionDefinition", "ConfirmationSectionRule" (+17 more)

### Community 134 - "server.ts"
Cohesion: 0.29
Nodes (8): DateFilter(), DateFilterProps, Calendar(), CalendarDayButton(), Label(), Popover(), PopoverContent(), PopoverTrigger()

### Community 135 - "page.tsx"
Cohesion: 0.10
Nodes (19): canReviewBooking(), createBookingReview(), syncCarRatingStats(), BookingReview, BookingReviewSection(), BookingReviewSectionProps, BookingsPage(), Badge() (+11 more)

### Community 136 - "Email Configuration Guide"
Cohesion: 0.08
Nodes (23): 1. **On Booking Creation**, 2. **On Booking Confirmation**, 3. **On Booking Status Changes**, 📚 Additional Resources, 📝 Admin Email Configuration, Booking Actions Location, Common Errors, Common SMTP Providers (+15 more)

### Community 137 - "Quick Start Guide - Manual Payment System"
Cohesion: 0.08
Nodes (23): 📚 Additional Resources, ❓ Common Questions, 📋 Daily Admin Workflow, Email They Receive:, File 1: `app/checkout/[id]/booking-success-modal.tsx`, File 2: `lib/email.tsx`, For You (Admin):, For Your Customers: (+15 more)

### Community 138 - "page.tsx"
Cohesion: 0.11
Nodes (27): BillingRuleForm(), display(), PricingStrategySelector(), strategies, PricingSummaryCard(), UnsavedChangesWarning(), PricingBillingConfiguration, ConfigurationValidationIssue (+19 more)

### Community 139 - "phase8e-nonproduction-integration-guard.test.ts"
Cohesion: 0.13
Nodes (18): decodeClaims(), DocumentIntegrationGuardError, Environment, NonProductionIntegrationContext, reject(), requireNonProductionIntegrationEnvironment(), VercelOidcClaims, crc32() (+10 more)

### Community 140 - "migration.sql"
Cohesion: 0.19
Nodes (22): assert_booking_application_ready(), "BookingApplication", "BookingApplication_lifecycle", "BookingApplication_no_delete", "BookingApplicationCustomerDriver", "BookingApplicationCustomerDriver_lifecycle", "BookingApplicationInsuranceSelection", "BookingApplicationInsuranceSelection_lifecycle" (+14 more)

### Community 141 - "prisma-repository.ts"
Cohesion: 0.17
Nodes (15): changedFields(), BusinessConfigurationDomains, ReleaseAggregate, actorName(), audit(), mapFleetDraft(), mapPricingDraft(), pricingData() (+7 more)

### Community 142 - "Phase 2B — Schema and Migration Evidence"
Cohesion: 0.10
Nodes (19): Compatibility backfill, Database checks/indexes/triggers, Deferred booking-overlap constraint, Disposable validation environment, Enum review classification, Files changed, Final schema differences from Phase 2A, Forward recovery (+11 more)

### Community 143 - "Phase 8C — Private-document schema and migrations"
Cohesion: 0.10
Nodes (19): `20260713110000_add_phase8_upload_foundation`, `20260713110100_add_phase8_document_provenance`, `20260713110200_add_phase8_scan_evidence`, `20260713110300_add_phase8_retention_hold_deletion`, `20260713110400_add_phase8_restricted_capabilities`, `20260713110500_add_phase8_lifecycle_integrity`, Commands and application validation, Constraints and indexes (+11 more)

### Community 144 - "Project Setup Complete! 🎉"
Cohesion: 0.10
Nodes (19): 1. ✅ Prisma Client Generation, 2. ✅ Database Setup, 3. ✅ Environment Configuration, 4. ✅ Demo Mode Implementation, 5. ✅ Development Server, Cars, Commands, Current Status (+11 more)

### Community 145 - "Vercel Server-Side Error Troubleshooting Guide"
Cohesion: 0.10
Nodes (19): 1. **Missing Database URL (MOST LIKELY CAUSE)** ⚠️, 2. **Missing NextAuth Configuration**, 3. **Prisma Client Not Generated**, 4. **Database Connection Issues**, 5. **Middleware Errors**, 🔍 Common Causes of Server-Side Errors on Vercel, 🐛 How to Get Detailed Error Logs, 📝 Most Common Fix (+11 more)

### Community 146 - "policy-editor.tsx"
Cohesion: 0.20
Nodes (11): rule, saveDocumentPolicyDraftAction(), schema, DocumentsConfigurationPage(), DocumentPolicyEditor(), configuration(), KEYS, PrismaDocumentConfigurationRepository (+3 more)

### Community 147 - "Phase 8E-C — Vercel Blob non-production integration"
Cohesion: 0.11
Nodes (18): 10. Public access and quarantine, 11. Deletion and reconciliation, 12. Cleanup and metering, 13. Production-health result, 14. Validation, 15. Files and commits, 16. Phase 8F readiness and production provisioning checklist, 1. Outcome (+10 more)

### Community 148 - "migration.sql"
Cohesion: 0.18
Nodes (17): "BookingLegalAcceptance", "ConfigurationVersion_schedule_phase7_legal_check", enforce_legal_acceptance_config_consistency(), enforce_new_legal_publication(), "LegalAcceptanceConfigVersion", "LegalAcceptanceConfigVersion_phase7_consistency", "LegalAcceptanceTranslation", "LegalAcceptanceTranslation_immutable" (+9 more)

### Community 149 - "Phase 8E-B — Vercel Blob private-storage adapter"
Cohesion: 0.12
Nodes (16): 10. Reconciliation, retry and errors, 11. Production health, 12. Tests and validation, 13. Files changed and commits, 14. Exact non-production provisioning checklist for Phase 8E-C, 1. Delivered scope, 2. Dependency and actual SDK API, 3. Contracts and adapter architecture (+8 more)

### Community 150 - "devDependencies"
Cohesion: 0.12
Nodes (17): eslint, devDependencies, eslint, postcss, tsx, tw-animate-css, @types/node, @types/react (+9 more)

### Community 151 - "Missing /cars Page - FIXED ✅"
Cohesion: 0.12
Nodes (16): 1. `app/cars/page.tsx` (Server Component), 2. `app/cars/cars-client.tsx` (Client Component), Category Filter, Empty State, Features, Files Created, Issue, Missing /cars Page - FIXED ✅ (+8 more)

### Community 152 - "ApplicationMutationInput"
Cohesion: 0.19
Nodes (24): quoteConfiguredVehicleRental(), calculatePricing(), monthDays(), assertSafeInteger(), checkedAdd(), checkedMultiply(), fromBigInt(), majorToMinorUnits() (+16 more)

### Community 153 - "Phase 8F-B — customer and administrator private-document workflow"
Cohesion: 0.12
Nodes (15): Application services and persistence, Checkout persistence and resume, Customer upload and status flow, Document policy administration, Explicit Booking field mapping, Location-semantics decision, Phase 8F-B — customer and administrator private-document workflow, Production provisioning blockers/checklist (+7 more)

### Community 154 - "vehicle-rate-table.tsx"
Cohesion: 0.07
Nodes (35): DocumentReviewQueuePage(), DocumentReviewQueue(), QueueItem, RestrictedRoleManager(), ROLES, LogoutButton(), PageData, CustomerFieldRequirementTable() (+27 more)

### Community 155 - "Delivery phases"
Cohesion: 0.13
Nodes (14): Approval and migration gate, Architecture decision, Business Configuration Implementation Plan, Delivery phases, Phase 10 — Booking orchestration and hardening, Phase 1 — Quality and contract foundation, Phase 2 — Additive database contracts, Phase 3 — Pricing service and compatibility path (+6 more)

### Community 156 - "Phase 5 — Pricing and Billing Administration"
Cohesion: 0.13
Nodes (14): Authorization and audit, Concurrency and disposable PostgreSQL evidence, Draft FleetRateSet behavior, Files and commits, Known limitations and Phase 6 gate, Money input, Phase 5 — Pricing and Billing Administration, Pricing and billing rules (+6 more)

### Community 157 - "bookings.ts"
Cohesion: 0.17
Nodes (12): bookingQuoteSchema, getBookingQuote(), publicQuote(), BookingConfirmationConfiguration, loadBookingConfirmationConfiguration(), localized(), OfflinePaymentInstructionMode, safePreviewError() (+4 more)

### Community 158 - "carousel.tsx"
Cohesion: 0.20
Nodes (13): Carousel(), CarouselApi, CarouselContent(), CarouselContext, CarouselContextProps, CarouselItem(), CarouselNext(), CarouselOptions (+5 more)

### Community 159 - "Current State Audit"
Cohesion: 0.14
Nodes (13): Authentication and authorization, Baseline validation, Current State Audit, Data model, Dead, duplicated and incomplete areas, End-to-end booking flow, Executive assessment, Graphify findings (+5 more)

### Community 160 - "Phase 8D — Provider-neutral private-document lifecycle"
Cohesion: 0.14
Nodes (13): Authorization and read access, Files and Phase 8E readiness, Forward replacement migration, Health and audit, Module architecture, Outcome and scope, Phase 8D — Provider-neutral private-document lifecycle, Replacement and readiness (+5 more)

### Community 161 - "Internationalization (i18n) Implementation Guide"
Cohesion: 0.14
Nodes (13): 🛠️ How Translations Work, ⚠️ Important Notes, Internationalization (i18n) Implementation Guide, 📁 New Directory Structure, 🔄 Next Steps Required, Option 1: Gradual Migration (Recommended), Option 2: Automated Migration Script, 📋 Overview (+5 more)

### Community 162 - "Status Definitions"
Cohesion: 0.15
Nodes (12): 1. **PENDING** (Orange Badge), 2. **CONFIRMED** (Green Badge), 3. **IN_PROGRESS** (Blue Badge), 4. **COMPLETED** (Emerald/Teal Badge), 5. **CANCELLED** (Red Badge), 6. **REJECTED** (Red Badge), Booking Status Explanation, **COMPLETED** (Emerald) (+4 more)

### Community 163 - "Phase 3 — Centralized Pricing Engine"
Cohesion: 0.15
Nodes (12): Architecture and repository boundaries, Duration semantics, Files and tests, Legacy behavior characterized, Limitations and Phase 4 readiness, Mandatory checkpoint and commits, Money, currency, rounding, and overflow, Phase 3 — Centralized Pricing Engine (+4 more)

### Community 164 - "Phase 7 — Legal publication and booking acceptance"
Cohesion: 0.15
Nodes (12): Additive schema migration, Authorization, auditing, health, and concurrency, Booking and historical evidence, Content representation and safety, Draft, translation, and publication lifecycle, Files and commit groups, Known limitations and Phase 8 readiness, Legal Acceptance configuration and release integration (+4 more)

### Community 165 - "migration.sql"
Cohesion: 0.24
Nodes (9): "CustomerDocument", "CustomerDocument_manual_review_transition", "CustomerDocument_review_summary_consistency", "CustomerDocumentReviewDecision", "CustomerDocumentReviewDecision_append_only", "CustomerDocumentReviewDecision_summary_consistency", "DocumentUploadIntent", enforce_customer_document_review_summary() (+1 more)

### Community 166 - "form.tsx"
Cohesion: 0.08
Nodes (26): ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent(), getPayloadConfigFromPayload(), THEMES (+18 more)

### Community 167 - "Phase 4 — Business Configuration Shell and Release Workflow"
Cohesion: 0.17
Nodes (11): Actions and failure behavior, Activation safety, Capability cutover, Final verification, Health and comparison, Phase 4 — Business Configuration Shell and Release Workflow, Phase 5 gate, Repository and service boundaries (+3 more)

### Community 168 - "Next.js 16 Params & Booking Errors - FIXED ✅"
Cohesion: 0.17
Nodes (11): 1. **Dynamic Route Params Error**, 2. **Booking Validation Errors**, File Fixed, Files Fixed, Issues Fixed, Next.js 16 Migration Note, Next.js 16 Params & Booking Errors - FIXED ✅, Root Cause (+3 more)

### Community 169 - "SignOutButton Error - FIXED ✅"
Cohesion: 0.17
Nodes (11): 1. **app/profile/page.tsx**, 2. **app/profile/logout-button.tsx** (NEW), 3. **app/admin/admin-client.tsx**, 4. **app/admin/page.tsx**, Demo Mode Coverage, Files Fixed, Issue, SignOutButton Error - FIXED ✅ (+3 more)

### Community 170 - "duration.ts"
Cohesion: 0.29
Nodes (11): calculateChargeableDuration(), calculateDateOnlyDuration(), calendarDays(), isValidTimeZone(), localDayOrdinal(), pickupBoundaries(), requireValidDate(), startedPeriods() (+3 more)

### Community 171 - "Car Rental App - Production Setup Guide"
Cohesion: 0.17
Nodes (11): 1. Database (Required), 2. Authentication - Google OAuth (Required), 3. Payments - Stripe (Required for bookings), 4. Email - Resend (Optional), 5. App URL, Admin Access, Car Rental App - Production Setup Guide, Environment Variables Summary (+3 more)

### Community 172 - "Phase 8F-A — manual private-document review prerequisites"
Cohesion: 0.18
Nodes (10): Additive migration, Capabilities and roles, Decisions, readiness, and customer status, Manual lifecycle, Phase 8F-A — manual private-document review prerequisites, Product decision and security boundary, Protected access, Queue, workers, monitoring, and health (+2 more)

### Community 173 - "What Needs to Happen 🔄"
Cohesion: 0.18
Nodes (10): Complete i18n Migration Plan, Current Status ✅, Estimated Impact, Recommendation, Step 1: Update next.config.mjs, Step 2: Restructure App Directory, Step 3: Update All Components, Step 4: Create Language Switcher (+2 more)

### Community 174 - "workflow-errors.ts"
Cohesion: 0.35
Nodes (9): actionError(), activateConfigurationReleaseAction(), activationSchema, previewConfigurationReleaseAction(), releaseSchema, validateConfigurationReleaseAction(), ActivationConfirmation(), ReleaseWorkflowActions() (+1 more)

### Community 175 - "Phase 6 — Insurance, driver, customer, and booking workflow"
Cohesion: 0.20
Nodes (9): Additive migration, Administration, Deferred to Phase 7 or later, Health, release, authorization, and audit, Historical rendering and PII, Outcome, Phase 6 — Insurance, driver, customer, and booking workflow, Runtime and booking behavior (+1 more)

### Community 176 - "Option 3: Manually Set User as Admin"
Cohesion: 0.20
Nodes (9): Admin Access Setup Guide, Current Configuration, Option 1: Enable Demo Mode (Easiest), Option 2: Use Clerk Authentication, Option 3: Manually Set User as Admin, Quick Setup Options, Using Prisma Client (Node.js):, Using Prisma Studio (GUI): (+1 more)

### Community 177 - "health.ts"
Cohesion: 0.33
Nodes (7): ProductionHealthPage(), statusClass, check(), getProductionHealthReport(), HealthStatus, ProductionHealthCheck, WORKER_JOBS

### Community 178 - "Architecture Graph Summary"
Cohesion: 0.22
Nodes (8): Architecture Graph Summary, Blast radius, Critical paths, Dependency clusters and coupling, Graph scope and health, High-connectivity modules and nodes, Recommended boundaries, Suggested Graphify queries after implementation starts

### Community 179 - "Phase 1 Foundation Evidence"
Cohesion: 0.22
Nodes (8): Architectural notes and deviations, Dependencies and scripts, Files created, Files modified, Outcome, Phase 1 Foundation Evidence, Phase 2 gate readiness, Verification results

### Community 180 - "Fix Vercel Database URL Issue"
Cohesion: 0.22
Nodes (8): Fix Vercel Database URL Issue, Option 1: Set DATABASE_URL in Vercel (Recommended - Most Reliable), Option 2: Rely on Automatic Normalization (Already Implemented), Problem, Quick Fix Command (If Using Vercel CLI), Solution (Choose One), Verify It's Working, Why This Happens

### Community 181 - "migration.sql"
Cohesion: 0.28
Nodes (8): "BookingCustomerDriverSnapshot", "BookingCustomerDriverSnapshot_provenance", "BookingInsuranceSnapshot", "BookingInsuranceSnapshot_consistency", "ConfigurationVersion", enforce_booking_insurance_snapshot_consistency(), enforce_customer_driver_snapshot_provenance(), "InsuranceConfigVersion"

### Community 182 - "page.tsx"
Cohesion: 0.25
Nodes (8): GET(), isAuthorized(), POST(), cancelExpiredBookings(), completeFinishedBookings(), DbClient, formatDateForLocale(), normalizeBookingLocale()

### Community 183 - "Open Questions Requiring Client or Technical Approval"
Cohesion: 0.29
Nodes (6): Identity documents, Open Questions Requiring Client or Technical Approval, Payment and operations, Pricing and rental time, Terms, privacy and customer eligibility, Vollkasko

### Community 184 - "MIGRATION_NOTES.md"
Cohesion: 0.29
Nodes (6): Immutability and recovery, Migration History Notes, Phase 2B additive schema migrations (2026-07-12), Phase 3 compatibility pricing snapshots (2026-07-12), Phase 8F-A manual-review evidence (2026-07-13), Why this file exists

### Community 185 - "i18n Implementation Status"
Cohesion: 0.33
Nodes (5): ❌ Current Issue, i18n Implementation Status, 📊 Options, 🔧 Solution Needed, ✅ What's Working

### Community 186 - "overrides"
Cohesion: 0.33
Nodes (6): fast-xml-parser, lodash, picomatch@2, postcss, qs, overrides

### Community 187 - "migration.sql"
Cohesion: 0.47
Nodes (5): "DocumentPolicyConfigVersion", "DocumentPolicyRolePermission", "DocumentRequirementTranslation", "DocumentUploadIntent", "DocumentUploadSession"

### Community 188 - "verify-phase8f-review-concurrency.ts"
Cohesion: 0.24
Nodes (12): ConfigurationForDomain, ConfiguredPaymentMethod, configurationDomainSchemas, blockerFromZod(), BusinessConfigurationReleaseValidationContract, domainWarnings(), fieldPath(), FleetRateValidationContract (+4 more)

### Community 189 - "phase8c-schema-migration.test.ts"
Cohesion: 0.33
Nodes (4): migrationPaths, migrations, root, schema

### Community 190 - "package.json"
Cohesion: 0.40
Nodes (4): name, pnpm, private, version

### Community 191 - "migration.sql"
Cohesion: 0.70
Nodes (4): "AccessRole", "Capability", "RoleCapability", "UserAccessRole"

### Community 192 - "migration.sql"
Cohesion: 0.40
Nodes (4): "BookingCustomerDriverSnapshot", "BookingInsuranceSnapshot", "BookingLegalAcceptance", "BookingPricingSnapshot"

### Community 193 - "migration.sql"
Cohesion: 0.60
Nodes (4): assert_booking_application_manual_review(), "BookingApplication", "BookingApplication_manual_review_gate", enforce_booking_application_manual_review()

### Community 194 - "bootstrap-restricted-roles.ts"
Cohesion: 0.40
Nodes (3): capabilities, mappings, roles

### Community 195 - "Simplified i18n Implementation - Step by Step"
Cohesion: 0.50
Nodes (3): Current Status ✅, Simplified i18n Implementation - Step by Step, What We Need to Do Next

### Community 196 - "migration.sql"
Cohesion: 0.67
Nodes (3): "DocumentDeletionAttempt", "DocumentDeletionRequest", "DocumentLegalHold"

### Community 198 - "reauth-action.ts"
Cohesion: 0.29
Nodes (7): Empty(), EmptyContent(), EmptyDescription(), EmptyHeader(), EmptyMedia(), emptyMediaVariants, EmptyTitle()

### Community 211 - "prisma"
Cohesion: 0.27
Nodes (7): DocumentReviewPage(), loadReviewPage(), DocumentReviewClient(), REASONS, ReauthenticatePanel(), reauthenticatePrivateDocumentAccess(), safeReturnPath()

### Community 244 - "demo-banner.tsx"
Cohesion: 0.18
Nodes (6): DrawerContent(), DrawerDescription(), DrawerFooter(), DrawerHeader(), DrawerOverlay(), DrawerTitle()

### Community 245 - "eslint"
Cohesion: 0.40
Nodes (4): Booking-confirmation and payment-instruction audit, Decision, Explicit exclusions, Supported payment instructions

## Knowledge Gaps
- **1138 isolated node(s):** `AdminUser`, `AdminCar`, `AdminBooking`, `AdminManualReservation`, `AdminReview` (+1133 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **80 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 5` to `Community 1`, `Community 3`, `Community 4`, `server.ts`, `page.tsx`, `form.tsx`, `reauth-action.ts`, `Community 10`, `Community 11`, `Community 13`, `Community 15`, `Community 17`, `Community 20`, `demo-banner.tsx`, `Community 24`, `vehicle-rate-table.tsx`, `carousel.tsx`, `checkout-client.tsx`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 47` to `@radix-ui/react-tabs`, `@radix-ui/react-toast`, `server-only`, `Community 22`, `tailwindcss-animate`, `@vercel/analytics`, `@vercel/blob`, `form.tsx`, `Community 48`, `Community 49`, `Community 50`, `Community 55`, `Community 56`, `Community 57`, `Community 59`, `Community 61`, `package.json`, `Community 63`, `Community 64`, `Community 65`, `Community 68`, `Community 69`, `Community 70`, `Community 71`, `Community 73`, `input-otp`, `Community 76`, `Community 77`, `Community 78`, `Community 79`, `Community 80`, `Community 81`, `Community 82`, `Community 83`, `Community 84`, `Community 85`, `Community 86`, `Community 88`, `Community 89`, `Community 90`, `Community 91`, `Community 92`, `Community 94`, `Community 95`, `Community 96`, `Community 97`, `Community 98`, `Community 99`, `Community 101`, `Community 103`, `Community 104`, `Community 105`, `service.ts`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `@prisma/client` connect `service.ts` to `enforceRateLimit`, `Community 47`, `Community 18`, `policy-editor.tsx`, `Community 28`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `AdminUser`, `AdminCar`, `AdminBooking` to the rest of the system?**
  _1138 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0977891156462585 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.1038961038961039 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.13813813813813813 - nodes in this community are weakly interconnected._