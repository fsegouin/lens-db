#!/bin/bash
# Writes pgbouncer.ini and the auth file from the environment, installs the
# TLS key with the ownership pgbouncer needs, then runs pgbouncer as the
# postgres user. Only the application role is listed, so the superuser cannot
# come through the pooler at all.
set -euo pipefail

: "${LENSDB_PASSWORD:?LENSDB_PASSWORD is required}"
src="${CERTS_SRC:-/certs-src}"
run=/run/pgbouncer
install -d -m 0700 -o postgres -g postgres "$run"
install -m 0644 -o postgres -g postgres "$src/server.crt" "$run/server.crt"
install -m 0600 -o postgres -g postgres "$src/server.key" "$run/server.key"

# With the CA on hand, verify the server's chain on the hop to Postgres too.
# The hostname is the compose service name, not in the SAN, so verify-ca.
server_tls="server_tls_sslmode = require"
if [ -f "$src/ca.crt" ]; then
  install -m 0644 -o postgres -g postgres "$src/ca.crt" "$run/ca.crt"
  server_tls="server_tls_sslmode = verify-ca
server_tls_ca_file = $run/ca.crt"
fi

# Plaintext in the auth file lets pgbouncer verify SCRAM clients and log in
# to the server with SCRAM; the file lives on a tmpfs, root-owned dir, 0600.
printf '"lensdb" "%s"\n' "$LENSDB_PASSWORD" > "$run/userlist.txt"
chown postgres:postgres "$run/userlist.txt"
chmod 0600 "$run/userlist.txt"

cat > "$run/pgbouncer.ini" <<INI
[databases]
* = host=${PG_HOST:-postgres} port=${PG_PORT:-5432}

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6543
unix_socket_dir =
auth_type = scram-sha-256
auth_file = $run/userlist.txt
pool_mode = transaction
max_client_conn = ${PGBOUNCER_MAX_CLIENT_CONN:-500}
default_pool_size = ${PGBOUNCER_DEFAULT_POOL_SIZE:-20}
min_pool_size = 0
reserve_pool_size = 5
reserve_pool_timeout = 3
server_idle_timeout = 300
server_lifetime = 3600
client_idle_timeout = 0
ignore_startup_parameters = extra_float_digits,options
client_tls_sslmode = require
client_tls_cert_file = $run/server.crt
client_tls_key_file = $run/server.key
client_tls_protocols = tlsv1.2,tlsv1.3
$server_tls
log_connections = 0
log_disconnections = 0
log_pooler_errors = 1
stats_period = 300
INI
chown postgres:postgres "$run/pgbouncer.ini"

exec gosu postgres pgbouncer "$run/pgbouncer.ini"
