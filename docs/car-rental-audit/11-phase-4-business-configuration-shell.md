# Phase 4 — Business Configuration Shell and Release Workflow

Completion date: 2026-07-12. Scope: Business Configuration admin shell and overview, persisted capability enforcement for this area only, repository/service boundaries, configuration health, release validation and preview, explicit serialized activation, append-only audit events, honest section placeholders, tests, and disposable PostgreSQL verification. No Phase 5 domain editors, fleet-rate mutation, pricing controls, customer-flow change, production deployment, or shared-database operation was performed.

## Routes and UI boundary

The new server-rendered boundary is `/[locale]/admin/business-configuration`:

- the root redirects to `/overview`;
- Overview renders release state, overall health, domain findings, fleet coverage, legal readiness, draft/live comparison, workflow actions, and recent audit events;
- Pricing, Billing Rules, Insurance, Driver Requirements, Customer Information, Booking Flow, Documents, Payments, Legal, Confirmations, and Advanced are separate capability-protected routes;
- section pages are explicit placeholders for later phases, without fabricated forms or controls;
- Pricing and Billing Rules may show existing read-only fleet coverage evidence, but cannot edit rates;
- secrets and infrastructure remain outside this boundary and no System Settings behavior was added.

Reusable components live in `components/business-configuration/` and cover status badges, issue lists, domain cards, release summaries, draft/live comparisons, fleet coverage, audit history, empty states, capability guards, health summaries, activation confirmation, and release workflow actions. The existing admin navigation only gains a link to the new boundary; the existing admin dashboard is otherwise unchanged.

## Capability cutover

`PrismaCapabilityRepository` loads the active user's persisted role/capability assignments. Server helpers re-query the authenticated principal, evaluate one or more named capabilities through the existing Phase 1 capability contract, and return safe denials. Existing legacy `ADMIN` users retain the approved all-capabilities compatibility mapping.

The cutover is deliberately limited to Business Configuration layout, section routes, and workflow actions. It does not change authorization for bookings, fleet administration, users, company settings, or other existing admin areas. Denied Business Configuration actions make a best-effort append-only audit write without leaking internal details.

## Repository and service boundaries

Prisma-independent interfaces and DTOs are defined in `lib/business-configuration/repositories.ts`. The Prisma adapter owns release/domain/fleet/legal/audit queries and deep mapping to the application aggregate; Prisma types do not leak into health, validation, preview, or UI code.

`BusinessConfigurationWorkflowService` owns:

1. current active and latest draft release loading;
2. configuration, fleet, and legal health projection;
3. exact aggregate validation;
4. before/after preview generation;
5. activation and prior-release supersession;
6. audit-event loading and recording.

Stable workflow errors distinguish missing, incomplete, invalid, stale, conflicting, unauthorized, optimistic-lock, and audit failures while actions expose only safe messages.

## Health and comparison

Health is produced on the server from persisted release evidence. It reports domain lifecycle/version readiness, fleet-rate completeness for bookable vehicles, legal publication/locale evidence, validation blockers/warnings, and whether a draft differs from live. A completely empty system reports **Not configured**; otherwise blockers take precedence, then draft changes, then warnings, then ready.

Draft/live comparison uses exact version and rate-set identifiers rather than inferring changes from timestamps. Historical active-only installations do not become stale merely because no draft exists.

## Validation and preview

Validation is not a client-side approval. The service opens a transaction, rechecks capability, locks the draft release, verifies its optimistic revision and lifecycle, loads the exact nine domains, fleet-rate set, bookable fleet, and required legal evidence, and runs the Phase 1 aggregate validator plus fleet and staleness rules. The persisted validation metadata records the release revision and exact dependency versions used.

Preview is read-only. It reports changed domains, operational impact statements, fleet coverage, legal evidence, blockers and warnings, and optional server-generated pricing examples through the Phase 3 pricing engine. A preview never saves, validates, or activates a release.

## Activation safety

Activation requires the exact confirmation phrase and explicit warning acknowledgement when warnings remain. Inside one transaction the service:

1. rechecks the current principal and activation capability;
2. obtains a database transaction advisory lock for the global activation boundary;
3. locks the candidate release and checks its optimistic revision;
4. confirms its recorded base active release is still current;
5. reloads and freshly validates every exact dependency;
6. rejects blockers and unacknowledged warnings;
7. transitions referenced draft/validated domain versions and the fleet-rate set to released state;
8. supersedes the prior active release and activates the candidate;
9. writes the activation audit event in the same transaction.

Database constraints and triggers from Phase 2B remain the final immutability and single-active-release backstop. Concurrent activation attempts for different drafts serialize: only the draft based on the still-current active release can win. Activated versions and prior releases are not edited in place, and historical `BookingPricingSnapshot` rows are untouched.

## Actions and failure behavior

Server actions validate inputs with Zod, enforce their named capability, call the workflow service, invalidate only the Business Configuration pages, and return safe structured outcomes. Validation does not imply activation. Preview is side-effect free. Activation conflicts, stale revisions, missing dependencies, blockers, warning acknowledgement, authorization failures, and audit failures are stable typed outcomes.

## Tests and disposable database evidence

Unit tests cover health precedence, persisted capability decisions, repository-independent workflows, incomplete and valid releases, blocker/warning handling, stale revisions, preview comparisons, exact confirmation behavior, UI status projections, and placeholder/capability boundaries.

The Phase 4 representative fixture and integration script ran against a fresh localhost-only PostgreSQL 16 database with synthetic `.invalid` identities. The complete 19-migration chain was replayed before the fixture. Verification covered:

- manager capability persistence and a no-capability principal;
- draft-only overview and unauthorized validation;
- complete validation without activation;
- warning acknowledgement and blocker rejection;
- stale revision and unauthorized activation rejection;
- valid activation and Phase 3 ACTIVE-release pricing resolution;
- prior-release supersession;
- two concurrent distinct-draft activations with exactly one winner;
- exactly one ACTIVE release after concurrency;
- activation audit persistence;
- byte-for-byte unchanged historical pricing-snapshot evidence.

The successful integration result ended with active synthetic release `p4-release-3`, release number 3, four relevant audit events, ACTIVE-release runtime pricing, and unchanged historical snapshot evidence. No repository-configured database URL was used.

## Final verification

| Command or check | Result |
|---|---|
| Complete 19-migration replay on disposable PostgreSQL 16 | Pass |
| Phase 4 representative fixture | Pass |
| Phase 4 workflow/concurrency integration | Pass; one concurrent activation winner |
| `pnpm exec prisma validate` | Pass |
| `pnpm exec prisma generate` | Pass |
| `pnpm typecheck` | Pass |
| `pnpm test:run` | Pass; 15 files, 97 tests |
| Scoped ESLint for all Phase 4 TypeScript/TSX | Pass; zero errors, six pre-existing image warnings |
| `pnpm build` | Pass; 44 routes/pages |
| `git diff --check` | Pass |
| Unauthenticated browser route check | Pass; redirect occurred before shell render |

The browser check then reached Google OAuth's expected `redirect_uri_mismatch` because the disposable dev server used port 3001 while the local OAuth client is configured for another callback. This prevented an authenticated visual session but did not bypass or crash the application authorization boundary.

The build retains the known stale `baseline-browser-mapping` warning and Next.js workspace-root inference warning caused by another home-directory lockfile. The existing `admin-client.tsx` image lint warnings are unrelated to Phase 4 behavior.

## Phase 5 gate

Phase 4 stops with infrastructure and honest placeholders. Phase 5 still requires explicit approval and product decisions for editable daily/weekly/fixed-month rates, rate-set drafting, supported duration strategies, example scenarios, fleet bulk-edit behavior, warning policy, and release-preview presentation. Saving any future editor draft must remain distinct from validation and activation.
