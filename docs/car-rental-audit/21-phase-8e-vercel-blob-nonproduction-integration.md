# Phase 8E-C — Vercel Blob non-production integration

Execution date: 2026-07-13. Status: complete for one isolated synthetic-only non-production integration. Phase 8F has not started.

No production project, production store, real customer system, shared data environment, repository-configured database, identity document, customer file, scanner or public document route was contacted. Prisma schema and migrations are unchanged.

## 1. Outcome

One dedicated Vercel project and one dedicated private Blob store were created and verified end to end with synthetic files:

| Fact                    | Verified value/evidence                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| Project                 | `car-rental-documents-nonprod`                                                                     |
| Team scope              | Authenticated Vercel team used only for this dedicated project                                     |
| Store                   | `car-rental-documents-nonprod`                                                                     |
| Store identity          | Full ID retained only in Vercel Development configuration; safe SHA-256 fingerprint `bed9a370118b` |
| Region                  | `fra1`, confirmed at creation and through `blob get-store`                                         |
| Access                  | Private, confirmed through store metadata and an unauthenticated direct-read denial                |
| Project binding         | Dedicated project, Development environment only                                                    |
| Preview binding         | None; no Preview environment variables exist                                                       |
| Production binding      | None; no Production environment variables exist                                                    |
| Authentication          | Short-lived Vercel project OIDC token plus non-secret `BLOB_STORE_ID`                              |
| Static Blob token       | Absent after OIDC verification                                                                     |
| Production feature      | Disabled                                                                                           |
| Final live object count | Zero through authenticated full-store and strict-prefix listing                                    |

The project was intentionally created without linking the car-rental repository. A disposable directory under `/tmp` was linked to the non-production project for CLI operations, so the repository's `.vercel` state was not changed.

## 2. Provisioning and authentication findings

The initial store creation used Vercel CLI 50.28.0 because that was the locally inspected CLI baseline. It correctly created a private `fra1` store, but its connection flow still added an encrypted development-only `BLOB_READ_WRITE_TOKEN`. The token value was never pulled, read or printed.

Vercel CLI 55.0.0 was then used to obtain the dedicated project's development OIDC token and authenticate a real list operation against the new store. After OIDC succeeded:

1. the legacy `BLOB_READ_WRITE_TOKEN` environment variable was removed;
2. Development was verified to supply `VERCEL_OIDC_TOKEN`;
3. the non-secret store selector and Phase 8E-C guard variables were configured for Development only;
4. an environment-run check confirmed OIDC present, store selector present, static token absent and production documents disabled;
5. Preview and Production were confirmed to have no configured environment variables.

This matches Vercel's current documented model: newly connected projects can use a rotating OIDC token instead of a long-lived Blob token. Local commands can receive a development OIDC token through Vercel CLI without writing it into the repository. See [Vercel Blob OIDC authentication](https://vercel.com/changelog/vercel-blob-now-supports-oidc-authentication) and [Vercel OIDC token anatomy](https://vercel.com/docs/oidc/reference).

No credential value was written to a file, command output, documentation, Git or application audit data.

## 3. Deployment attestations

The following are recorded as non-production deployment attestations, not fabricated runtime guarantees:

- the store creation command explicitly selected `--access private`;
- `blob get-store` reported `Access: Private`;
- an unauthenticated GET using only the private hostname/pathname failed;
- the creation command and store metadata reported `fra1`;
- the store was connected only to Development in the dedicated non-production project;
- Production and Preview environment configuration remained empty;
- no public Blob store was created;
- no existing project was linked or modified;
- the legacy development token created by the old CLI was removed;
- the real adapter operated with a short-lived development OIDC token;
- the production document feature flag remained false.

The public provider API still does not prove contractual EU-only processing or every CDN/data-location property. Those facts remain production legal/privacy gates.

## 4. Environment contract

Only the following non-secret names are configured in the dedicated project's Development environment:

- `BLOB_STORE_ID`
- `PRIVATE_DOCUMENTS_ENABLED` (`false`)
- `PRIVATE_DOCUMENT_STORAGE_PROVIDER`
- `PRIVATE_DOCUMENT_ENVIRONMENT`
- `PRIVATE_DOCUMENT_BLOB_STORE_ID`
- `PRIVATE_DOCUMENT_BLOB_REGION`
- `PRIVATE_DOCUMENT_BLOB_PRIVATE_ACCESS_ATTESTED`
- `PRIVATE_DOCUMENT_BLOB_REGION_ATTESTED`
- `PRIVATE_DOCUMENT_MAXIMUM_UPLOAD_BYTES`
- `PRIVATE_DOCUMENT_UPLOAD_GRANT_SECONDS`
- `PRIVATE_DOCUMENT_RECENT_AUTH_SECONDS`
- `PRIVATE_DOCUMENT_RECONCILIATION_BATCH_SIZE`
- `PRIVATE_DOCUMENT_INTEGRATION_ENABLED`
- `PRIVATE_DOCUMENT_INTEGRATION_SYNTHETIC_ONLY`
- `PRIVATE_DOCUMENT_INTEGRATION_EXPECTED_PROJECT`
- `PRIVATE_DOCUMENT_INTEGRATION_STORE_NAME`

`VERCEL_OIDC_TOKEN` is supplied ephemerally by Vercel CLI. `BLOB_READ_WRITE_TOKEN` is absent. No `.env`, ignored local environment template or committed configuration file was changed.

## 5. Guarded integration harness

The explicit command is:

```bash
pnpm test:documents:provider
```

It must run under the dedicated project's Development environment, for example:

```bash
vercel env run --cwd <dedicated-nonprod-link> -- \
  pnpm --dir <car-rental-repository> test:documents:provider
```

The normal `pnpm test:run` suite remains fully mocked/offline. The real-provider command exits before loading the adapter unless all of these agree:

- explicit integration enabled;
- explicit synthetic-only mode enabled;
- `NODE_ENV` and Vercel environment are not production;
- production document workflows are not enabled;
- selected provider is `vercel-blob-private`;
- expected project name is explicitly non-production and matches the OIDC claim;
- OIDC environment is Development or Preview, never Production;
- OIDC token is present, structurally valid and not near expiry;
- expected and actual store identifiers match;
- expected region is `fra1`;
- private/region deployment attestations are set;
- static Blob token is absent;
- the environment-scoped pathname segment is valid.

Without the explicit flags, the command was verified to stop with `DOCUMENT_INTEGRATION_EXPLICIT_ENABLE_REQUIRED` before a provider call.

The harness emits structured pass/fail case names, a store-ID fingerprint and a redacted pathname shape only. It never logs a token, full signed URL, private hostname, full pathname or object bytes. Cleanup runs in `finally` after partial failure.

## 6. Synthetic fixtures

The integration uses generated in-memory fixtures only:

- small structurally valid PDF;
- small structurally valid JPEG;
- small structurally valid PNG;
- JPEG bytes declared as PDF for MIME mismatch;
- valid PNG bytes checked with a JPEG filename for extension mismatch;
- text bytes declared as PDF for invalid signature;
- unsupported `text/plain` adapter request;
- a 65-byte synthetic body against a 64-byte grant for provider size rejection.

Every PDF/image fixture contains this embedded marker:

```text
TEST FILE - NOT A REAL IDENTITY DOCUMENT
```

No fixture contains a person, name, email, booking reference, identity value, real photo, third-party document or customer data. Fixture bytes exist only in process memory and are never stored in PostgreSQL.

## 7. Real upload-grant behavior

The real SDK flow successfully executed `issueSignedToken()` and `presignUrl()` through the Phase 8E-B adapter. Verified behavior:

- exact generated pathname upload succeeded;
- a changed pathname failed;
- GET against a PUT grant failed;
- first PUT succeeded and a repeat overwrite failed;
- the returned expiry was capped at ten minutes;
- the 10 MiB configured maximum was retained by the provider-neutral grant;
- a 65-byte request against a 64-byte signed maximum failed;
- an expired grant failed;
- the pathname remained opaque and matched only the redacted shape `private-documents/<nonprod-environment>/<opaque-32>/<opaque-48>.<type>`;
- abort did not revoke a previously issued PUT URL, matching the documented SDK limitation;
- the simulated aborted application intent remained non-acceptable even when the still-valid provider grant later produced an object.

### Content-type deviation

The provider accepted a signed PUT whose HTTP `Content-Type` header was `text/plain` even though the signed request was created with `allowedContentTypes: ['application/pdf']`. This is a real deviation from the Phase 8E-B mock assumption.

Consequences:

- the adapter continues to constrain and record the requested MIME;
- provider content type is evidence, not trust;
- lifecycle completion compares provider-declared content type with the intent;
- full retrieval, SHA-256, magic-byte and structural validation remain mandatory;
- documentation and tests do not claim that the provider enforces the request header in this flow.

The 10 MiB application limit remains authoritative even though the smaller real signed-size test was enforced by Blob.

## 8. Object inspection and missing-object correction

Real SDK 2.4.0 `head()` returned:

- exact pathname;
- byte size;
- declared content type;
- upload timestamp;
- ETag;
- provider URL fields, which the adapter discards.

Existing objects were found successfully. A generated-but-not-uploaded target normalized to missing.

Live deletion exposed a narrow SDK behavior difference: `BlobNotFoundError` is an instance of the exported SDK class, but its inherited `error.name` is the generic string `"Error"`. The Phase 8E-B wrapper compared the name string and therefore misclassified confirmed absence. It now uses `instanceof BlobNotFoundError`, with a regression test. No storage, lifecycle or persistence contract changed.

## 9. Private retrieval and post-upload validation

Real `get(pathname, { access: 'private', useCache: false })` retrieval succeeded through OIDC for PDF, JPEG and PNG.

For each allowed fixture the harness verified:

- exact provider pathname and expected byte size;
- provider content-type evidence;
- ETag presence;
- complete bounded stream read;
- exact SHA-256 match;
- Phase 8D MIME, extension, magic-byte and basic structural validation;
- no byte persistence or byte logging.

The negative fixtures produced the expected provider-neutral validation failures for MIME mismatch, extension mismatch, invalid signature and unsupported declared type. Browser/direct-upload success remained provisional and never created production-clean evidence.

## 10. Public access and quarantine

An unauthenticated request constructed from the private store hostname and opaque pathname failed. No public route, signed GET, customer route, admin route, static asset or discoverable integration endpoint was created. Pathname knowledge alone was insufficient.

`markQuarantined()` verified the real object. `markApproved()` performed no provider mutation. Both retained one immutable object pathname. No copy, rename or public exposure occurred. Database lifecycle state remains the sole quarantine/clean authority.

The fake scanner was used only in the health evaluation. It did not label any Blob object production-safe.

## 11. Deletion and reconciliation

Real deletion verification passed:

- current ETag inspected;
- wrong ETag rejected before deletion;
- exact `ifMatch` deletion succeeded;
- absence was confirmed;
- repeated deletion returned provider-neutral already-missing success;
- adapter performed no database mutation;
- retry loops remained bounded.

Reconciliation verification passed:

- only the strict non-production prefix was accepted by the adapter;
- a result limit of one was honored;
- a real cursor returned the second page;
- listing did not delete objects;
- a wrong environment prefix failed before a provider call;
- final strict-prefix listing returned zero;
- an independent authenticated whole-store listing returned zero.

The store metadata command temporarily reported `Blob Count: 4` and `Size: 574B` after deletion while both live list operations returned zero. This is recorded as delayed/cumulative store metering metadata, not evidence of remaining accessible objects.

## 12. Cleanup and metering

The successful harness reported six removed objects and zero remaining. It also removed synthetic objects left by earlier failed diagnostic runs. One additional diagnostic object was deleted conditionally while isolating the missing-object behavior. Final authenticated whole-store listing: zero objects.

No local fixture file was created. The disposable project-link directory is removed during final local cleanup; the approved non-production project and empty store are retained.

Observed provider metering:

- store billing state: Active;
- delayed store metadata: four historical/cached entries totaling 574 bytes immediately after cleanup;
- live accessible object count: zero;
- no invoice, billed line item or explicit monetary charge was shown or queried during this phase.

The operation/storage footprint was limited to tiny synthetic fixtures and bounded control operations. This document does not claim the operations were free.

## 13. Production-health result

The real non-production adapter produced a configured storage-provider health result. Combined production health remained false and did not emit `DOCUMENT_PRODUCTION_READY` because:

- this is not a production project/store;
- production documents are disabled;
- no real scanner exists;
- recent-authentication integration is incomplete;
- restricted production roles are not assigned;
- persistent production audit behavior is not verified;
- retention worker is not production-operational;
- deletion worker is not production-operational;
- contractual region/processing, plan, retention and legal/privacy decisions remain provisional.

## 14. Validation

The final validation set includes:

- `pnpm exec prisma validate`
- `pnpm exec prisma generate`
- `pnpm typecheck`
- `pnpm test:run`
- real `pnpm test:documents:provider` under the dedicated Development OIDC environment
- scoped ESLint
- `pnpm build`
- `git diff --check`

The real suite passed all reported cases and finished with `productionReady: false` and `remainingObjects: 0`.

## 15. Files and commits

Implementation files:

- `lib/private-documents/infrastructure/nonproduction-integration.ts`
- `lib/private-documents/infrastructure/vercel-blob-client.ts`
- `scripts/private-documents/synthetic-fixtures.ts`
- `scripts/private-documents/vercel-blob-integration.ts`
- `tests/unit/documents/phase8e-nonproduction-integration-guard.test.ts`
- `tests/unit/documents/phase8e-vercel-blob-adapter.test.ts`
- `package.json`
- this audit record

Commits:

- `dc23ad6` — `feat: add guarded Blob integration harness`
- `c5fb27b` — `test: enforce nonproduction Blob integration guards`
- `0e48eae` — `fix: align Blob adapter with live provider behavior`
- documentation/final evidence commit: `docs: record Phase 8E-C Blob integration`

`.graphifyignore` and `graphify-out/` remain untracked and untouched.

## 16. Phase 8F readiness and production provisioning checklist

Phase 8E-C proves the provider mechanics only. Phase 8F requires separate approval and must not reuse this non-production store as production.

Before any production provisioning:

1. approve a distinct production Vercel project and private Blob store name;
2. confirm the applicable Vercel plan, limits, logging and support expectations;
3. obtain contractual/privacy approval for `fra1`, CDN/cache behavior and all processing locations;
4. approve final retention values, deletion grace and 365-day hard maximum;
5. select and verify a real external malware scanner;
6. implement protected authenticated staff streaming routes with no signed GET;
7. implement and verify the ten-minute recent-authentication flow;
8. assign restricted production document roles and remove compatibility ambiguity;
9. verify persistent access/audit evidence;
10. implement bounded idempotent reconciliation, retention and deletion workers;
11. create a new private production store directly with current OIDC behavior;
12. connect it only to the approved production project/environment;
13. require exact expected store ID and `fra1` attestations;
14. ensure no `BLOB_READ_WRITE_TOKEN` exists in production;
15. repeat synthetic-only smoke verification and cleanup before enabling customer workflows;
16. keep production health false until every storage, scanner, auth, role, audit, worker and policy gate passes simultaneously.

Phase 8E-C is complete. This is not authorization to begin Phase 8F.
