#!/bin/bash
# Nightly pg_dump of lensdb into /backups (custom format, compressed), pruned
# after BACKUP_KEEP_DAYS. This is the on-box copy; the offsite copy is the
# weekly GitHub workflow that dumps to R2 (scraper/db-backup.sh).
#
# Restore one:
#   pg_restore --list lensdb-YYYY-MM-DD.dump | grep -vE 'pg_stat_statements|pg_trgm' > restore.list
#   pg_restore -d "$SESSION_URL" --clean --if-exists --no-owner --no-privileges \
#     --use-list restore.list lensdb-YYYY-MM-DD.dump
set -euo pipefail

: "${BACKUP_KEEP_DAYS:=14}"
: "${BACKUP_HOUR_UTC:=03}"
: "${BACKUP_ON_START:=0}"
mkdir -p /backups

dump() {
  local file
  file="/backups/lensdb-$(date -u +%Y-%m-%d).dump"
  rm -f /backups/lensdb-*.dump.tmp
  if pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$file.tmp"; then
    mv "$file.tmp" "$file"
    local entries
    entries="$(pg_restore --list "$file" | grep -c '^[0-9]' || true)"
    echo "$(date -u +%FT%TZ) backup ok: $file ($(du -h "$file" | cut -f1), $entries entries)"
  else
    rm -f "$file.tmp"
    echo "$(date -u +%FT%TZ) backup FAILED" >&2
  fi
  find /backups -name 'lensdb-*.dump' -mtime "+${BACKUP_KEEP_DAYS}" -delete
}

[ "$BACKUP_ON_START" = "1" ] && dump

while true; do
  now="$(date -u +%s)"
  target="$(date -u -d "${BACKUP_HOUR_UTC}:00" +%s)"
  [ "$target" -le "$now" ] && target=$((target + 86400))
  sleep $((target - now))
  dump
done
