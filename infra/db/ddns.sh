#!/bin/sh
# Keeps the A record for DDNS_HOSTNAME on Vercel DNS pointed at this box's
# current public IPv4. Skip the whole service (it is behind the "ddns" compose
# profile) if the line has a static address.
#
# One-time setup:
#   vercel dns add thelensdb.com db A <current ip>
#   vercel dns ls thelensdb.com          # copy the record id into .env
#   token: vercel.com/account/tokens, scoped to the team
set -eu

: "${VERCEL_TOKEN:?VERCEL_TOKEN is required}"
: "${VERCEL_DNS_RECORD_ID:?VERCEL_DNS_RECORD_ID is required}"
: "${DDNS_HOSTNAME:=db.thelensdb.com}"
: "${DDNS_INTERVAL:=300}"
team="${VERCEL_TEAM_ID:+?teamId=$VERCEL_TEAM_ID}"

while true; do
  ip="$(curl -4 -fsS --max-time 10 https://api.ipify.org || true)"
  current="$(dig +short A "$DDNS_HOSTNAME" @ns1.vercel-dns.com 2>/dev/null | head -n 1 || true)"
  if [ -n "$ip" ] && [ "$ip" != "$current" ]; then
    if curl -fsS --max-time 15 -X PATCH \
        "https://api.vercel.com/v1/domains/records/${VERCEL_DNS_RECORD_ID}${team}" \
        -H "Authorization: Bearer $VERCEL_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"value\":\"$ip\"}" >/dev/null; then
      echo "$(date -u +%FT%TZ) $DDNS_HOSTNAME: ${current:-unset} -> $ip"
    else
      echo "$(date -u +%FT%TZ) update to $ip failed" >&2
    fi
  fi
  sleep "$DDNS_INTERVAL"
done
