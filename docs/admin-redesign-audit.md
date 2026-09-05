# Admin redesign: configuration audit and owner information architecture

## Audit scope and conclusions

The previous `/admin` mixed operational work, reporting, team access, car CRUD, booking actions, review moderation, and a 25-field company form in one client component. A second navigation tree under `/admin/business-configuration/*` exposed the versioned release architecture directly. Restricted documents and production health already had separate authorization boundaries.

There is no `Business` or tenant model in the current Prisma schema. Cars, bookings, users, `CompanySettings`, configuration releases, and rates are global to this deployment. This redesign preserves that security model but cannot claim tenant isolation that the backend does not implement.

## Owner-facing information architecture

Every normal destination now leads with one business question. Required change summaries, raw version numbers, release identifiers, validation codes, provenance hashes, and technical storage language are removed from daily pages. Owners see “unpublished changes,” “check for problems,” “add to next update,” and “publish changes”; exact history and readiness evidence remain behind More or an Advanced disclosure.

The publishing confirmation no longer requires typing an internal phrase. A single explicit confirmation preserves the safety boundary while reducing avoidable work. Unsupported location and opening-hours controls are omitted instead of being explained in the interface.

| Priority | Section | Purpose |
| --- | --- | --- |
| Everyday | Dashboard | Attention, upcoming bookings, fleet state, document review count, setup progress, and quick actions |
| Everyday | Bookings | Booking operations; booking journey, duration/billing, and driver rules live under Booking Settings |
| Everyday | Cars | Car CRUD, availability, pricing rules, and insurance availability |
| Everyday | Customers | Customer records and the information collected during booking |
| Role-gated | Documents | Restricted review queue and required-document policy |
| Everyday | Payments | Bank details, checkout deposit/security-hold defaults, methods, and instructions |
| Occasional | Business Settings | Business profile, customer messages, legal documents, and links to policy areas |
| Occasional | Team | Admin access overview; restricted document access stays separate |
| More | Occasional work | Publish saved changes, reports, reviews, and business readiness checks |

Locations and opening hours are not shown because the current schema has only per-booking free-text `Booking.location`, not a reusable location or schedule. The owner interface does not present controls that cannot actually save a business choice.

## Configuration inventory and destination mapping

| Current setting(s) | Previous route | Canonical storage | Runtime/business meaning | New owner location | Level / visibility |
| --- | --- | --- | --- | --- | --- |
| Company name, email, phone, street, city, state, postal code, country | `/admin` → Settings | `CompanySettings` | Customer-facing identity and contact information; read by business-info, email, footer/contact/legal pages | `/admin/settings/profile` | Business default; normal admin |
| Currency and currency symbol | `/admin` → Settings | `CompanySettings` (compatibility/default source); active release also carries currency | Display/default currency and starting currency for new pricing drafts | `/admin/settings/profile` → Currency display | Business default; optional disclosure |
| Managing director, commercial register, register court, VAT ID, responsible person | `/admin` → Settings | `CompanySettings` | Imprint/legal company facts | Kept in storage and old action; owner editing intentionally deferred until the legal profile can be separated cleanly | Advanced gap; normal admin data |
| Support email, owner/admin email | `/admin` → Settings | `CompanySettings` | Customer reply address and recipients for booking emails | `/admin/settings/notifications` | Business default; normal admin |
| Bank name, account holder, account number, SWIFT/BIC, IBAN | `/admin` → Settings | `CompanySettings` | Checkout and confirmation bank-transfer instructions | `/admin/payments` | Business default; normal admin |
| Deposit percentage, refundable guarantee/security-hold percentage | `/admin` → Settings | `CompanySettings` | Existing booking checkout and email calculations | `/admin/payments` | Business default; normal admin |
| Compatibility tax rate and tax-included flag | `/admin` → Settings | `CompanySettings`; release pricing uses `PricingBillingConfigVersion` instead | Legacy quote fallback only when no active release is resolved | Removed from normal editing to avoid conflicting tax controls; visible through existing data/audit only | Advanced compatibility |
| Car name, localized name/subtitle/description, category, images, year, gearbox, seats, fuel, acceleration | `/admin` → Cars | `Car` | Fleet catalogue details | `/admin?section=cars` | Entity-specific; normal admin |
| `Car.price` | `/admin` → Cars | `Car.price` | Compatibility daily price and source for copying into a rate draft | Cars for the current car price; `/admin/cars/pricing` clearly distinguishes current and new price | Entity-specific compatibility; normal admin |
| Car status | `/admin` → Cars | `Car.status` | Available, rented, maintenance, or limited-stock state | `/admin?section=cars`; dashboard summary | Entity-specific; normal admin |
| Blocked dates and manual reservations | `/admin` → Bookings | `BlockedDate` | Car unavailability and staff-entered reservations | `/admin?section=bookings` | Entity-specific; normal admin |
| Business timezone, release currency, supported locales | `/admin/business-configuration/advanced` | `GeneralRentalConfigVersion` | Date calculations, release currency, and supported customer languages | `/admin/advanced/configuration` | Business default; Advanced; currently read-only |
| Weekly/monthly pricing enabled, mixed-duration strategy, fixed rental-month definition | `/admin/business-configuration/pricing` and `/billing` | `PricingBillingConfigVersion` | Selects allowable rate periods and pricing strategy | `/admin/cars/pricing` and `/admin/bookings/settings/duration` | Business default; normal admin |
| Billable-day method, grace period, minimum rental minutes, minimum charge days | `/admin/business-configuration/billing` | `PricingBillingConfigVersion` | Turns pickup/return times into chargeable rental units | `/admin/bookings/settings/duration` | Business default; normal admin |
| Price tax treatment and tax rate basis points | `/admin/business-configuration/billing` | `PricingBillingConfigVersion` | Authoritative release-backed quote tax | `/admin/bookings/settings/duration` | Business default; normal admin |
| Daily, weekly, monthly car rates and enabled flags | `/admin/business-configuration/pricing` | `FleetRateSet` + `VehicleRentalRate` | Authoritative per-car release prices | `/admin/cars/pricing` | Car-specific value in a business release; normal admin |
| Insurance enabled/required mode, customer name/description, price per day, tax treatment, selection behavior | `/admin/business-configuration/insurance` | `InsuranceConfigVersion` + translations | Customer insurance offer and exact price | `/admin/cars/rental-rules` | Business default; normal admin with insurance capability |
| Insurance vehicle availability scope and selected cars | same | `InsuranceVehicleAvailability` | Cars for which insurance is offered | `/admin/cars/rental-rules` | Car-specific override; normal admin with insurance capability |
| Minimum/maximum driver age, licence-held months, licence validity through return, allowed licence countries | `/admin/business-configuration/driver-requirements` | `CustomerDriverConfigVersion` | Driver eligibility at pickup/return | `/admin/bookings/driver-rules` | Business default; normal admin with driver-rules capability |
| Required/optional/hidden customer and licence fields | `/admin/business-configuration/customer-information` | `CustomerFieldRule` | Information collected and validation evidence required | `/admin/customers/settings` | Business default; normal admin with customer-fields capability |
| Booking steps, required/optional/hidden mode, display order | `/admin/business-configuration/booking-flow` | `BookingStepRule` | Customer booking journey | `/admin/bookings/settings/flow` | Business default; normal admin with booking-workflow capability |
| Identity-document choice, retention days, confirmation reminder | `/admin/business-configuration/documents` | `DocumentPolicyConfigVersion` | Required identity route and document lifecycle | `/admin/documents/settings` | Business default; explicit restricted document role |
| Document type, requirement mode, file count, sides, upload stage, localized instructions | same | `DocumentRequirementRule` + translation | Exactly what customers upload | `/admin/documents/settings` | Business default; explicit restricted document role |
| Document role permissions | same / `/admin/documents/security` | `DocumentPolicyRolePermission`, access roles, capability assignments | Who may view/download/delete/hold private documents | `/admin/documents/security`; linked only within restricted document operations | Advanced security; explicit capability only |
| Default payment method, enabled methods, confirmation mode, deposit type/value, remaining-balance rule | `/admin/business-configuration/payments` | `PaymentConfigVersion` + `PaymentMethodRule` | Release-backed booking-application payment choices | `/admin/payments` | Business default; payments capability |
| Localized payment instructions | same | `PaymentInstructionTranslation` | Customer instructions in booking confirmation | `/admin/payments` | Business default; payments capability |
| Enabled confirmation sections, localized heading and safe content | `/admin/business-configuration/confirmations` | `ConfirmationConfigVersion`, section rules, translations | Content included in customer confirmations | `/admin/settings/notifications` | Business default; confirmations capability |
| Terms/privacy versions, acceptance requirements, presentation, snapshots, enforcement, locales, confirmation display | `/admin/business-configuration/legal` | `LegalAcceptanceConfigVersion`, immutable legal versions/translations | Exact legal content and acknowledgement provenance | `/admin/settings/legal` | Business default; legal edit/publish capabilities |
| Release name, version IDs, validation, activation, change summaries, draft/live comparison, audit | `/admin/business-configuration/overview` | `BusinessConfigurationRelease`, `ConfigurationVersion`, `AuditEvent` | Coordinated publication and evidence | `/admin/advanced/configuration` | Advanced; validate/activate/audit capabilities |
| Worker/cron heartbeat, environment/storage readiness, deployment/recovery evidence | `/admin/health` | Operational evidence/environment services | Production readiness and remediation evidence | `/admin/advanced` → System health | Advanced; admin only |

## Routes changed

- Added `/admin/settings`, `/admin/settings/profile`, `/admin/settings/notifications`, `/admin/settings/legal`.
- Added `/admin/bookings/settings`, `/admin/bookings/settings/flow`, `/admin/bookings/settings/duration`, `/admin/bookings/driver-rules`.
- Added `/admin/cars/pricing`, `/admin/cars/rental-rules`, `/admin/customers/settings`, `/admin/documents/settings`, `/admin/payments`, `/admin/team`, `/admin/advanced`, and `/admin/advanced/configuration`.
- `/admin` now accepts owner navigation sections and shows attention, setup, fleet, and upcoming-booking information.
- Every known `/admin/business-configuration/*` route redirects to its owner-facing destination; unknown sections fall back to `/admin/settings`.
- `/admin/health`, document review, and document security remain available but are no longer part of the everyday setup path.

## Defaults, overrides, and compatibility

The current backend supports business defaults plus per-car rates and per-car insurance availability. It does not implement category-level overrides, per-car deposits, mileage limits, fuel policies, minimum driver age by car, or reusable availability rules. The UI therefore does not invent those controls.

`Car.price` remains the compatibility price. `VehicleRentalRate` is the release-backed car price and can be populated from the current car price. The owner UI calls these “Current daily” and “New daily”; release identifiers and compatibility evidence remain under Advanced.

## Backend changes

No schema migration was required. `buildOwnerSetupProgress` is a read-only view-model adapter over `CompanySettings`, car counts, fleet coverage, and configuration health. Section-specific server actions update subsets of the existing `CompanySettings` row and retain `AdminAuditLog` writes and cache revalidation.
