#!/bin/bash
# Postgres refuses a private key that is not 0600 and owned by the server
# user. The host mounts certs/ read-only with whatever owner it has, so copy
# them into a tmpfs with the right ownership before handing over to the stock
# entrypoint (which drops to the postgres user itself).
set -euo pipefail

src="${CERTS_SRC:-/certs-src}"
dst=/run/certs
for f in server.crt server.key; do
  [ -f "$src/$f" ] || { echo "missing $src/$f (run infra/db/gen-certs.sh)" >&2; exit 1; }
done
install -d -m 0700 -o postgres -g postgres "$dst"
install -m 0644 -o postgres -g postgres "$src/server.crt" "$dst/server.crt"
install -m 0600 -o postgres -g postgres "$src/server.key" "$dst/server.key"

exec docker-entrypoint.sh "$@"
