#!/usr/bin/env bash
# Copies the production database from Supabase into the self-hosted box, then
# compares row counts table by table. Run it from the operator's machine with a
# PostgreSQL 17+ client (/opt/homebrew/opt/libpq/bin). Safe to re-run: the
# target's objects are dropped and recreated from the dump each time.
#
#   SOURCE_URL  Supabase session pooler URL (port 5432): SUPABASE_DATABASE_URL in .env.local
#   TARGET_URL  postgresql://lensdb:<pw>@<host>:5432/lensdb?sslmode=verify-full
#               Session port, never 6543. Host must be in the cert's SAN for
#               verify-full (db.thelensdb.com); by a private address use
#               sslmode=verify-ca or add the address with EXTRA_SANS in gen-certs.sh.
#   DUMP_FILE   optional: restore an existing dump instead of taking a fresh one
#
# Freeze writes before the real cutover (see README.md) or the counts drift.
set -euo pipefail

: "${SOURCE_URL:?SOURCE_URL is required}"
: "${TARGET_URL:?TARGET_URL is required}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# One bundle for both sides: ours for the target, plus the Supabase root for
# the source when supabase-root-2021.crt sits next to this script (needed only
# if SOURCE_URL asks for sslmode=verify-ca or verify-full).
cat "$here/certs/ca.crt" > "$work/ca-bundle.pem"
[ -f "$here/supabase-root-2021.crt" ] && cat "$here/supabase-root-2021.crt" >> "$work/ca-bundle.pem"
export PGSSLROOTCERT="$work/ca-bundle.pem"

dump="${DUMP_FILE:-$HOME/Work/lens-db-supabase-$(date -u +%Y-%m-%dT%H%M%SZ).dump}"
if [ -z "${DUMP_FILE:-}" ]; then
  echo "pg_dump from Supabase -> $dump"
  attempt=1
  # Only the app's schemas. A full dump of a Supabase project also carries
  # its event triggers and extension plumbing, which a non-superuser cannot
  # restore.
  until pg_dump --format=custom --compress=6 --no-owner --no-privileges \
      --schema=public --schema=drizzle --file="$dump" "$SOURCE_URL"; do
    [ "$attempt" -ge 3 ] && { echo "pg_dump failed after $attempt attempts" >&2; exit 1; }
    attempt=$((attempt + 1)); echo "pg_dump failed, retry $attempt of 3 in 30s" >&2; rm -f "$dump"; sleep 30
  done
fi
entries="$(pg_restore --list "$dump" | grep -c '^[0-9]' || true)"
echo "dump: $(du -h "$dump" | cut -f1), $entries entries"
[ "$entries" -ge 50 ] || { echo "dump looks truncated" >&2; exit 1; }

# Restore only what belongs to the app: objects in public and drizzle, plus
# the drizzle schema itself (public already exists). Extensions, event
# triggers and anything Supabase-owned stay out, whatever the dump contains;
# the extensions the schema needs (pg_trgm, pg_stat_statements) are created
# by initdb/10-app-role.sh, so the indexes that depend on them restore fine.
pg_restore --list "$dump" \
  | grep -E '^[0-9]+; .* (public|drizzle) |^[0-9]+; .* SCHEMA - drizzle ' \
  | grep -vE ' (EXTENSION|EVENT TRIGGER) |pg_stat_statements' \
  > "$work/restore.list"
[ -s "$work/restore.list" ] || { echo "restore list is empty" >&2; exit 1; }
echo "pg_restore into target"
pg_restore -d "$TARGET_URL" --clean --if-exists --no-owner --no-privileges \
  --use-list "$work/restore.list" "$dump"
psql "$TARGET_URL" -X -q -c "ANALYZE"

echo
printf '%-40s %12s %12s\n' table source target
mismatch=0
tables="$(psql "$SOURCE_URL" -X -tA -c "select schemaname||'.'||tablename from pg_tables where schemaname in ('public','drizzle') order by 1")"
for t in $tables; do
  s="$(psql "$SOURCE_URL" -X -tA -c "select count(*) from $t")"
  d="$(psql "$TARGET_URL" -X -tA -c "select count(*) from $t")"
  flag=""
  [ "$s" = "$d" ] || { flag="  <-- differs"; mismatch=1; }
  printf '%-40s %12s %12s%s\n' "$t" "$s" "$d" "$flag"
done
echo
if [ "$mismatch" = 0 ]; then
  echo "all tables match"
else
  echo "row counts differ: either writes landed on the source after the dump, or the restore is incomplete" >&2
  exit 2
fi
