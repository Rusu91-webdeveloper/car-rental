# Current State Audit

Audit date: 2026-07-12. Scope: repository at commit `2d827f6f`; no application behavior was changed.

## Executive assessment

The application is a functional early production/MVP car-rental system. Catalogue, authentication, availability checks, server-authoritative daily pricing, booking persistence, manual payment instructions, email notifications, reviews, saved cars, and a broad admin console exist. The confirmed customer-data, consent, contract-versioning, Vollkasko, private-document, and duration-rate requirements do not.

The existing booking core is stronger than the surrounding product completeness: it revalidates input on the server, recalculates price from the database, locks the car row, repeats availability inside a serializable transaction, and snapshots the daily rate and total. Its largest risks are an incomplete customer/consent model, ambiguous billable-day/timezone rules, no database-level exclusion constraint for overlapping ranges, duplicated client/server price arithmetic, emails outside the booking transaction, and disabled/incomplete payment infrastructure.

## Runtime and architecture

- Next.js 16.0.10 App Router, React/React DOM 19.2.0, TypeScript 5, Node 22.16.0.
- pnpm 9.12.3 with `pnpm-lock.yaml`. Scripts: `dev`, `build`, `start`, `lint`, Prisma generate/deploy/dev/push/seed/backup utilities. No `type-check` or `test` script.
- PostgreSQL through Prisma 5.22.0. `lib/db.ts` provides the shared client; `scripts/with-db-url.ts` normalizes `CAR_DATABASE_URL`/`DATABASE_URL` for Prisma commands.
- next-intl 4.6.1 with `de` and `en`; locale-prefixed routes and translation JSON in `messages/`.
- Tailwind CSS 4 and Radix-derived UI components. Server pages fetch data; interactive screens are Client Components. Server Actions implement most writes.
- NextAuth 5 beta with Google OAuth and Prisma adapter. JWT sessions are hydrated with database role/activity state at sign-in; server helpers re-query active users.
- Deployment targets Next.js/Vercel conventions. No `vercel.json`, container, infrastructure-as-code, or CI workflow is present. `next.config.mjs` allows 8 MB Server Action bodies and unoptimized remote images.

## Routes and component boundaries

Public localized pages: home, cars, car detail, about, contact, help, AGB, privacy, imprint, withdrawal, and auth/demo pages. Protected pages: checkout, bookings, profile, saved cars. Admin is protected in the page and every mutating action by `requireAdmin()`.

Route Handlers:

- `app/api/auth/[...nextauth]/route.ts`: NextAuth handlers.
- `app/api/cloudinary/signature/route.ts`: admin-authenticated signed car-image upload parameters.
- `app/api/cron/cancel-expired-bookings/route.ts`: booking lifecycle maintenance; endpoint authorization/configuration must be deployment-reviewed.
- `app/api/health/route.ts`: health response.
- `app/api/webhooks/stripe/route.ts`: returns HTTP 410; former Stripe handling remains commented.

Server Actions are in `app/actions/{admin,bookings,cars,reviews,saved,settings}.ts`. The large `admin-client.tsx` is a tightly coupled multi-domain Client Component. Checkout logic is concentrated in `checkout-client.tsx`; database/API logic is in `createBooking()`.

## Data model

`User` owns bookings, reviews and saved cars, and may be an administrator. `Car` has localized descriptive fields, one integer `price` documented as daily cents, status, specifications, soft deletion, bookings, reviews and blocked dates. `Booking` stores user/car, UTC timestamps, location, daily-rate snapshot, total days/price, deposit/guarantee, workflow/payment state, manual transfer identifiers, locale, and dormant Stripe identifiers. Other models are `Payment`, `BlockedDate`, `SavedCar`, `Review`, `AdminAuditLog`, NextAuth tables, and singleton `CompanySettings`.

Important constraints include unique email, car slug, booking/transfer identifiers, saved-car pair and review-per-booking. `@@unique([carId,pickupDate,dropoffDate])` prevents only exact duplicate date triples; it does not prevent arbitrary overlapping bookings. Application locking and serializable isolation currently provide the concurrency boundary. There are no models for customer rental identity, extras, insurance, terms versions/acceptance, privacy consent, or documents.

Migration history contains legacy Clerk-to-NextAuth evolution and duplicate-looking NextAuth migration names. The schema is the source of truth for this audit, but a clean-database migration replay should be tested before feature migrations; some early SQL references legacy `clerkId` and later SQL conditionally corrects it.

## Authentication and authorization

Google OAuth is the only active provider. Admin role is stored in the database and auto-promoted at sign-in when email matches configured admin emails. `getCurrentUser()` filters inactive users; `requireAuth()` and `requireAdmin()` protect server mutations. Proxy middleware treats API routes as self-authorizing and only performs a coarse session check for pages. Admin page performs its own role redirect.

Risks: JWT role/activity claims can be stale, although server helpers re-query for sensitive operations; fallback admin email is a hard-coded placeholder; the edge auth configuration differs from full auth and only establishes authentication; and authorization must be added to every future document access endpoint. No fine-grained document permissions exist.

## End-to-end booking flow

1. Vehicle selection: home/cars/car detail query non-deleted cars and pass `Car.price` to UI. `BookNowButton` carries dates/location to checkout.
2. Rental dates: `CheckoutClient` reads URL dates, uses local `Date`, calendar and time inputs, and loads unavailable ranges through `getCarAvailability()`.
3. Availability: `lib/availability.ts` checks half-open overlaps against active bookings and blocked dates. UI blocks calendar days; the Server Action checks again before and inside its transaction.
4. Customer details: checkout requires an authenticated Google user but captures only account name/email indirectly. No first/last name, phone, DOB/age, country, licence, or customer address fields are submitted.
5. Extras/insurance: none. Marketing/FAQ text says insurance is included, which conflicts with the requested optional paid Vollkasko.
6. Price: both client and server calculate `ceil(milliseconds / 24h)`, minimum one day; subtotal is daily price times days. Server adds configured tax (or an unexplained 10% fallback when configured rate is zero), then deposit/guarantee percentages. Browser total is display-only and is not trusted by persistence.
7. Terms/privacy: localized static AGB and Datenschutz pages exist, but checkout has no required checkbox and no acceptance/consent persistence.
8. Documents: no customer upload flow or storage model. Cloudinary signing exists only for admin car images and accepts a caller-provided folder after admin authorization.
9. Persistence: `createBooking()` uses a serializable transaction, locks the car row, repeats availability, and snapshots rate/days/total. It has no customer/insurance/terms/document fields.
10. Side effects: customer and admin emails run after commit. Email failure is logged but booking remains successful. Revalidation follows. The success modal displays payment instructions; bookings/admin lists expose core booking data.

Failure paths include Zod errors, unauthenticated user, missing/deleted/unavailable car, overlap/blocked date, serialization/database failure, and post-commit email failure. There is no compensating workflow for notification failure, and no upload workflow whose partial failures can be recovered.

## Pricing and date handling

Only `Car.price` and `Booking.pricePerDay` exist. Admin creation/editing controls one per-day price. There are no weekly/monthly rates or duration discounts and no centralized pricing service. The same arithmetic is duplicated in checkout and the Server Action. The server is authoritative, which must be preserved.

Dates are serialized as ISO/UTC into PostgreSQL, but inputs and billable-day arithmetic use the browser/server local timezone and absolute elapsed milliseconds. `Math.ceil(diff/24h)` can behave unexpectedly around daylight-saving transitions. UI unavailability expands ranges by local calendar dates and treats the end date inclusively, while database overlap uses half-open intervals; this can over-block return dates. Same-day rental is allowed only when return is later and bills one day. Pickup/return time billing rules remain undefined.

## Integrations, uploads, notifications, payments

- Email supports SMTP or Resend and sends manual-transfer/pay-at-pickup messages plus admin/status/review flows. Confirmation payloads lack required new fields.
- Cloudinary is used for public vehicle imagery. It is unsuitable as currently configured for identity documents because no private delivery type, signed download authorization, retention, MIME/size/signature/malware checks, or document ownership model exists.
- Stripe library/schema remnants exist, but checkout code is commented and webhook returns 410. Active payment methods are bank transfer and pay at pickup. `Payment` records therefore do not represent the active manual flow comprehensively.
- No generic extras model exists. A dedicated immutable insurance snapshot on `Booking` is simpler today; a normalized extras catalogue becomes appropriate only if more extras/configuration are planned.

## Security, privacy and GDPR

Strengths: server validation and price calculation, server-side authorization, soft car deletion, audit logs for admin changes, transaction locking, webhook signature code retained for future use, and secrets referenced only via environment variables.

Gaps: no data minimization/retention/deletion policy; no subject-access/export workflow; no identity-document security design; no consent/terms evidence; no purpose/access audit for highly sensitive documents; broad 8 MB Server Action body limit; possible personal data in logs/emails; manual-reservation customer name/phone encoded into `BlockedDate.reason` JSON rather than a typed model; no rate limiting/abuse controls evident. Privacy consent is not itself a legal basis and must be separated from notice acknowledgement and the documented processing basis.

## Dead, duplicated and incomplete areas

- Stripe checkout/webhook code is disabled but schema/library/config remain.
- `lib/store.ts` and `lib/demo-store.ts` duplicate car/booking shapes and sample data beside Prisma-backed production flows.
- Checkout duplicates billable-day/tax/deposit/guarantee calculation from the server.
- Admin manual reservations misuse blocked-date reason JSON for customer data/price.
- Auth/demo signup pages link to `/terms` and `/privacy`, while actual localized legal routes are `/agb` and `/datenschutz`.
- No damage-reporting workflow, model, upload, history or signature code was found. Legal/email wording mentions damage liability/guarantee release only; this is not a damage-report feature and should not be deleted.

## Graphify findings

Graphify 0.9.13 (isolated `uv tool`, SQL extra enabled) created `graphify-out/graph.json`, `graph.html`, `GRAPH_REPORT.md`, analysis/label metadata, manifest and cache. The local AST graph has 1,009 nodes, 1,968 edges and 118 communities, with no import cycles. Key nodes: `cn()` (UI utility, 278 edges), `requireAdmin()` (25), `formatCents()` (22), `runBookingLifecycleMaintenance()` (19), `getCurrentUser()` (18), `AdminDashboard()` (14), and `createBooking()` (13). Booking/pricing/email functions cluster together (Community 8); admin actions form the largest business cluster (Community 0).

Full semantic extraction was attempted first and found 174 code files, 19 documents and 11 images, but no supported LLM API key was configured. The resulting graph is code/SQL-only; documents and images were inspected directly. Translation/backup JSON produced no nodes. This limitation prevents semantic community naming but not AST dependency analysis.

Decision: retain `graphify-out/` as reviewable project documentation, consistent with Graphify's team guidance; do not add it to `.gitignore` and do not commit it automatically. Local cost/cache policy can be revisited if repository size becomes material.

## Baseline validation

- `pnpm exec tsc --noEmit`: passes.
- `pnpm build`: passes and generates 40 routes/pages. Warnings: stale baseline-browser mapping data and Next.js inferred `/Users/emanuelrusu` as workspace root because of another lockfile.
- `pnpm lint`: fails before linting because `eslint` is not installed/declared.
- Tests: no test command, framework configuration, or test files found.
- `pnpm install --frozen-lockfile`: succeeds and does not change declared dependencies.

