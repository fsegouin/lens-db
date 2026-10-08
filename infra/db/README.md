# Production database

Self-hosted Postgres for thelensdb.com. The app on Vercel connects over TLS
to this Docker Compose stack on the server.

## What runs

| Service | Image | Port | Role |
|---|---|---|---|
| `postgres` | `lens-db-postgres` (postgres:17.6 + baked config) | 5432 | Sessions: migrations at Vercel build time, `pg_dump`, psql, admin |
| `pgbouncer` | `lens-db-pgbouncer` (same base, Debian's pgbouncer package) | 6543 | Transaction pooler, the app's `DATABASE_URL` |
| `backup` | postgres:17.6 | none | Nightly `pg_dump` into `./backups`, 14 days kept |

6543 is for the app, 5432 for anything that needs a session.

### Pooler or direct?

Each direct Postgres connection is a server process (a few MB of RAM, a
handshake of some milliseconds). Vercel runs the app as many short-lived
instances, each opening its own small pool, so the connection count is
unpredictable and spiky: a crawler burst or a deploy that empties the page
cache can open more connections than `max_connections` allows, and every one of
them pays the handshake. The transaction pooler keeps about 20 server
connections warm and lends one out per transaction, so 500 app connections
map onto 20 server processes and connecting is nearly free. The price is
that session state (prepared statements by name, `SET`, `LISTEN`, advisory
locks) does not survive a transaction, which is why migrations and dumps use
5432. At the site's current traffic the pooler is insurance rather than a
necessity, but it costs 30 MB of RAM and matches what the code already assumes.

### Security model

- TLS only. `pg_hba.conf` rejects any non-TLS connection from the network.
- The app pins the private root CA (`frontend/src/db/db-ca.ts`) and verifies
  the hostname, so a URL pointing anywhere else fails to connect.
- One network login: `lensdb`, owner of the `lensdb` database, not a superuser.
  The `postgres` superuser is rejected over the network and reachable only
  through `docker compose exec postgres psql`.
- SCRAM-SHA-256 everywhere; the password is 32+ random characters.
- The stack publishes only 5432 and 6543.

## Files

```
infra/db/
├── docker-compose.yml        the stack
├── Dockerfile                postgres:17.6 + postgresql.conf, pg_hba.conf, initdb/
├── entrypoint.sh             installs the TLS key with the ownership Postgres requires
├── postgresql.conf           whole-file server config (TLS, pg_stat_statements, sizing)
├── pg_hba.conf               who may connect, from where, how
├── initdb/10-app-role.sh     first boot: lensdb role + database, pg_stat_statements, pg_trgm
├── pgbouncer/                pooler image and its entrypoint (config from env)
├── backup.sh                 nightly dump loop for the backup service
├── gen-certs.sh              creates the CA and server cert; rewrites db-ca.ts
├── .env.example              copy to .env on the server
├── docker-compose.override.yml  gitignored: host-specific services, merged by docker compose
├── certs/                    gitignored: ca.key stays with the operator, server.* go to the server
└── backups/                  gitignored: nightly dumps on the server
```

## First deploy

1. Certificates, on the operator's machine, once:
   ```bash
   cd infra/db
   DB_HOST=<db-host> EXTRA_SANS=DNS:<other-name>,IP:<other-ip> ./gen-certs.sh
   ```
   Re-running keeps the CA and the issued server cert and only rewrites
   `frontend/src/db/db-ca.ts`; `REISSUE=1` issues a new server cert (to add
   a SAN, say), and the CA stays, so what the app pins is unchanged. Commit
   the regenerated `db-ca.ts`. `certs/ca.key` never goes to the server.
2. Copy `infra/db/` to the server, then on the server:
   ```bash
   cp .env.example .env            # fill POSTGRES_PASSWORD and LENSDB_PASSWORD
   openssl rand -hex 24            # a password: letters and digits only
   rm -f certs/ca.key              # only server.crt, server.key and ca.crt belong here
   docker compose up -d --build
   docker compose ps               # postgres and pgbouncer report healthy
   ```
3. Check from the operator's machine:
   ```bash
   PGSSLROOTCERT=infra/db/certs/ca.crt psql \
     "postgresql://lensdb:<pw>@<db-host>:6543/lensdb?sslmode=verify-full" -c 'select 1'
   ```

## Day to day

- Logs: `docker compose logs -f postgres` (queries over 1 s are logged).
- Admin: `docker compose exec postgres psql -U postgres -d lensdb`, or any
  client on 5432 with `sslmode=verify-full` (or `verify-ca` when connecting
  by an address that is not in the SAN).
- Hot queries: `select calls, rows, left(query, 80) from pg_stat_statements order by rows desc limit 20;`
- Backups: nightly on-box dumps (14 kept), plus the weekly offsite dump in
  `.github/workflows/db-backup.yml`. Restore:
  ```bash
  pg_restore --list lensdb-YYYY-MM-DD.dump | grep -vE 'pg_stat_statements|pg_trgm' > restore.list
  pg_restore -d "<5432 url>" --clean --if-exists --no-owner --no-privileges --use-list restore.list lensdb-YYYY-MM-DD.dump
  ```
- Upgrades: bump the tag in both Dockerfiles and in `docker-compose.yml` (the `postgres` image tag and the `backup` service image), then `docker compose up -d --build`.
  Minor versions (17.x) are drop-in; a major version needs a dump and restore.
- Sizing: `postgresql.conf` is sized for a small database; raise
  `shared_buffers` and `effective_cache_size` if there is RAM to spare.
