# Architecture Graph Summary

## Graph scope and health

Graphify 0.9.13 produced a local AST/SQL graph with 1,009 nodes, 1,968 relationships and 118 communities at commit `2d827f6f`. No import cycles were detected. Full semantic extraction could not run without an external LLM API key, so 19 documents and 11 images were inspected outside the graph; translation and backup JSON yielded no graph nodes. Community names remain numeric because clustering used `--no-label`.

Generated artifacts: `graphify-out/graph.html`, `GRAPH_REPORT.md`, `graph.json`, `.graphify_analysis.json`, label metadata, `manifest.json`, and cache index. The graph was successfully rendered and JSON/report outputs were parsed/read. It should be retained as project documentation, not automatically committed by this audit.

## High-connectivity modules and nodes

| Node | Graph signal | Architectural meaning |
|---|---:|---|
| `cn()` | 278 edges | Shared UI class utility; high count is broad UI usage, not business risk. |
| `requireAdmin()` | 25 | Central security boundary for admin Server Actions/handlers. |
| `formatCents()` | 22 | Cross-cutting presentation boundary for monetary values. |
| `runBookingLifecycleMaintenance()` | 19 | Widely invoked operational side effect coupled to reads/actions. |
| `getCurrentUser()` | 18 | Authentication-to-database boundary for protected pages/actions. |
| `AdminDashboard()` | 14 | Monolithic admin UI receiving many domains and DTOs. |
| `createBooking()` | 13 | Core booking orchestration and highest-risk feature insertion point. |

Community 0 contains admin actions, manual reservations and statistics. Community 8 contains `createBooking`, date formatting/locale normalization, checkout, day calculation and email data—evidence that pricing, UI and notifications are tightly coupled. Community 21 groups database URL/maintenance scripts. Community 23 contains application error classes, but booking actions primarily return strings rather than consistently using them.

## Critical paths

`Car.price` → server-rendered car DTO → `CheckoutClient` display calculation → `createBookingSchema` → `createBooking()` → `isCarAvailable()` → Prisma serializable transaction/row lock → `Booking` snapshots → email functions → booking/admin pages.

`getCurrentUser()`/`requireAuth()` → booking ownership boundary. `requireAdmin()` → car/settings/user/booking/manual-reservation mutations and upload signing. `CompanySettings` → tax/deposit/guarantee → duplicated checkout and server totals → confirmation email/modal.

Future required path: one active atomic release manifest → exact domain versions + immutable fleet-rate set + published localized legal documents → server validation/pricing → same booking transaction and complete snapshots → authorized admin/customer projections. These concerns should not be added directly into the already large checkout/action/admin files without boundaries.

## Dependency clusters and coupling

- Catalogue cluster: Prisma `Car`, server pages, card/detail components, filters, saved cars and review stats.
- Booking cluster: checkout, booking actions, availability, lifecycle maintenance, money formatting, email and Booking/CompanySettings.
- Admin cluster: one large Client Component plus actions spanning cars, users, bookings, reviews, settings and blocked/manual reservations.
- Auth cluster: NextAuth configuration, edge proxy, page redirects and server guards.
- Infrastructure cluster: Prisma connection/URL normalization, email providers, dormant Stripe, Cloudinary car images.

No graph-level cycles exist, but logical duplication is present: client/server pricing; repeated localized DTO mapping; production and demo stores; manual reservations encoded in blocked-date reasons. `runBookingLifecycleMaintenance()` invoked from multiple read paths also couples page latency and mutation side effects.

## Blast radius

Pricing changes touch schema/migrations, validation, car actions/admin form, car list/detail/card DTOs, checkout display, booking action, booking/admin screens, emails, seeds/backups, and future tests. This is the broadest functional blast radius.

Insurance touches pricing, booking snapshots, checkout, admin, email/confirmation and translations. Terms touches legal content, checkout, validation, booking evidence, admin and confirmation. Documents introduce an entirely new security/infrastructure boundary and must not reuse public car-image abstractions without a private-storage redesign. Customer fields affect auth-prefill assumptions, booking schema/action, admin, confirmations and GDPR policy.

## Recommended boundaries

- Independently drafted configuration domains with one atomic `BusinessConfigurationRelease`; do not use one catch-all settings version and do not activate domains independently.
- Immutable `FleetRateSetVersion`/vehicle-rate rows so the pricing source used by a booking is version-addressable; keep `Car.price` only as a staged compatibility mirror.
- Combine driver and customer-field requirements because eligibility rules force field requirements; keep legal publications separate from the versioned legal acceptance policy.
- `lib/pricing`: pure integer-cent engine with a versioned policy and explicit duration breakdown.
- `lib/business-configuration`: draft validation, cross-domain compatibility, health, impact diff, and atomic activation.
- `lib/booking`: orchestration/DTOs; keep persistence, availability and outbox creation explicit.
- `lib/terms`: publish/resolve/version/hash applicable localized documents.
- `lib/documents` and `lib/storage`: provider-neutral private object operations, validation/scanning, access policy and retention.
- Typed `BookingCustomerSnapshot`/schema rather than relying on mutable OAuth user fields.
- Booking notification/outbox boundary so email failure is observable/retryable and cannot alter persistence.
- Split `AdminDashboard` into car, booking, customer/document, settings and review feature modules.
- PostgreSQL overlap invariant (exclusion constraint/range) in addition to application locks if deployment supports it.

## Suggested Graphify queries after implementation starts

- `graphify affected "createBooking" --depth 3`
- `graphify query "Where is Car.price read, transformed, or displayed?"`
- `graphify query "Which admin paths expose Booking fields?"`
- `graphify path "CheckoutClient" "sendManualPaymentEmail"`
- Rebuild with `graphify update .`, then compare node/edge/community changes after each phase.
