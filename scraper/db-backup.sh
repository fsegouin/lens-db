#!/usr/bin/env bash
# Weekly Postgres backup → Cloudflare R2.
#
# Dumps the Supabase database with pg_dump (custom format, compressed),
# verifies the archive is readable, uploads it to a PRIVATE R2 bucket and
# prunes old copies. Run by .github/workflows/db-backup.yml; runnable locally
# with the same variables.
#
# Required env:
#   BACKUP_DATABASE_URL   session-pooler URL (port 5432). pg_dump needs a
#                         session, so never the 6543 transaction pooler.
#   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
#   R2_BACKUP_BUCKET      a private bucket, NOT the public images bucket.
# Optional:
#   KEEP_WEEKLY   weekly dumps to keep (default 12 ≈ 3 months)
#   KEEP_MONTHLY  monthly dumps to keep (default 12 ≈ 1 year)
#   DRY_RUN=1     dump + verify only, skip upload and prune
#
# Layout in the bucket:
#   weekly/lens-db-YYYY-MM-DD.dump    every run
#   monthly/lens-db-YYYY-MM-DD.dump   the first run of each month (day ≤ 7)
#
# Restore (PG 17+ client, --no-owner/--no-privileges are already baked in):
#   pg_restore --list lens-db-YYYY-MM-DD.dump | grep -v pg_stat_statements > restore.list
#   pg_restore -d "$SESSION_POOLER_URL" --clean --if-exists --use-list restore.list lens-db-YYYY-MM-DD.dump
# See the "Restore gotchas" in the project memory / README: restoring through
# the pooler is slow (~15 min per 10 MB), run it in the background.

set -euo pipefail

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is required}"
KEEP_WEEKLY="${KEEP_WEEKLY:-12}"
KEEP_MONTHLY="${KEEP_MONTHLY:-12}"
DRY_RUN="${DRY_RUN:-0}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Supabase's pooler chain is signed by its own root CA, pinned in the app.
# libpq reads PGSSLROOTCERT, so the URL can keep sslmode=verify-full.
# The PEM sits inside a template literal, so strip the TS prefix/suffix on
# the first and last lines.
sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p' \
  "$repo_root/frontend/src/db/supabase-ca.ts" \
  | sed -e 's/.*-----BEGIN CERTIFICATE-----/-----BEGIN CERTIFICATE-----/' \
        -e 's/-----END CERTIFICATE-----.*/-----END CERTIFICATE-----/' \
  > "$work/supabase-ca.pem"
grep -q 'BEGIN CERTIFICATE' "$work/supabase-ca.pem" || { echo "could not extract Supabase CA" >&2; exit 1; }
export PGSSLROOTCERT="$work/supabase-ca.pem"
export PGSSLMODE=verify-full

today="$(date -u +%Y-%m-%d)"
day_of_month="$(date -u +%d)"
file="lens-db-${today}.dump"
path="$work/$file"

echo "pg_dump → $file"
# The session pooler occasionally drops a long COPY mid-stream ("SSL error:
# unexpected eof while reading"); a fresh attempt normally succeeds.
attempt=1
until pg_dump --format=custom --compress=6 --no-owner --no-privileges \
  --file="$path" "$BACKUP_DATABASE_URL"; do
  if [ "$attempt" -ge 3 ]; then
    echo "pg_dump failed after $attempt attempts" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  echo "pg_dump failed, retrying (attempt $attempt of 3) in 30s" >&2
  rm -f "$path"
  sleep 30
done

# A dump that cannot be listed cannot be restored; fail loudly here rather
# than discovering it on the day it is needed.
entries="$(pg_restore --list "$path" | grep -c '^[0-9]' || true)"
size="$(du -h "$path" | cut -f1)"
echo "dump ok: $size, $entries archive entries"
if [ "$entries" -lt 50 ]; then
  echo "dump looks truncated ($entries entries)" >&2
  exit 1
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY_RUN=1 — skipping upload and prune"
  exit 0
fi

: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
: "${R2_BACKUP_BUCKET:?R2_BACKUP_BUCKET is required}"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto
endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
s3() { aws --endpoint-url "$endpoint" s3 "$@"; }

s3 cp "$path" "s3://${R2_BACKUP_BUCKET}/weekly/${file}" --only-show-errors
echo "uploaded weekly/${file}"
if [ "$day_of_month" -le 7 ]; then
  s3 cp "$path" "s3://${R2_BACKUP_BUCKET}/monthly/${file}" --only-show-errors
  echo "uploaded monthly/${file}"
fi

# Keep the newest N per prefix. Names embed the date, so a plain sort is
# chronological.
prune() {
  local prefix="$1" keep="$2"
  local victims
  victims="$(s3 ls "s3://${R2_BACKUP_BUCKET}/${prefix}/" | awk '{print $4}' | grep '\.dump$' | sort | head -n "-${keep}" || true)"
  for name in $victims; do
    s3 rm "s3://${R2_BACKUP_BUCKET}/${prefix}/${name}" --only-show-errors
    echo "pruned ${prefix}/${name}"
  done
}
prune weekly "$KEEP_WEEKLY"
prune monthly "$KEEP_MONTHLY"

echo "backup complete"
