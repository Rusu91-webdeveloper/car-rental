#!/usr/bin/env bash
set -euo pipefail

if [[ "${PRODUCTION_RESTORE_REHEARSAL_CONFIRMED:-}" != "synthetic-only" ]]; then
  echo "Refusing restore rehearsal without PRODUCTION_RESTORE_REHEARSAL_CONFIRMED=synthetic-only" >&2
  exit 2
fi
: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"

for command in pg_dump pg_restore psql; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 2; }
done

source_identity="$(psql "$SOURCE_DATABASE_URL" -Atqc "select current_database() || '@' || coalesce(inet_server_addr()::text, 'local') || ':' || inet_server_port()")"
restore_identity="$(psql "$RESTORE_DATABASE_URL" -Atqc "select current_database() || '@' || coalesce(inet_server_addr()::text, 'local') || ':' || inet_server_port()")"
if [[ "$source_identity" == "$restore_identity" ]]; then
  echo "Source and restore targets must be different databases" >&2
  exit 2
fi
if [[ -n "$(psql "$RESTORE_DATABASE_URL" -Atqc "select tablename from pg_tables where schemaname='public' limit 1")" ]]; then
  echo "Restore target must have an empty public schema" >&2
  exit 2
fi

archive="$(mktemp "${TMPDIR:-/tmp}/car-rental-restore.XXXXXX")"
trap 'rm -f "$archive"' EXIT
pg_dump --format=custom --no-owner --no-acl --dbname="$SOURCE_DATABASE_URL" --file="$archive"
pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "$archive"

summary_sql="select json_build_object(
  'migrations', (select count(*) from \"_prisma_migrations\" where finished_at is not null and rolled_back_at is null),
  'users', (select count(*) from \"User\"),
  'bookings', (select count(*) from \"Booking\"),
  'applications', (select count(*) from \"BookingApplication\"),
  'auditEvents', (select count(*) from \"AuditEvent\"),
  'documents', (select count(*) from \"CustomerDocument\"),
  'workerExecutions', (select count(*) from \"WorkerExecution\")
)::text"
source_summary="$(psql "$SOURCE_DATABASE_URL" -Atqc "$summary_sql")"
restore_summary="$(psql "$RESTORE_DATABASE_URL" -Atqc "$summary_sql")"
if [[ "$source_summary" != "$restore_summary" ]]; then
  echo "Restore verification failed: critical table counts differ" >&2
  exit 1
fi

if command -v sha256sum >/dev/null; then
  checksum="$(sha256sum "$archive" | awk '{print $1}')"
else
  checksum="$(shasum -a 256 "$archive" | awk '{print $1}')"
fi
echo "Restore verification passed"
echo "Archive SHA-256: $checksum"
echo "Critical counts: $restore_summary"
