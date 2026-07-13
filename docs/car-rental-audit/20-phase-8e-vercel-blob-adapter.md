# Phase 8E-B — Vercel Blob private-storage adapter

Implementation date: 2026-07-13. Status: adapter and production-shaped contracts complete with mocked/local verification. Phase 8E-C has not started.

No Vercel Blob store was created or contacted. No real Vercel credential was used, no external file was uploaded, no deployment was performed, and no production document feature was enabled. Prisma schema and migrations are unchanged.

## 1. Delivered scope

Phase 8E-B adds:

- exact `@vercel/blob@2.4.0` dependency pin;
- provider-neutral local-staged versus direct-PUT upload delivery contracts;
- `VercelBlobPrivateStorageAdapter` and an explicit adapter factory;
- server-only deterministic opaque pathname generation from a preallocated random upload-intent ID;
- environment parsing and fail-closed production checks;
- exact-path signed PUT issuance, metadata inspection, bounded private retrieval, server-stream primitives, conditional deletion, honest abort semantics and bounded reconciliation listing;
- Vercel-specific errors mapped to stable document-domain errors;
- combined production-health evaluation that remains blocked by all non-storage requirements;
- mocked provider tests and local/Vercel contract-parity coverage.

Phase 8E-B does not add routes, UI, a real scanner, workers, Cron, storage provisioning or integration credentials.

## 2. Dependency and actual SDK API

Installed exactly:

```text
@vercel/blob@2.4.0
```

The installed local declarations were inspected before implementation. The adapter boundary uses these actual APIs:

| SDK method           | Adapter use                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issueSignedToken()` | Issue one delegation restricted to the exact pathname, `put`, declared MIME, maximum bytes and absolute expiry.                                           |
| `presignUrl()`       | Produce one private exact-path PUT URL with the same restrictions, `allowOverwrite: false`, `addRandomSuffix: false`, and 60-second object cache minimum. |
| `head()`             | Inspect pathname, byte size, declared content type, upload time and ETag.                                                                                 |
| `get()`              | Retrieve a private stream with `useCache: false`; URLs returned by the SDK are discarded.                                                                 |
| `del()`              | Delete the exact pathname with `ifMatch` when the ETag discriminator is known.                                                                            |
| `list()`             | List one strict environment prefix with bounded limit and cursor pagination.                                                                              |

SDK types terminate inside the infrastructure client, error mapper, adapter and tests. Provider-neutral application modules receive no Vercel SDK value or type.

### Confirmed limitations and deviations

- The SDK exposes no operation to revoke an already issued single-PUT URL. `abortUpload()` therefore validates the exact target and relies on application intent expiry; `cleanupAbandonedUpload()` later deletes an exact object if one exists. It does not claim grant revocation.
- The SDK does not expose authoritative store region or private/public store configuration through these data APIs. Expected `fra1`, region confirmation and private-access confirmation are deployment attestations plus exact store-ID configuration checks. Runtime health does not fabricate provider evidence.
- No signed GET is implemented. The provider-neutral `openPrivateRead()` returns only a private stream and normalized metadata for a future authenticated Route Handler. `createShortLivedReadAccess()` fails closed for this adapter.
- `head()` and `list()` expose provider URLs, but the normalization boundary intentionally drops them.
- Blob supplies ETag but no trusted SHA-256. The Phase 8D validator calculates SHA-256 from the complete retrieved byte stream.

These limitations do not require persistence changes.

## 3. Contracts and adapter architecture

`UploadTarget` now has a provider-neutral discriminated delivery:

- `LOCAL_STAGED` for disposable local storage;
- `DIRECT_PUT` with transient access value, `PUT` method and required content-type header.

The upload-target request now includes the preallocated intent ID, normalized extension and declared MIME. Repeated requests supply the existing target/object reference and must regenerate the same pathname and target ID; any mismatch is rejected as an idempotency conflict.

Abort and abandoned-cleanup requests now carry both target ID and exact object reference. This removes any need to recover a pathname from transient in-memory state and permits exact provider cleanup after application restart.

The adapter factory rejects local storage in production and rejects construction of the Vercel adapter unless it is the selected provider. Ordinary local tests continue to use `LocalPrivateDocumentStorage` and require no Blob variables.

## 4. Authentication and environment contract

The environment reader returns booleans and identifiers only; it never returns OIDC or static-token values.

| Variable                                        | Contract                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `PRIVATE_DOCUMENTS_ENABLED`                     | Must be `true` before production storage can operate.                                                            |
| `PRIVATE_DOCUMENT_STORAGE_PROVIDER`             | `local-private` locally; exactly `vercel-blob-private` for production.                                           |
| `PRIVATE_DOCUMENT_ENVIRONMENT`                  | Opaque lowercase environment segment, at most 32 characters.                                                     |
| `PRIVATE_DOCUMENT_BLOB_STORE_ID`                | Server-side expected store ID. Must equal Vercel-supplied `BLOB_STORE_ID`.                                       |
| `PRIVATE_DOCUMENT_BLOB_REGION`                  | Must be `fra1`.                                                                                                  |
| `PRIVATE_DOCUMENT_BLOB_PRIVATE_ACCESS_ATTESTED` | Deployment evidence gate; must be `true` in production.                                                          |
| `PRIVATE_DOCUMENT_BLOB_REGION_ATTESTED`         | Deployment/contract evidence gate; must be `true` in production.                                                 |
| `PRIVATE_DOCUMENT_MAXIMUM_UPLOAD_BYTES`         | Positive integer no greater than `10485760`. Default `10485760`.                                                 |
| `PRIVATE_DOCUMENT_UPLOAD_GRANT_SECONDS`         | Positive integer no greater than `600`. Default `600`.                                                           |
| `PRIVATE_DOCUMENT_RECENT_AUTH_SECONDS`          | Positive integer no greater than `600`. Default `600`.                                                           |
| `PRIVATE_DOCUMENT_RECONCILIATION_BATCH_SIZE`    | Integer from 1 through 100. Default 50.                                                                          |
| `VERCEL`, `VERCEL_OIDC_TOKEN`, `BLOB_STORE_ID`  | Connected-project production runtime evidence. The SDK resolves OIDC without the adapter copying token material. |
| `BLOB_READ_WRITE_TOKEN`                         | Allowed only in an explicitly selected non-production integration process. Its presence blocks production.       |

The repository's `.env.local.example` is ignored and not versioned, so it was deliberately left unchanged. No `.env` file or credential was changed.

## 5. Pathname generation

The server generates:

```text
private-documents/{environment}/{sha256-derived-slot}/{sha256-derived-object}.{approved-extension}
```

The source intent ID is a server-preallocated random UUID. Hash domain separation produces fixed opaque segments, so an idempotent reissue produces the same target while different intents produce different objects. The pathname contains no original filename, customer/booking ID, document type, identity value, date or authorization state.

Validation rejects traversal, backslashes, empty segments, control characters, invalid environments, invalid intent identifiers and any pathname not matching the complete approved shape. The browser cannot submit a complete pathname through the adapter contract.

## 6. Upload-grant behavior

The adapter:

1. verifies operational provider/store/region/auth configuration;
2. validates MIME and the configured/application size ceiling;
3. generates or revalidates the exact deterministic pathname;
4. caps expiry at the earlier of intent/session expiry and ten minutes;
5. calls `issueSignedToken()` for only `put` and the exact pathname;
6. calls `presignUrl()` for private PUT with no overwrite and no random suffix;
7. validates the returned access URL as HTTPS without URL credentials;
8. returns the access value transiently without logging or persisting it.

Grant creation is not automatically retried after an ambiguous provider response. The caller can safely request the same intent again because pathname and target ID are deterministic; conflicting repeats fail.

## 7. Inspection and post-upload verification

`inspectObject()` validates provider, expected store, region, strict environment prefix and exact returned pathname. It normalizes byte size, declared content type, uploaded time and ETag. It does not treat any metadata as file-safety evidence.

`readObjectForVerification()` performs private `get(..., { useCache: false })`, rejects provider-declared oversize responses before buffering, counts every streamed chunk, cancels on overflow, checks streamed size against metadata and returns only bounded bytes to the server-side lifecycle service. The existing Phase 8D validator then enforces expected SHA-256, declared MIME, extension, magic bytes and basic PDF/JPEG/PNG structure. Buffers are not persisted or logged.

Lifecycle completion also compares provider-declared content type with the intent when the provider supplies it.

## 8. Quarantine, approval and access streaming

`markQuarantined()` verifies that the exact object exists and retains its ETag. `markApproved()` validates the reference and changes only the provider-neutral logical namespace. Neither operation copies, renames or exposes Blob content; PostgreSQL lifecycle state remains authoritative.

`openPrivateRead()` performs authenticated private retrieval with cache bypass and returns a provider-neutral stream plus normalized metadata. It returns no Blob URL, SDK credential or signed GET. Route Handler authorization, response headers and audit persistence remain Phase 8E-C work and production access therefore remains unavailable.

Existing application access checks still reject non-current, pending, infected, rejected, deleted, expired or provenance-incomplete documents. Downloads still require the recent-authentication verifier; no bypass was added.

## 9. Deletion and abort behavior

Deletion performs:

1. exact reference and metadata lookup;
2. ETag comparison when the persisted discriminator is present;
3. `del(pathname, { ifMatch })`;
4. bounded absence verification;
5. a safe hashed confirmation reference containing no pathname.

Already absent is idempotent success. On an uncertain provider delete error, the adapter first inspects state. Absence is treated as completed; a still-present object returns a safe provider error without an automatic blind retry. A stale ETag is rejected. The adapter never changes database state.

`abortUpload()` cannot revoke a signed PUT and performs no dishonest provider action. The lifecycle marks the typed intent terminal. Bounded abandoned cleanup can later inspect and delete only the exact intent object.

## 10. Reconciliation, retry and errors

Listing accepts only `private-documents/{configured-environment}/`, enforces the configured batch ceiling, preserves cursor/`hasMore`, validates every returned pathname and never deletes during listing. Age filtering and scheduling remain application/worker concerns.

Only safe inspection, retrieval and list operations receive at most two attempts by default with bounded jitter. Tests inject deterministic sleep/jitter. Grant creation is not retried. Conditional deletion is never retried until object state is checked.

The error mapper covers authentication, unavailable/missing stores, pathname mismatch, missing object, stale precondition, size, content type, throttling, service unavailability, request abort/timeout and unknown provider operations. Customer-visible errors contain stable safe messages only; raw SDK messages, credentials, URLs and bytes are not propagated or logged.

## 11. Production health

Provider health checks selection, exact store equality, expected region, feature state, runtime/OIDC evidence, absence of a production static token, deployment attestations and a bounded authenticated list probe. It reports unverifiable private/region facts as deployment-check failures.

Combined production health requires all of the following simultaneously:

- production-ready Vercel private storage;
- a production malware scanner (the deterministic fake never qualifies);
- operational recent authentication;
- restricted document-review role assignment;
- persistent audit behavior;
- retention and deletion workers;
- resolution of contractual region, plan, scanner and retention blockers.

Only the combined result may emit `DOCUMENT_PRODUCTION_READY`. Mocked Blob success alone cannot do so, and Phase 8E-B production health remains blocked.

## 12. Tests and validation

All Blob tests inject a `VercelBlobClient` mock. No test instantiates the real client boundary, so real environment credentials cannot cause a provider call.

Coverage includes:

- provider selection, expected/wrong/missing store, `fra1`/wrong region, OIDC, forbidden production static token and local-production rejection;
- opaque deterministic pathname generation and unsafe-path rejection;
- exact PUT-only grant constraints, ten-minute cap, 10 MiB ceiling, MIME restrictions, no overwrite and idempotent/conflicting repeats;
- inspection, pathname/store/size mismatch and ETag retention;
- uncached bounded PDF/JPEG/PNG retrieval, checksum and Phase 8D byte validation, overflow cancellation and safe retrieval errors;
- provider-neutral streaming without URL/credential output;
- conditional deletion, absence verification, already-absent behavior, ambiguous results, discriminator checks and safe failures;
- honest abort and exact abandoned cleanup;
- bounded strict-prefix pagination, malformed result rejection and no listing-time deletion;
- local/Vercel provider-neutral contract parity where capabilities overlap;
- health blocking for fake scanner, recent authentication, restricted role, workers and provisional decisions;
- no credential/URL logging in tested failures.

Validation results:

| Command                                                 | Result                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                        | Pass; lockfile unchanged and Prisma client postinstall generation succeeded. |
| `pnpm exec prisma validate`                             | Pass.                                                                        |
| `pnpm exec prisma generate`                             | Pass.                                                                        |
| `pnpm typecheck`                                        | Pass.                                                                        |
| `pnpm test:run`                                         | Pass: 34 files, 232 tests.                                                   |
| Scoped ESLint for private-document implementation/tests | Pass with zero errors and warnings.                                          |
| `pnpm build`                                            | Pass.                                                                        |
| `git diff --check`                                      | Pass.                                                                        |

Build warnings were pre-existing/non-blocking: stale `baseline-browser-mapping` data and Next.js workspace-root inference caused by another lockfile above the repository. No unrelated dependency was upgraded to suppress them.

## 13. Files changed and commits

Changed implementation groups:

- dependency: `package.json`, `pnpm-lock.yaml`;
- provider-neutral contracts/lifecycle: document domain types/errors, storage contract/local adapter, lifecycle and cleanup services;
- Vercel infrastructure: environment reader, SDK client boundary, safe error mapper, pathname generator, adapter and storage factory;
- readiness: document infrastructure/production health evaluation;
- tests: updated Phase 8D local calls plus Phase 8E-B configuration, adapter and parity suites;
- documentation: this audit record.

Commits:

- `8e8ef7d` — `feat: add private Blob storage boundary`
- `4585039` — `feat: implement Vercel Blob private adapter`
- `13d5f25` — `test: verify private Blob adapter contracts`
- documentation commit: `docs: record Phase 8E-B Blob adapter`

`.graphifyignore` and `graphify-out/` remain untracked and untouched. No Prisma or migration file changed.

## 14. Exact non-production provisioning checklist for Phase 8E-C

Phase 8E-C requires separate approval before any item below is executed.

1. Create a new Vercel Blob **private** store dedicated to an isolated, synthetic-data-only integration environment.
2. Select `fra1`; do not reuse or connect the future production store.
3. Connect the store only to the approved non-production Vercel project/environment.
4. Configure an opaque `PRIVATE_DOCUMENT_ENVIRONMENT` distinct from production.
5. Set `PRIVATE_DOCUMENT_STORAGE_PROVIDER=vercel-blob-private`, the expected store ID, `fra1`, approved limits and the integration feature gate only in that environment.
6. Confirm Vercel supplies `BLOB_STORE_ID` and rotating `VERCEL_OIDC_TOKEN`; prefer OIDC and do not create a static token unless a separately approved non-production limitation requires it.
7. Verify expected and actual store IDs match without printing either credential or signed access values to logs.
8. Confirm in the dashboard that the store is private and record deployment evidence for private access and `fra1` before setting the attestation gates.
9. Deploy only an integration build with the fake scanner and all production features still disabled.
10. Use only generated synthetic PDF/JPEG/PNG fixtures containing no personal data.
11. Verify exact PUT constraints, private unauthenticated denial, authenticated head/get, uncached complete validation, conditional delete and bounded reconciliation against that isolated store.
12. Verify no signed GET URL, SDK URL, token, pathname or bytes enter browser DTOs, logs, audit metadata or database fields outside the approved opaque reference fields.
13. Remove every synthetic object and disconnect/delete the integration store when the approved exercise ends, unless retention for continued integration testing is explicitly approved.
14. Keep production blocked until a real scanner, access routes, recent authentication, restricted role, audit behavior, workers, plan and contractual data-location/retention decisions are approved and verified.

Phase 8E-B is ready for review. It is not authorization to begin Phase 8E-C or contact Vercel Blob.
