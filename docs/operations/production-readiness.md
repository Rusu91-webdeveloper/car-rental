# Production operational readiness

This runbook records the repository behavior only. It does not claim that any production alert, backup, restore, or worker execution has occurred.

## Background-job map

| Route | Method | Job | Purpose | Authentication | Recommended execution | Production automation |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/cron/cancel-expired-bookings` | `GET` | `cancel-expired-bookings` | Cancels expired transfer bookings, completes finished bookings, and retries the bounded booking-notification outbox. Payments are never inferred from rental completion. | `Authorization: Bearer $CRON_SECRET`; `BOOKING_MAINTENANCE_WORKER_ENABLED=true` | Daily at `02:15 UTC` | Yes; bounded and idempotent database transitions. |
| `/api/cron/phase8fb-maintenance` | `GET` | `application-expiry` | Expires at most 100 stale booking applications. | `Authorization: Bearer $CRON_SECRET`; fixed route allowlist plus Phase 8F-B enable flags | Daily at `03:15 UTC` | Yes; bounded and idempotent. |
| `/api/cron/phase8fb-maintenance` | `GET` | `review-backlog` | Counts pending/stale manual reviews and writes a customer-data-free audit observation. | Same as above; the request cannot select a job | Daily at `03:15 UTC`, sequentially after application expiry | Yes; read-only except audit evidence. |
| `/api/internal/phase8fb/[job]` | `POST` | `stale-review` | Targeted stale-review inspection. | `PHASE8FB_WORKER_SECRET`, explicit environment allowlist, rate limit, and `Idempotency-Key` | Operator initiated | Manual; overlaps the scheduled review-backlog inspection. |
| `/api/internal/phase8fb/[job]` | `POST` | `abandoned-upload-cleanup` | Removes bounded abandoned upload objects and expires sessions. | Same worker controls | Approved maintenance window | Manual; deletes private objects. |
| `/api/internal/phase8fb/[job]` | `POST` | `retention-processing` | Identifies due documents requiring deletion requests. | Same worker controls | Retention-operator review | Manual; legal/retention decision required. |
| `/api/internal/phase8fb/[job]` | `POST` | `orphan-reconciliation` | Lists a bounded Blob page and records opaque orphan findings. | Same worker controls | Operator initiated | Manual; Blob listing cost and findings require review. |
| `/api/internal/phase8fb/[job]` | `POST` | `deletion-processing` | Identifies due documents requiring deletion requests. | Same worker controls | Retention-operator review | Manual; intentionally not destructive automatically. |
| `/api/internal/phase8fb/[job]` | `POST` | `failed-deletion-retry` | Retries at most 50 previously authorized deletion requests. | Same worker controls | Approved incident/maintenance window | Manual; destructive private-object deletion. |

The Phase 8F-B allowlist contains exactly: `review-backlog`, `stale-review`, `application-expiry`, `abandoned-upload-cleanup`, `retention-processing`, `orphan-reconciliation`, `deletion-processing`, and `failed-deletion-retry`.

## Vercel Cron schedules

`vercel.json` contains two conservative daily entries. Vercel currently permits up to 100 cron entries per project on Hobby, but Hobby expressions may run only once per day:

- `15 2 * * *` → `/api/cron/cancel-expired-bookings`
- `15 3 * * *` → `/api/cron/phase8fb-maintenance`

Vercel schedules are UTC. Europe/Bucharest equivalents are:

| UTC | Bucharest during EET (UTC+2) | Bucharest during EEST (UTC+3) |
| --- | --- | --- |
| 02:15 | 04:15 | 05:15 |
| 03:15 | 05:15 | 06:15 |

Hobby scheduling has hourly precision rather than guaranteed minute precision. The first job may therefore run during 02:00–02:59 UTC (04:00–04:59 EET / 05:00–05:59 EEST), and the second during 03:00–03:59 UTC (05:00–05:59 EET / 06:00–06:59 EEST). The separate UTC hours and sequential Phase 8F-B dispatch reduce overlap.

Booking maintenance has a 50-second application deadline. Each of the two sequential Phase 8F-B jobs has a maximum 20-second deadline, while the whole batch has a 45-second request deadline. Remaining time is recalculated before each job, keeping the request below the 60-second route limit. That remains within both the non-Fluid Hobby maximum and the higher Fluid Compute limit.

## Execution protection and evidence

Every automatic or manual run receives a server-generated invocation ID. Cron deduplication keys use the UTC schedule day; manual runs require a caller-supplied `Idempotency-Key` of 16–128 safe characters. The database enforces unique deduplication keys.

`WorkerLease` allows one active run per concrete job. A lease expires after 60 seconds so a crashed function cannot block the job permanently. Each item records trigger source, environment, deployment reference when available, start/completion time, status, bounded counts, and a sanitized failure code/summary. Customer IDs, document IDs, Blob paths, payloads, tokens, and raw exception messages are not stored.

The readiness page requires a successful execution of every scheduled job within 48 hours. Set `PRODUCTION_WORKERS_ENABLED_AT` once, to the UTC ISO-8601 timestamp when both Production worker switches were enabled. Until the first cron evidence arrives, this anchors a one-time 48-hour `PENDING` grace so a deployment made after the daily windows is not immediately mislabeled stale. An invalid, missing, or future timestamp grants no grace; after 48 hours, missing evidence becomes stale. Environment variables alone cannot make the worker check ready. `PARTIAL` and `FAILED` runs are failing; missing/old runs after the grace are stale.

## Alert-delivery verification

Configure `PRODUCTION_ALERT_RECIPIENT` to an approved operational mailbox and deliberately assign `PRODUCTION_ALERT_OWNER`. An authenticated user with `security.audit.view` can call:

```text
POST /api/internal/production-readiness/alert-test
```

The message subject begins with `[TEST ONLY]`. A database uniqueness guard permits at most one request per production hour. Requested and failed provider attempts are recorded without storing the recipient. Provider acceptance returns an evidence ID but does **not** prove inbox delivery and does not make readiness pass.

After an operational user actually observes the message in the approved alert destination, a user with `security.audit.view` must confirm that same evidence ID through:

```text
POST /api/internal/production-readiness/alert-test/<evidence-id>
{ "result": "DELIVERED" }
```

Use `{ "result": "NOT_DELIVERED", "notes": "<safe failure summary>" }` when the message is not received. Only an explicit authenticated `DELIVERED` confirmation creates successful evidence valid for 30 days. URLs, credentials, and credential-like values are rejected from operational notes.

`PRODUCTION_ALERTING_ATTESTED` is retained only as a legacy compatibility variable. It must remain `false` and no longer grants readiness. Only durable successful delivery evidence can make the check ready.

## Genuine backup verification

These commands must run only from an approved administrative workstation with `pg_dump`, `pg_restore`, `psql`, and access to an approved encrypted destination. Never paste database URLs into tickets, logs, or evidence notes.

1. Export the approved production and isolated-restore URLs only in the current shell:

   ```bash
   read -s 'PROD_DATABASE_URL?Production database URL: '
   printf '\n'
   read -s 'RESTORE_DATABASE_URL?Empty isolated restore database URL: '
   printf '\n'
   export PROD_DATABASE_URL RESTORE_DATABASE_URL
   ```

2. Create a private temporary directory and a custom-format archive:

   ```bash
   backup_dir="$(mktemp -d)"
   chmod 700 "$backup_dir"
   backup_file="$backup_dir/car-rental-production.dump"
   pg_dump --dbname="$PROD_DATABASE_URL" --format=custom --no-owner --no-acl --file="$backup_file"
   test -s "$backup_file"
   shasum -a 256 "$backup_file"
   ```

3. Validate the archive catalog without restoring it:

   ```bash
   pg_restore --list "$backup_file" >/dev/null
   ```

4. Derive a safe database fingerprint without persisting the URL:

   ```bash
   database_fingerprint="$(PROD_DATABASE_URL="$PROD_DATABASE_URL" node -e 'const { createHash } = require("node:crypto"); const url = new URL(process.env.PROD_DATABASE_URL); process.stdout.write(createHash("sha256").update(`${url.hostname}${url.pathname}`).digest("hex"))')"
   printf '%s\n' "$database_fingerprint"
   ```

5. Record a successful `BACKUP` evidence item only after the archive and catalog checks succeed. Use the protected endpoint with an authenticated operational session and a unique idempotency key:

   ```json
   {
     "type": "BACKUP",
     "verifiedAt": "<actual ISO-8601 completion time>",
     "databaseFingerprint": "<safe SHA-256 fingerprint>",
     "result": "SUCCEEDED",
     "notes": "Archive stored in the approved encrypted destination; checksum retained in the private operations record."
   }
   ```

## Genuine restore rehearsal

The restore target must be empty, isolated, and disposable. It must never be the production database.

1. Confirm the target identity and that it is not the production URL:

   ```bash
   test "$RESTORE_DATABASE_URL" != "$PROD_DATABASE_URL"
   psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'select current_database(), current_user;'
   ```

2. Run the repository's guarded dump/restore/count-comparison rehearsal. The guard requires an explicit synthetic-target confirmation, verifies the source and target differ, requires an empty target, restores with fail-fast options, and compares critical table counts:

   ```bash
   PRODUCTION_RESTORE_REHEARSAL_CONFIRMED=synthetic-only \
   SOURCE_DATABASE_URL="$PROD_DATABASE_URL" \
   RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" \
   pnpm production:verify-restore
   ```

3. Run structural invariants against the restored target:

   ```bash
   DATABASE_URL="$RESTORE_DATABASE_URL" pnpm prisma migrate status
   psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'select count(*) from "_prisma_migrations" where finished_at is not null;'
   psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'select count(*) from "WorkerExecution";'
   ```

4. Record a successful `RESTORE` evidence item only after every command succeeds. Submit it to the protected recovery-evidence endpoint with a new idempotency key and the same safe database fingerprint.

5. Securely remove the temporary archive according to the approved retention policy and destroy the isolated restore target. Unset both URLs:

   ```bash
   unset PROD_DATABASE_URL RESTORE_DATABASE_URL
   rm -rf "$backup_dir"
   ```

Failed attempts must be recorded with `result: "FAILED"` and safe `failureDetails`; do not include URLs, credentials, customer data, or raw dumps. The readiness page requires backup success within 24 hours and restore success within 90 days. `DATABASE_BACKUP_VERIFIED_AT` and `DATABASE_RESTORE_VERIFIED_AT` are legacy inputs and are intentionally ignored.

## Ownership configuration

The following production-only protected configuration values must be deliberately assigned:

- `PRODUCTION_OWNER`
- `PRODUCTION_ALERT_OWNER`
- `DATABASE_RECOVERY_OWNER`
- `WORKER_MAINTENANCE_OWNER`
- `PRODUCTION_ALERT_RECIPIENT`

The protected readiness page displays whether each role is configured, but it does not expose the alert recipient or any credential.
