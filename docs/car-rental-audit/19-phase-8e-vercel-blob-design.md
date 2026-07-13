# Phase 8E-A — Vercel Blob private-storage design

Review date: 2026-07-13. Status: architecture and exact implementation design only. Phase 8D is approved. The previously proposed AWS/S3/GuardDuty implementation is cancelled and retained only as an evaluated alternative.

> Phase 8F-A supersession: the managed-scanner path was evaluated and cancelled for v1. OPSWAT MetaDefender Cloud remains an evaluated optional future upgrade, not a selected dependency. V1 uses private Vercel Blob, mandatory technical validation, and restricted manual administrator review as documented in `22-phase-8f-manual-document-review-prerequisites.md`.

No dependency, Prisma model, migration, runtime behavior, environment value, Vercel project, Blob store, Blob object, scanner, production/shared database, or external infrastructure was created, modified, or contacted during this review.

## 1. Decision

Production v1 should use:

- one Vercel Blob **private** store for production in Frankfurt (`fra1`), separate from every development/test store;
- Vercel project/store connection and short-lived OIDC authentication, with no production `BLOB_READ_WRITE_TOKEN`;
- `@vercel/blob` 2.4.0 or newer because 2.4.0 introduced the required OIDC-compatible signed URL APIs;
- server-generated immutable opaque pathnames;
- a narrowly scoped, ten-minute presigned `PUT` upload URL bound to one upload intent, one pathname, the 10 MiB ceiling, and the PDF/JPEG/PNG declared-content allowlist;
- mandatory server-side post-upload `head()` and full `get(..., { useCache: false })` verification before document metadata can become scan-pending;
- one immutable Blob pathname for the object's complete lifetime, with quarantine/approval authority stored in PostgreSQL rather than implemented as a Blob copy or rename;
- an external production malware-scanner adapter still required before production document requirements can activate;
- authenticated streaming Route Handlers for staff view/download, with authorization in the handler, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, safe `Content-Disposition`, and no pathname parameter;
- ten-minute recent authentication for download as the proposed initial policy, subject to owner approval; five minutes is the access-operation/grant ceiling;
- protected bounded Vercel Cron workers for reconciliation, cleanup, retention and deletion;
- PostgreSQL as the only authority for lifecycle, provenance, replacement, retention, legal hold, deletion and audit evidence.

The workflow must remain production-disabled until storage, scanner, recent-authentication, restricted-role assignment, access routes, workers and audit health all pass. Local development continues to select the Phase 8D local adapter by default.

## 2. Official Vercel assumptions verified

All Vercel-specific claims below were retrieved from official Vercel documentation on 2026-07-13.

| Verified fact                                                                                                                                                                       | Official source                                                                                                                                                                                                                                     | Architectural consequence                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private Blob is generally available on all plans. Private stores require authentication for reads and writes.                                                                       | [Private Blob GA](https://vercel.com/changelog/vercel-private-blob-is-now-generally-available), [Private Storage](https://vercel.com/docs/vercel-blob/private-storage)                                                                              | Create a private store only. A private URL is still an internal identifier and must not enter customer DTOs or logs.                                                                                                              |
| Private storage needs `@vercel/blob >= 2.3`; signed URLs require 2.4.0.                                                                                                             | [Private Storage](https://vercel.com/docs/vercel-blob/private-storage), [Signed URLs launch](https://vercel.com/changelog/signed-urls-are-now-available-for-vercel-blob)                                                                            | Pin at least `@vercel/blob@2.4.0`; do not implement against the older client-token-only design.                                                                                                                                   |
| Connected Vercel projects receive `BLOB_STORE_ID`, rotating `VERCEL_OIDC_TOKEN`, and callback public key; OIDC wins by default.                                                     | [SDK authentication](https://vercel.com/docs/vercel-blob/using-blob-sdk)                                                                                                                                                                            | Production uses OIDC. Health fails if the store ID/OIDC pair is absent or the expected store does not match.                                                                                                                      |
| Outside Vercel, SDK calls use a long-lived `BLOB_READ_WRITE_TOKEN`; a locally pulled OIDC token is also possible but short-lived.                                                   | [SDK authentication](https://vercel.com/docs/vercel-blob/using-blob-sdk)                                                                                                                                                                            | Ordinary local/test execution uses no Blob credential. Optional non-production integration is explicit and isolated; credentials never enter Prisma or the repository.                                                            |
| Vercel Functions accept request/response payloads up to 4.5 MB; Vercel recommends client uploads for larger files. Streaming responses are exempt from the buffered response limit. | [Function limits](https://vercel.com/docs/functions/limitations), [Server uploads](https://vercel.com/docs/vercel-blob/server-upload), [body-limit guidance](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions) | A 10 MiB server-proxied upload is not reliable. Use direct presigned client upload. Authorized reads may stream through a Route Handler. The existing Next Server Action `8mb` setting does not override Vercel's platform limit. |
| Client uploads go browser-to-Blob and avoid upload transfer charges, but their server token route must authenticate and authorize.                                                  | [Client Uploads](https://vercel.com/docs/vercel-blob/client-upload), [Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)                                                                                                          | The upload-authorizing handler must reload the exact typed intent and must never accept a caller pathname.                                                                                                                        |
| Signed tokens/URLs can bind one pathname, operation, content types, maximum bytes and expiry. Delegations last at most seven days; this design uses ten minutes.                    | [Vercel Signed URLs](https://vercel.com/docs/vercel-blob/vercel-signed-urls)                                                                                                                                                                        | Use `issueSignedToken()` with OIDC and `presignUrl()` for one `put`; `allowOverwrite: false`, no wildcard pathname, no get/delete authority.                                                                                      |
| Client-token uploads support objects up to 5 TB, and Vercel recommends multipart above 100 MB. Signed PUTs enforce a lower configured maximum.                                    | [Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk), [Vercel Signed URLs](https://vercel.com/docs/vercel-blob/vercel-signed-urls)                                                                                                       | The provider ceiling is not the application ceiling. Keep the code and grant capped at exactly 10 MiB; multipart is unnecessary.                                                                                                 |
| Signed URLs also support `get`, `head`, and `delete`; they are bearer capabilities until expiry.                                                                                    | [Vercel Signed URLs](https://vercel.com/docs/vercel-blob/vercel-signed-urls)                                                                                                                                                                        | Do not use signed GETs for initial staff access. They weaken per-request authorization/revocation/audit. Reserve a five-minute signed GET for an approved scanner integration if required.                                        |
| `put()` returns pathname, content type/disposition, URL/download URL and ETag. `get()` returns stream, headers, pathname, content type, ETag, size and upload time.                 | [Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk)                                                                                                                                                                                      | SDK responses stay inside the adapter. Persist only store ID, pathname and ETag-like opaque discriminator, never returned URLs. Blob provides no trusted SHA-256, so calculate it from retrieved bytes.                           |
| `head()` returns size, upload time, pathname, content type/disposition, URLs, cache control and ETag; missing throws `BlobNotFoundError`.                                           | [Blob SDK: head](https://vercel.com/docs/vercel-blob/using-blob-sdk)                                                                                                                                                                                | Normalize into `PrivateObjectMetadata`; discard URL fields. MIME remains untrusted.                                                                                                                                               |
| `del()` is idempotent, returns void and does not throw for a missing object. It accepts ETag `ifMatch`; cached content can remain for up to one minute.                             | [Blob SDK: del](https://vercel.com/docs/vercel-blob/using-blob-sdk)                                                                                                                                                                                 | Delete with the recorded ETag when available, then verify absence with `head()`/bounded retry. Provider success alone is insufficient for the database tombstone.                                                                 |
| `list()` supports prefix, cursor and bounded limit; it returns pathname, size, upload time, URL and ETag.                                                                           | [Blob SDK: list](https://vercel.com/docs/vercel-blob/using-blob-sdk)                                                                                                                                                                                | Use listing only for bounded abandoned-object reconciliation; discard URLs and never treat a list as lifecycle authority.                                                                                                         |
| By default a duplicate pathname throws. Vercel recommends immutable unique pathnames. Overwrite/cache changes can take up to 60 seconds.                                            | [Blob overview](https://vercel.com/docs/vercel-blob)                                                                                                                                                                                                | Generate unique paths and keep `allowOverwrite: false`. Replacement always gets a new Blob.                                                                                                                                       |
| Private Blob fetches pass through Vercel's CDN cache; default Blob cache is one month and minimum configurable cache is 60 seconds. `useCache: false` bypasses it.                  | [Private caching](https://vercel.com/docs/vercel-blob/private-storage), [SDK cache option](https://vercel.com/docs/vercel-blob/using-blob-sdk)                                                                                                      | Upload with 60-second Blob cache. Verification/deletion checks bypass cache. Staff response uses browser `no-store`; immutable pathnames remove stale-version ambiguity.                                                          |
| Vercel recommends `private, no-store` for PII and warns not to rely only on middleware for private Blob authorization.                                                              | [Private Storage](https://vercel.com/docs/vercel-blob/private-storage)                                                                                                                                                                              | Authorize in every Route Handler immediately before `get()`. Do not add `s-maxage`.                                                                                                                                               |
| Stores can be created in 20 fixed regions, including Frankfurt (`fra1`); a store's region cannot later change. Blob delivery uses regional CDN hubs.                                | [Blob overview](https://vercel.com/docs/vercel-blob), [Blob pricing/regions](https://vercel.com/docs/vercel-blob/usage-and-pricing)                                                                                                                 | Choose `fra1` at creation and place document Functions near it. Official public docs do not promise that all CDN/cache processing remains only in the EU; contractual residency/DPA confirmation remains a production gate.       |
| The documented SDK exposes system metadata and ETag, but no arbitrary object tags/custom metadata.                                                                                  | [Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk)                                                                                                                                                                                      | Keep quarantine, scan, provenance and retention facts in PostgreSQL. Do not encode them in pathnames or assume Blob tags.                                                                                                         |
| `copy()`/`rename()` exist; rename is copy-then-delete and can temporarily leave both objects if source deletion fails.                                                              | [Blob SDK: copy/rename](https://vercel.com/docs/vercel-blob/using-blob-sdk)                                                                                                                                                                         | Do not copy or rename on CLEAN. One immutable pathname plus database lifecycle status is safer and cheaper.                                                                                                                       |
| Vercel Blob documentation describes storage, not malware protection.                                                                                                                | [Blob documentation](https://vercel.com/docs/vercel-blob), [Blob security](https://vercel.com/docs/vercel-blob/security)                                                                                                                            | This is an inference from the documented feature set: Blob does not satisfy the `MalwareScanner` contract. Production remains blocked until a real scanner is selected and verified.                                              |
| Vercel Cron sends `CRON_SECRET` as a bearer header, does not retry failed runs, can overlap/duplicate, and has Function duration limits.                                            | [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)                                                                                                                                                                            | Worker routes require a non-empty secret, database locking/idempotency and bounded batches. Current fail-open cron authorization must not be copied.                                                                              |

## 3. AWS comparison and supersession

The cancelled AWS design offered customer-managed KMS, detailed IAM/bucket policy, S3 version controls, GuardDuty scanning, EventBridge and CloudTrail data events. It also required a separate AWS account/security boundary, cross-cloud credentials or federation, bucket/KMS/IAM provisioning, scanner-event delivery and greater operations ownership.

Vercel Blob is a better fit for this application's existing Vercel deployment because project/store OIDC removes a long-lived production storage secret, direct signed uploads solve the 4.5 MB Function input limit, and private `get()` integrates with Route Handlers. The tradeoffs are meaningful:

- no customer-managed encryption key or S3-level policy is exposed by Blob;
- no built-in malware scanner is documented;
- system metadata is narrower and custom tags are unavailable;
- Vercel's public documentation does not provide the same precise EU-only cache/processing guarantee as a directly selected regional S3 architecture;
- application audit remains the primary access evidence; provider-level GET audit capabilities need Vercel plan/observability confirmation.

The AWS analysis in documents 15 and 16 remains historical architecture evidence, not an implementation plan.

## 4. Upload architecture decision

### Comparison

| Option                             | Decision                                                                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-proxied upload              | Rejected for production v1. The 4.5 MB Function request limit is below the approved 10 MiB policy. Increasing Next's Server Action limit cannot change the platform limit.       |
| Legacy `handleUpload` client token | Not selected. Current docs say legacy client-token generation requires a static read-write token.                                                                                |
| Presigned client `PUT`             | **Selected.** `issueSignedToken()` uses OIDC, and the URL binds one exact server pathname, `put`, declared types, maximum bytes and expiry. No callback is needed for authority. |
| Hybrid by file size                | Rejected initially. Two upload paths add security/test complexity without product benefit; all approved files fit one direct path.                                               |

### Exact flow

1. Authenticated customer asks the application to create an upload intent.
2. Existing Phase 8D service resolves active release, document policy, requirement, side, slot, owner, 10 MiB ceiling and expected SHA-256.
3. The server allocates intent ID and opaque pathname before asking the adapter for an upload grant.
4. Adapter calls `issueSignedToken({ pathname, operations: ['put'], allowedContentTypes, maximumSizeInBytes: 10485760, validUntil })` using OIDC.
5. Adapter calls `presignUrl()` with the same exact constraints, `access: 'private'`, `allowOverwrite: false`, `addRandomSuffix: false`, and `cacheControlMaxAge: 60`.
6. Browser receives only intent ID, expiry and opaque presigned PUT access value. It cannot substitute pathname, provider, release, policy or slot.
7. Browser uploads directly, then calls `/api/private-documents/intents/[intentId]/complete`; Blob callback is not lifecycle authority.
8. Completion reloads owner/session/intent, calls `head()` for exact pathname/size/ETag, and full `get(useCache:false)` for at most 10 MiB.
9. Server calculates SHA-256, validates filename/declared MIME/extension/magic bytes/structure, creates final metadata and requests scanning.
10. Object remains inaccessible until scanner produces CLEAN and the PostgreSQL transaction marks it current/ready.

If the completion request is lost, the client retries by intent ID. Reconciliation can find the exact server pathname and resume or delete it. A malicious upload with a permitted MIME header still fails server byte validation.

## 5. Private-store configuration

- Create one production private store connected only to the production project/environment.
- Create a different private store only if an explicit shared non-production integration environment is approved. Unit/local tests use no Blob store.
- Select Frankfurt (`fra1`) at creation; region is immutable.
- Do not connect production Blob to preview/development environments.
- Do not create a public store or reuse the public vehicle-image integration.
- Record the expected store ID in a server-only deployment value and compare it with `BLOB_STORE_ID` at startup/health.
- Provision a synthetic non-sensitive health marker only during Phase 8E infrastructure approval. Verify authenticated HEAD succeeds and unauthenticated access fails.
- Obtain owner/privacy confirmation that the regional store plus Vercel CDN/private delivery behavior satisfies the required location policy.

## 6. Authentication and OIDC

Production adapter initialization requires `VERCEL=1`, `VERCEL_OIDC_TOKEN`, `BLOB_STORE_ID`, expected store ID equality, provider selection `vercel-blob`, and production feature gate. The SDK receives no explicit static token, so OIDC remains the resolved credential.

`BLOB_READ_WRITE_TOKEN` must be absent from the production document adapter configuration. If Vercel adds one as a project fallback, remove/revoke it after confirming OIDC and signed URLs work. Never expose OIDC, a static token, signed-token client signing material, store ID or private Blob URL to application logs, audit JSON, client DTOs or Prisma.

Local mode selects `local-private` before evaluating Blob variables. An optional synthetic non-production integration process may use an explicitly supplied short-lived OIDC token or isolated static token, but it must be opt-in, point to a non-production store and never run in the ordinary suite.

## 7. Object-path strategy

Use:

```text
private-documents/{deployment-environment-id}/{random-document-id}/{random-object-id}.{normalized-extension}
```

All segments except the constant prefix are server-generated cryptographically random opaque identifiers. `deployment-environment-id` is an opaque non-customer environment discriminator such as `prod-a`, not a Vercel URL or branch name.

The pathname never includes customer/user ID, name, email, birth date, licence/passport number, Booking reference, original filename, document type, locale or date. Every attempt and replacement receives a new pathname. `allowOverwrite` is always false. The extension helps Blob set a declared content type but is never trusted for validation.

Persist:

- `storageProviderId = 'vercel-blob-private'`;
- `storageRegion = 'fra1'`;
- `storageContainerId = BLOB_STORE_ID`;
- `storageKey = pathname`;
- `providerObjectVersionId` / `storageObjectVersionId = ETag` as an opaque object discriminator, not as a claim that Blob supports object version history.

Do not persist `url`, `downloadUrl`, presigned URL, delegation token or client-signing token.

## 8. Quarantine mapping

Use one immutable Blob pathname with lifecycle status only in PostgreSQL.

Rejected alternatives:

- `quarantine/` to `approved/` rename: reveals state in path, performs copy/delete, can leave duplicates, resets metadata/cache options and complicates deletion evidence.
- copy then delete: duplicates sensitive bytes and introduces a second failure/retention target.
- pathname secrecy: not an authorization control.

`markQuarantined()` validates that the exact Blob exists and returns the same pathname with logical namespace `quarantine`. `markApproved()` performs no provider mutation; it returns the same pathname with logical namespace `approved` only after the service has CLEAN scan evidence. PostgreSQL `quarantineStatus`, scan state and access service remain authoritative.

## 9. Exact adapter mapping

The new `VercelBlobPrivateStorageAdapter` remains behind `PrivateDocumentStorage`; no SDK type escapes.

| Existing method               | Vercel operation and normalized behavior                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verifyProviderConfiguration` | Check environment/provider selection, OIDC/store ID, expected store/region, then bounded `head` of a synthetic marker or `list({limit:1})`. Separately verify the marker is unavailable without auth. Map missing config/auth/mismatch/private-access failures to stable health codes. No retry on mismatch; one short retry on transport failure. Audit only health code/store hash. |
| `createUploadTarget`          | Generate opaque pathname; `issueSignedToken` + `presignUrl` for exact `put`, 10 minutes, allowed declared types, 10 MiB, no overwrite, 60-second cache. Return provider-neutral direct-upload grant. Do not audit URL/token. One retry only before returning the grant; idempotent by intent/pathname.                                                                                |
| `completeStagedUpload`        | Unsupported for production adapter. Phase 8B will split direct-upload authorization from local staged writes rather than passing Vercel types through this method. It fails closed if invoked on Vercel.                                                                                                                                                                              |
| `inspectObject`               | `head(pathname)`; compare returned pathname and ETag. Normalize size/content type/upload time and compute no checksum claim. `BlobNotFoundError` becomes undefined. Short retry only for transport/429/5xx.                                                                                                                                                                           |
| `readObjectForVerification`   | `get(pathname, {access:'private', useCache:false})`, enforce status 200 and 10 MiB while streaming into a bounded buffer, then calculate SHA-256. Abort immediately on overflow.                                                                                                                                                                                                      |
| `createShortLivedReadAccess`  | For production staff access, return an opaque application grant consumed only by authenticated streaming routes; do not return a Blob URL. A scanner-specific adapter may mint a five-minute signed GET after separate approval.                                                                                                                                                      |
| `markQuarantined`             | `head` exact object, then logical no-op. Missing/mismatched object fails.                                                                                                                                                                                                                                                                                                             |
| `markApproved`                | Provider no-op; return same pathname/ETag as logical approved reference. Service and database CLEAN rules gate this call.                                                                                                                                                                                                                                                             |
| `deleteObject`                | `del(pathname,{ifMatch:etag})`; then `head` with bounded retries until `BlobNotFoundError`. Return a generated safe confirmation containing no pathname. ETag conflict is permanent/stale; transport or cache propagation is retryable.                                                                                                                                               |
| `objectExists`                | `head`; true on metadata, false on `BlobNotFoundError`, propagate auth/provider errors.                                                                                                                                                                                                                                                                                               |
| `abortUpload`                 | If object exists, conditional `del` and verify absence; otherwise idempotent success. A presigned PUT itself has no server-side multipart session to abort for files under 10 MiB.                                                                                                                                                                                                    |
| `cleanupAbandonedUpload`      | Same exact conditional delete/absence verification, driven only by expired typed intents. Never prefix-delete.                                                                                                                                                                                                                                                                        |

Application errors remain provider-neutral: missing object, metadata mismatch, idempotency conflict, provider operation failure, access denied and retry-limit reached. Error logs contain stable codes/correlation IDs, not URL, pathname, auth header or SDK body.

### Required Phase 8E-B contract adjustment

The current `UploadTarget` models only a local staged target. Phase 8E-B adapter code must add a provider-neutral discriminated delivery value:

```ts
type UploadDelivery =
  | { kind: "LOCAL_STAGED" }
  | {
      kind: "DIRECT_PUT";
      accessValue: string;
      requiredHeaders: Record<string, string>;
    };
```

`accessValue` is transient and never persisted/audited. `createUploadTarget` must also receive a preallocated intent ID, normalized extension and declared MIME so the adapter can generate the exact pathname and constraints. `stageDisposableUpload` remains available only for the local adapter. This is an application-contract change, not a Prisma change or lifecycle redesign.

## 10. Post-upload verification

`head()` is useful for size, declared content type, pathname, upload time and ETag, but none proves content safety and the SDK does not expose SHA-256. Completion therefore downloads the entire object with `useCache:false`, capped at 10 MiB, and runs the existing Phase 8D validator and SHA-256 calculation.

The server compares:

- authenticated customer and open session;
- exact intent and server pathname/store/provider;
- expected and actual size;
- expected and calculated lowercase SHA-256;
- declared MIME versus Blob content type as evidence, not trust;
- normalized extension versus magic bytes/detected MIME;
- PDF/JPEG/PNG basic structural requirements;
- ETag against subsequent conditional delete operations.

Any mismatch leaves the object inaccessible, records a safe failure and schedules exact-object cleanup. A successful upload response alone cannot create `CustomerDocument` or CLEAN evidence.

## 11. Read/download architecture

Add:

```text
GET /api/private-documents/{documentId}/view
GET /api/private-documents/{documentId}/download
```

Each Node.js Route Handler:

1. calls the current Auth.js server session path and fresh database user/capability lookup;
2. requires the exact persisted `documents.view` or `documents.download` capability and release-bound role permission;
3. loads document by ID and verifies intended operational scope;
4. requires current, READY, CLEAN, approved, retained, unexpired and complete provenance;
5. requires recent authentication for download;
6. resolves store/pathname internally and rejects any query pathname;
7. calls private `get()` and streams with backpressure;
8. sends detected approved MIME, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, safe `Content-Disposition`, no `ETag`, and a restrictive referrer policy;
9. writes requested/granted/denied audit events without token, URL, pathname or original identity value.

Use `inline` only for an explicitly approved safe image/PDF viewer; default download uses attachment. Customers receive metadata/status only and no content route authority.

### Signed GET comparison

Vercel signed GETs can be scoped to one pathname and expiry, but remain bearer URLs that bypass the application after issuance, cannot perform a fresh capability/recent-auth check on every fetch, can leak through browser/history/referrer channels and complicate confirmed-access audit. They are therefore not selected for staff content access. They remain useful for a separately approved external scanner with a maximum five-minute grant.

## 12. Caching and response headers

- Blob upload: `cacheControlMaxAge: 60`, the documented minimum.
- Verification and deletion verification: `useCache:false` or `head()` with bounded propagation retry.
- Staff response: `Cache-Control: private, no-store`; never `public`, `s-maxage`, ISR or CDN response caching.
- `X-Content-Type-Options: nosniff`.
- `Content-Security-Policy: default-src 'none'; sandbox` where compatible with inline display.
- `Referrer-Policy: no-referrer`.
- Safe ASCII fallback plus RFC 5987 filename in `Content-Disposition`; never accept a response filename directly from the request.
- Unique immutable pathnames mean no replacement depends on invalidation.

## 13. Malware scanner recommendation

Vercel Blob does not replace `MalwareScanner`. Compare:

| Option                              | Assessment                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed external scanning API       | **Simplest credible production v1**, provided it contractually supports EU processing, private signed GET ingestion or bounded byte upload, 10 MiB PDF/JPEG/PNG, authenticated callbacks/polling, deletion/no-training commitments, DPA and acceptable availability. Adds a subprocessor and transfer/scan cost. |
| Dedicated scanner service/container | Strong control and can fetch five-minute signed GETs, but requires an operated runtime, patching, isolation, signature updates, scaling, monitoring and incident response.                                                                                                                                       |
| Separately hosted ClamAV worker     | Technically feasible and provider-neutral, but operations owns signature freshness, sandboxing, archive/decompression limits and availability. Not the simplest first release.                                                                                                                                   |
| Validation without malware scanning | Rejected. It silently weakens the approved CLEAN invariant.                                                                                                                                                                                                                                                      |
| Defer scanner                       | Safe only while production document requirements/uploads remain feature-disabled and health-blocked.                                                                                                                                                                                                             |

Recommendation: owner/security should select a managed EU-capable malware-scanning API in a separate scanner gate. Until selected, Phase 8E-B may implement and synthetic-test storage, but production document health stays blocked and Business Configuration cannot activate required documents.

## 14. Recent authentication

Current Auth.js uses Google with JWT sessions. It carries role/active state at sign-in but has no reliable server-issued recent-authentication timestamp or forced refresh flow. The Phase 8D production verifier therefore remains unsupported.

Proposed mechanism:

1. Add a server-issued JWT `reauthenticatedAt` only on a real Google OAuth sign-in callback, never from browser input.
2. Sensitive download checks require `Date.now() - reauthenticatedAt <= 10 minutes` (owner may approve 15 instead).
3. A stale download redirects to a dedicated safe reauthentication action that calls Google with forced account authentication (`prompt=login`, and provider-supported maximum-age semantics where available) and a validated same-origin return path.
4. After OAuth callback, Auth.js signs the new server timestamp into the JWT.
5. Session refresh or a browser-provided timestamp never extends it.
6. View remains capability-gated; download remains unavailable until this verifier and denial tests are implemented.

Ten minutes is the recommended initial window, aligned with the earlier Phase 8 security recommendation. This is an authentication behavior change and needs explicit Phase 8E-B-or-later approval.

## 15. Deletion and replacement

Deletion keeps the Phase 8D request/attempt/tombstone flow. The provider step uses conditional `del(ifMatch:etag)`, then verifies `head()` returns not found. Because `del()` is void/idempotent and CDN removal may take a minute, the worker records success only after absence verification; otherwise it records retryable failure. A missing retained READY object is also an incident event.

No prefix or list-based deletion is used for individual documents. PostgreSQL tombstones, hashes, provenance, attempts and audit history remain. No Blob bytes are backed up by this phase.

Replacement always uploads a new unique pathname. The prior clean object remains stored/current while the replacement is quarantined or failed. A clean promotion switches database current flags atomically; it never overwrites, copies, renames or deletes the prior Blob. The predecessor follows its own retention/deletion lifecycle.

## 16. Retention and workers

Initial operational mechanism: protected Vercel Cron Route Handlers invoking the existing bounded services.

Proposed routes:

```text
/api/cron/private-documents/expire-uploads
/api/cron/private-documents/reconcile-scans
/api/cron/private-documents/process-deletions
```

Every route fails closed if `CRON_SECRET` is missing, requires exact constant-time bearer comparison, uses PostgreSQL row/revision locks and idempotency, limits a run to the configured batch, returns structured counts and logs no object path. Vercel may overlap or duplicate and does not retry failures, so database state—not scheduler delivery—provides correctness. Failed rows remain discoverable for the next run and health alerts on overdue work.

Do not use Vercel Workflow/Queues initially: volume is low and the existing worker-ready services plus PostgreSQL concurrency are sufficient. Reassess if scan latency, retry schedules or execution duration exceed Cron/Function limits.

## 17. Environment configuration

Proposed server-only values/bindings:

| Value                                              | Purpose/rule                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------- |
| `PRIVATE_DOCUMENTS_ENABLED=false`                  | Master fail-closed production feature flag. True only after full health approval.                                                |
| `PRIVATE_DOCUMENT_STORAGE_PROVIDER=local-private   | vercel-blob-private`                                                                                                             | Local default outside production; production requires Vercel. |
| `BLOB_STORE_ID`                                    | Vercel project/store binding; never client-exposed.                                                                              |
| `VERCEL_OIDC_TOKEN`                                | Vercel-managed rotating token; never manually committed/logged.                                                                  |
| `PRIVATE_DOCUMENT_EXPECTED_BLOB_STORE_ID`          | Independently configured expected production store ID; health compares exact values.                                             |
| `PRIVATE_DOCUMENT_BLOB_REGION=fra1`                | Expected immutable region; runtime cannot prove it from object metadata, so deployment/infrastructure evidence is also required. |
| `PRIVATE_DOCUMENT_ENVIRONMENT_ID=prod-a`           | Opaque path namespace; not customer or deployment URL data.                                                                      |
| `PRIVATE_DOCUMENT_SCANNER_PROVIDER=disabled        | fake                                                                                                                             | <approved>`                                                   | Production rejects disabled/fake. |
| `PRIVATE_DOCUMENT_UPLOAD_GRANT_SECONDS=600`        | Maximum ten-minute signed PUT. Code caps it; environment may lower only.                                                         |
| `PRIVATE_DOCUMENT_READ_ACCESS_SECONDS=300`         | Five-minute internal access-operation ceiling; streaming routes normally issue no Blob URL.                                      |
| `PRIVATE_DOCUMENT_RECENT_AUTH_MAX_AGE_SECONDS=600` | Proposed ten minutes; requires owner approval.                                                                                   |
| `PRIVATE_DOCUMENT_WORKER_BATCH_SIZE=25`            | Bounded 1–50.                                                                                                                    |
| `CRON_SECRET`                                      | Required, random at least 16 characters; missing means 503/unauthorized, never allow.                                            |

Keep `DOCUMENT_FILE_POLICY.maximumBytes = 10 MiB` and allowed types code-owned. An environment value may lower the byte limit but never raise it. `BLOB_READ_WRITE_TOKEN` and `BLOB_WEBHOOK_PUBLIC_KEY` are not required by the selected no-callback presigned flow.

## 18. Production health

`DOCUMENT_PRODUCTION_READY` requires all of:

- Vercel private adapter selected; local/fake disabled;
- OIDC/store pair present and usable;
- exact expected store ID and approved `fra1` infrastructure evidence;
- authenticated marker succeeds and unauthenticated marker access fails;
- scanner configured, reachable and non-fake;
- authenticated access routes pass synthetic smoke tests;
- recent-auth verifier configured;
- named restricted reviewer/downloader/retention roles assigned as required;
- retention/deletion Cron routes deployed, protected and recently successful;
- Prisma audit persistence and append-only enforcement operational;
- production document feature flag explicitly enabled only after the above.

Stable codes:

- `DOCUMENT_VERCEL_BLOB_NOT_CONFIGURED`
- `DOCUMENT_VERCEL_BLOB_STORE_MISMATCH`
- `DOCUMENT_VERCEL_BLOB_PRIVATE_ACCESS_INVALID`
- `DOCUMENT_VERCEL_BLOB_AUTH_INVALID`
- `DOCUMENT_BLOB_REGION_UNVERIFIED`
- `DOCUMENT_PRODUCTION_SCANNER_NOT_CONFIGURED`
- `DOCUMENT_REAUTH_NOT_CONFIGURED`
- `DOCUMENT_RETENTION_WORKER_UNAVAILABLE`
- `DOCUMENT_DELETION_WORKER_UNAVAILABLE`
- `DOCUMENT_PRODUCTION_READY`

Storage alone can never produce production-ready health.

## 19. Cost review

Official Frankfurt list rates retrieved 2026-07-13 are approximately $0.023/GB-month storage, $0.40/million simple operations, $5/million advanced operations and $0.05/GB Blob Data Transfer. Deletes are free. Private streaming additionally uses Fast Data Transfer and Fast Origin Transfer at the applicable plan/region rates. Hobby lists 1 GB Blob storage, 10,000 simple operations, 2,000 advanced operations and 10 GB Blob transfer included; general delivery allowances are shared across the project. See [Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing) and [Vercel pricing](https://vercel.com/pricing).

Estimate assumptions:

- two 3 MB files per booking;
- 90-day steady-state retention with no holds (18 MB steady stored per monthly booking);
- every object is fully read once for application verification and once for scanning;
- authorized staff reads both files for 25% of bookings;
- immutable direct client uploads; no copies; one upload operation per file;
- current published list prices, before taxes, plan credits, compute and scanner vendor fees.

| Bookings/month |             Uploads | Steady stored | Verification + scanner + limited-read transfer | Approx. gross Blob/CDN metering/month\* |
| -------------: | ------------------: | ------------: | ---------------------------------------------: | --------------------------------------: |
|             20 |  40 files / 0.12 GB |       0.36 GB |                                       ~0.27 GB |                                  ~$0.04 |
|             50 | 100 files / 0.30 GB |       0.90 GB |                                       ~0.68 GB |                                  ~$0.11 |
|            100 | 200 files / 0.60 GB |       1.80 GB |                                       ~1.35 GB |                                  ~$0.22 |

\*Gross approximation applies storage, operation, Blob transfer, Fast Origin and Fast Data list rates without subtracting included allowances. If Hobby allowances are otherwise unused, 20 and 50 bookings fit the published Blob allowances and 100 exceeds only the 1 GB storage allowance by about 0.8 GB; shared project usage can consume those allowances first. Function compute and external scanner pricing are separate. The scanner may dominate cost and cannot be estimated until selected. These are planning estimates, not guaranteed bills.

## 20. Threat model

| Threat                          | Control                                                                           | Residual risk                                               | Detection                                                | Recovery                                                             |
| ------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| Static Blob token exposure      | Production OIDC; no explicit static token; secret scanning                        | Vercel/project compromise                                   | Health auth mode, Vercel audit/security alerts           | Disconnect store, revoke token, rotate project access                |
| Client upload grant theft       | Exact pathname/PUT/type/size, ten-minute expiry, no overwrite                     | Attacker can upload one permitted-size object before expiry | Intent mismatch, unexpected completion/audit correlation | Expire intent, conditional delete exact object                       |
| OIDC failure                    | Required OIDC/store health and fail-closed adapter                                | Provider outage blocks workflow                             | Health code and failed SDK calls                         | Keep files inaccessible, retry bounded, reconnect store              |
| Wrong store/project connection  | Expected store ID equality and environment separation                             | Misconfigured expected ID                                   | Startup/health mismatch, synthetic marker                | Disable feature, correct connection, inventory synthetic objects     |
| Pathname guessing               | Cryptographic opaque paths plus private auth                                      | Internal path may leak                                      | Redacted logs/audit review                               | Rotate access/session, incident review; path secrecy not relied upon |
| Uploading another pathname      | Server produces exact signed pathname; no wildcard                                | SDK/token implementation defect                             | Completion compares exact pathname/store/ETag            | Reject, delete unexpected object, rotate signing material            |
| Oversized upload                | Signed 10 MiB maximum plus head/read bounds                                       | Provider constraint defect/race                             | Head mismatch and bounded stream abort                   | Reject and delete exact object                                       |
| MIME/extension spoofing         | Declared constraints plus server magic/structure/SHA-256 validation               | Sophisticated parser/polyglot risk                          | Safe validator failure/incident rates                    | Quarantine/delete; update validator version                          |
| Scanner bypass                  | No READY without real CLEAN attempt; production health blocks fake/disabled       | Scanner false negative                                      | Scan/audit reconciliation and incident review            | Suspend workflow, quarantine affected evidence, rescan               |
| Private URL leakage             | Never return/store/log URL; streaming route uses document ID                      | Memory/browser compromise after authorized stream           | Audit anomalies and CSP/referrer controls                | Revoke user/session/capability; URL alone remains unauthenticated    |
| Route authorization bypass      | Auth/capability/policy/status in handler, not middleware only                     | Application vulnerability                                   | Denial tests, access audits, security review             | Disable routes/feature, revoke assignments, investigate access       |
| Legacy ADMIN escalation         | Existing restricted capability resolver and dedicated role requirement            | Improper role assignment                                    | Role/audit review and denial tests                       | Remove assignment, invalidate session, investigate accesses          |
| Streamed response leakage       | no-store, nosniff, safe disposition, no referrer, recent auth                     | Authorized endpoint/device can still save content           | Access audit and endpoint/device controls                | Incident response; downloaded bytes cannot be revoked                |
| Browser/CDN caching             | Browser `no-store`, no `s-maxage`, immutable pathnames                            | Blob internal CDN has minimum cache behavior                | Header tests and provider smoke tests                    | Delete object, wait propagation, incident containment                |
| Abandoned accumulation          | Typed expiry, exact-path cleanup and bounded list reconciliation                  | Cron outage/provider failure                                | Age/backlog health metrics                               | Re-enable worker, bounded catch-up, manual reviewed cleanup          |
| Deletion failure                | Conditional delete, absence verification, retries, tombstone only after proof     | CDN propagation/provider outage                             | Overdue deletion health/audit                            | Retry within grace, suspend access, escalate after deadline          |
| Provider outage                 | Fail closed; no clean/access on errors                                            | Booking/document workflow unavailable                       | Provider/health monitoring                               | Keep DB state, retry, communicate outage; no unsafe fallback         |
| Production local adapter        | Production constructor/health reject local and feature activation requires Vercel | Environment bug                                             | Stable health blocker and deployment test                | Disable feature, correct provider selection                          |
| Regional processing uncertainty | `fra1`, colocated Functions, contractual review                                   | CDN/subprocessor processing may be broader than EU          | Infrastructure/DPA evidence review                       | Do not enable production until accepted; change provider if required |

## 21. Exact dependencies

Phase 8E-B adapter code requires exactly:

```json
{
  "dependencies": {
    "@vercel/blob": "2.4.0"
  }
}
```

Use 2.4.0 as the minimum reviewed version; a newer exact version requires a fresh changelog/API/security review before lockfile update. Existing Node `crypto`, Web Streams, Zod, Auth.js, Prisma and Phase 8D validator are sufficient. Do not add AWS SDKs, Vercel CLI as an application dependency, upload middleware, file-byte database packages or a scanner package before scanner selection.

## 22. Exact files expected to change in Phase 8E-B

Adapter-code-only approval:

- `package.json`, `pnpm-lock.yaml`
- `lib/private-documents/domain/types.ts`
- `lib/private-documents/storage/contracts.ts`
- `lib/private-documents/storage/vercel-blob-private-storage.ts` (new)
- `lib/private-documents/storage/factory.ts` (new)
- `lib/private-documents/application/lifecycle-service.ts`
- `lib/private-documents/application/health.ts`
- `lib/private-documents/domain/errors.ts`
- `lib/config.ts`
- `.env.local.example` (names/placeholders only; no credentials)
- `tests/unit/documents/phase8e-vercel-blob-adapter.test.ts` (SDK mocked, no network)
- `tests/unit/documents/phase8e-storage-selection-health.test.ts`
- `docs/car-rental-audit/20-phase-8e-vercel-blob-adapter.md`

Later, separately approved upload/access/auth/worker integration:

- `lib/auth.ts` and Auth.js type declarations
- `lib/private-documents/authorization/recent-auth.ts`
- `lib/private-documents/application/access-service.ts`
- `app/api/private-documents/intents/[intentId]/upload/route.ts`
- `app/api/private-documents/intents/[intentId]/complete/route.ts`
- `app/api/private-documents/[documentId]/view/route.ts`
- `app/api/private-documents/[documentId]/download/route.ts`
- `app/api/cron/private-documents/**/route.ts`
- `vercel.json`
- route/auth/worker/integration tests and documentation

No Prisma or migration change is expected. The current provider-neutral store ID/pathname/ETag fields are sufficient.

## 23. Commit sequence

1. `feat: add Vercel Blob private storage adapter`
2. `test: verify Vercel Blob adapter without network access`
3. `feat: add Vercel document storage selection and health gates`
4. `docs: record Phase 8E Blob adapter evidence`
5. Later authorization only: `feat: add bound private document upload routes`
6. Later authorization only: `feat: add recent-authenticated document streaming`
7. Later authorization only: `feat: add protected document retention workers`

## 24. Remaining owner decisions

1. Confirm production Vercel plan and availability of required OIDC/private Blob/signed URL functionality.
2. Approve Frankfurt `fra1` and obtain contractual privacy/DPA confirmation for Blob CDN/cache and subprocessors.
3. Decide whether a separate shared non-production Blob integration store is permitted; default is none.
4. Select and approve the production malware scanner, EU processing, DPA, retention, callback/polling and cost.
5. Approve ten-minute recent authentication (or choose 15 minutes) and forced Google reauthentication UX.
6. Name initial document reviewer/downloader/retention/legal-hold assignees; customer content access remains disabled.
7. Confirm provisional 90-day retention, 365-day hard maximum and seven-day deletion grace for production.
8. Approve no separate Blob content backup/version history and accept provider durability/recovery tradeoff.
9. Name security/privacy incident owners and deletion-worker operator.
10. Approve five-minute maximum scanner/access grant and ten-minute upload grant.

## 25. Phase 8E-B approval checklist

- [ ] Vercel Blob private store is the replacement production provider; AWS implementation remains cancelled.
- [ ] `@vercel/blob` 2.4.0 dependency installation is approved.
- [ ] Presigned direct PUT with OIDC, exact pathname, 10 MiB/type constraints and ten-minute expiry is approved.
- [ ] One immutable pathname with PostgreSQL-only quarantine/approval state is approved.
- [ ] Frankfurt `fra1` target and unresolved contractual CDN/data-location review are acknowledged.
- [ ] Production has no explicit static Blob token; local default remains local-private.
- [ ] Full post-upload read/SHA-256/signature validation is required.
- [ ] Authenticated streaming is selected over signed GET for initial staff access.
- [ ] External production scanner remains a blocker; fake scanner cannot activate production documents.
- [ ] Ten-minute recent authentication is approved or explicitly deferred with download disabled.
- [ ] Vercel Cron is the initial worker mechanism, but no provisioning is authorized yet.
- [ ] No Prisma/schema/migration change is expected.
- [ ] Approval scope is explicitly one of:
  - Phase 8E-B adapter code only, fully mocked/local tests and no store;
  - Phase 8E-B adapter code plus creation of a separate non-production private Blob store and synthetic-only integration test.

Stop after Phase 8E-A until the owner states which scope is approved.
