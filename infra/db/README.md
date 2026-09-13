# Production database

Self-hosted Postgres for thelensdb.com, replacing Supabase Free (whose 5 GB
egress cap the site outgrew). The app on Vercel connects over the public
internet to a Docker Compose stack on a server near Vercel's `cdg1` region
(`frontend/vercel.json` pins the functions there).

## What runs

| Service | Image | Port | Role |
|---|---|---|---|
| `postgres` | `lens-db-postgres` (postgres:17.6 + baked config) | 5432 | Sessions: migrations at Vercel build time, `pg_dump`, psql, admin |
| `pgbouncer` | `lens-db-pgbouncer` (same base, Debian's pgbouncer package) | 6543 | Transaction pooler, the app's `DATABASE_URL` |
| `backup` | postgres:17.6 | none | Nightly `pg_dump` into `./backups`, 14 days kept |
| `ddns` | alpine (profile `ddns`) | none | Keeps `db.thelensdb.com` on the current public IP; skip on a static line |

Same port layout as Supabase, so every URL keeps its meaning: 6543 for the
app, 5432 for anything that needs a session.

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
- Only TCP 5432 and 6543 are reachable from outside; nothing else on the
  server is exposed.

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
├── ddns.sh                   Vercel DNS updater for the ddns service
├── gen-certs.sh              creates the CA and server cert; rewrites db-ca.ts
├── migrate-from-supabase.sh  dump Supabase, restore here, compare row counts
├── .env.example              copy to .env on the server
├── certs/                    gitignored: ca.key stays with the operator, server.* go to the server
└── backups/                  gitignored: nightly dumps on the server
```

## First deploy

1. Certificates, on the operator's machine, once:
   ```bash
   cd infra/db
   DB_HOST=db.thelensdb.com EXTRA_SANS=DNS:<private-name>,IP:<private-ip> ./gen-certs.sh
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
   On a dynamic IP add the DNS updater: create the record once with
   `vercel dns add thelensdb.com db A <ip>`, put the record id and a
   team-scoped token in `.env`, then `docker compose --profile ddns up -d`.
3. Open TCP 5432 and 6543 to the server. Check from outside:
   ```bash
   PGSSLROOTCERT=infra/db/certs/ca.crt psql \
     "postgresql://lensdb:<pw>@db.thelensdb.com:6543/lensdb?sslmode=verify-full" -c 'select 1'
   ```

## Cutover from Supabase

The code side ships first and is harmless on its own: during the cutover
`db-ca.ts` trusted both roots, so production kept working on Supabase until
the env var moved.

1. Land the code (`db-ca.ts`, `pool.ts`, `drizzle.config.ts`, `vercel.json`
   with `cdg1`), let Vercel deploy it.
2. Quiet hour. Writes come from the eBay and DPReview GitHub workflows, the
   hourly `flush-view-counts` cron and community edits; the window below is a
   few minutes, so pause the GitHub workflows (Actions, "Disable workflow")
   and accept the rest.
3. Copy and verify, from the operator's machine:
   ```bash
   export PATH=/opt/homebrew/opt/libpq/bin:$PATH
   SOURCE_URL="$SUPABASE_DATABASE_URL" \
   TARGET_URL="postgresql://lensdb:<pw>@db.thelensdb.com:5432/lensdb?sslmode=verify-full" \
   infra/db/migrate-from-supabase.sh
   ```
   It prints a table of row counts per table and exits non-zero on any
   difference. The dump it took is kept under `~/Work/`.
4. Move the app (all three environments, so preview builds and local dev
   stop touching Supabase too):
   ```bash
   cd frontend
   url='postgresql://lensdb:<pw>@db.thelensdb.com:6543/lensdb?sslmode=verify-full'
   for env in production preview development; do
     vercel env rm DATABASE_URL $env -y
     printf '%s' "$url" | vercel env add DATABASE_URL $env --sensitive
   done
   vercel redeploy <latest production deployment url>
   ```
   Then `DATABASE_URL` in `frontend/.env.local` and the root `.env.local`,
   and `BACKUP_DATABASE_URL` in the GitHub `Production` environment to the
   5432 URL (`gh` is read-only here; GitHub UI).
5. Verify: load `/lenses?search=<nonce>` and watch
   `docker compose logs -f pgbouncer` on the server, or
   `select calls from pg_stat_statements order by calls desc limit 3` move.
   Re-enable the GitHub workflows.
6. Done on 2026-09-13. The Supabase root was dropped from the bundle once the
   project was deleted; the app trusts only `certs/ca.crt` now.

## Day to day

- Logs: `docker compose logs -f postgres` (queries over 1 s are logged).
- Admin: `docker compose exec postgres psql -U postgres -d lensdb`, or any
  client on 5432 with `sslmode=verify-full` (or `verify-ca` when connecting
  by an address that is not in the SAN).
- Hot queries: `select calls, rows, left(query, 80) from pg_stat_statements order by rows desc limit 20;`
- Backups: `ls backups/` on the server (nightly, 14 kept), plus the weekly
  offsite dump to R2 from `.github/workflows/db-backup.yml`. Restore:
  ```bash
  pg_restore --list lensdb-YYYY-MM-DD.dump | grep -vE 'pg_stat_statements|pg_trgm' > restore.list
  pg_restore -d "<5432 url>" --clean --if-exists --no-owner --no-privileges --use-list restore.list lensdb-YYYY-MM-DD.dump
  ```
- Upgrades: bump the tag in both Dockerfiles and in `docker-compose.yml` (the `postgres` image tag and the `backup` service image), then `docker compose up -d --build`.
  Minor versions (17.x) are drop-in; a major version needs a dump and restore.
- Sizing: `postgresql.conf` assumes a shared host; raise `shared_buffers`
  and `effective_cache_size` if there is RAM to spare.

## Feature parity with Supabase Free

| Supabase | Here |
|---|---|
| Postgres 17.6 | postgres:17.6 |
| Transaction pooler on 6543 (Supavisor) | pgbouncer on 6543 |
| Session connections on 5432 | Postgres on 5432 |
| TLS signed by their root CA, pinned in the app | TLS signed by our root CA, pinned in the app, hostname verified |
| `pg_stat_statements` preinstalled | created at first boot, readable by the app role |
| No automated backups on Free | nightly on-box dumps plus the weekly R2 job |
| SQL editor and table view in the dashboard | psql or any client on 5432 |
| Log explorer | `docker compose logs` |
| 5 GB egress per month | none |
| us-east-1, next to Vercel `iad1` | Europe, next to Vercel `cdg1` |
| Managed uptime, patching, hardware | yours |
| Auth, Storage, Realtime, Edge Functions, Data API | never used; nothing to replace |
| Extension catalogue | `pg_trgm` (trigram GIN indexes on `lenses.name` and `cameras.name`) and `pg_stat_statements`, both bundled with the postgres image and created at first boot by `initdb/10-app-role.sh`; anything outside contrib needs `apt-get install postgresql-17-<ext>` in the Dockerfile |
