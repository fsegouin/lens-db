# The Lens DB

The Lens DB is a camera and lens database project built from archived `lens-db.com` data and extended with a modern web frontend, admin tooling, and data-cleanup scripts.

## Repo Layout

- `frontend/`
  Next.js application for browsing lenses, cameras, systems, collections, comparisons, ratings, submissions, user accounts, AI chat, eBay price history, and admin workflows.

- `mcp-server/`
  TypeScript MCP server exposing lens/camera search, detail, price, and compatibility tools. Its tool implementations are also consumed by the frontend chat via the `lens-db-mcp-server` workspace dependency.

- `scraper/`
  Python tools for discovering archived pages, downloading them from the Wayback Machine, parsing structured data, and importing it into PostgreSQL, plus Node scripts (eBay price scrapers and the DPReview new-lens watcher) run via GitHub Actions in `.github/workflows/` or manually against the `/api/cron/*` endpoints.

- `docs/`
  Project notes and implementation plans.

## Main App

The frontend lives in [`frontend/`](frontend/) and uses:

- Next.js 16
- React 19
- TypeScript
- Drizzle ORM
- Supabase PostgreSQL
- Tailwind CSS v4
- Upstash Redis for rate limiting
- Vercel AI SDK (AI Gateway) for chat, price classification, and DPReview import dedupe/audit checks
- Resend for verification emails
- Cloudflare R2 for image storage

See [`frontend/CLAUDE.md`](frontend/CLAUDE.md) for architecture and app-specific details.

### Run Locally

```bash
pnpm install   # from the repo root (pnpm workspace: frontend + mcp-server)
cd frontend
pnpm dev
```

Required environment variables include:

- `DATABASE_URL`
- `SESSION_SECRET`
- `RATE_HASH_SALT`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

See [`frontend/.env.example`](frontend/.env.example) for the full list.

## Scraper

The scraper lives in [`scraper/`](scraper/) and is used to rebuild or extend the dataset from archived The Lens DB pages.

### Basic Flow

```bash
cd scraper
pip install -r requirements.txt
python discover_urls.py --output urls.json
python fetch_pages.py --input urls.json --output-dir pages/
python parse_lenses.py --input-dir pages/ --output data.json
python import_to_db.py --input data.json
```

See [`scraper/README.md`](scraper/README.md) for the full scraper workflow.

## Catalogue Gap Scanning

Two read-only scanners compare our `cameras` table against an outside catalogue and report the bodies we do not have. Both are safe to run repeatedly: they only read, and print (or write with `--json`) a candidate list for a human to work through.

```bash
cd frontend
node scripts/scan-libraw-gaps.mjs --json libraw-gaps.json
node scripts/scan-camera-wiki-gaps.mjs --json camera-wiki-gaps.json
```

| Scanner | Source | Covers |
|---|---|---|
| `scan-libraw-gaps.mjs` | [LibRaw](https://github.com/LibRaw/LibRaw)'s `cameralist.cpp` — one plain-text file, no key, no rate limit | Every camera that writes a raw file, so the digital era |
| `scan-camera-wiki-gaps.mjs` | [camera-wiki.org](https://camera-wiki.org) via its MediaWiki `api.php`, by brand category | ~10,000 articles weighted to film-era Western and consumer cameras |

Both share `scripts/lib/catalogue-match.mjs`, which decides when two names are the same camera — LibRaw reports the EXIF model code (`ILCE-7M3`) where we store the marketing name (`Sony a7 III`), and camera-wiki uses the collectors' title. `scripts/lib/catalogue-match.test.mjs` pins that behaviour in both directions: names that must match, and near-identical bodies (`EOS 5D` vs `EOS 5DS`, `D3` vs `D300`) that must not, since a false match hides a genuinely missing camera. Run it with `pnpm test`.

The scanners deliberately report rather than import. Neither list is clean enough to load unattended: camera-wiki mixes accessories into brand categories (pages it cannot classify are listed separately for review), and LibRaw includes phones, drones and digital backs. camera-wiki is CC BY-SA, so anything taken from it needs attribution.

## Database Backups

Supabase Free has no automated backups, so [`.github/workflows/db-backup.yml`](.github/workflows/db-backup.yml) runs [`scraper/db-backup.sh`](scraper/db-backup.sh) every Sunday at 03:00 UTC: `pg_dump` (custom format, compressed), a `pg_restore --list` sanity check, upload to a **private** R2 bucket, and pruning to the newest 12 weekly and 12 monthly copies (a dump made in the first week of a month is also kept under `monthly/`).

Repository secrets it needs (Settings → Secrets → Actions, environment `production`):

| Secret | Value |
|---|---|
| `BACKUP_DATABASE_URL` | Supabase **session** pooler URL (port 5432, `sslmode=verify-full`). Never the 6543 transaction pooler — `pg_dump` needs a session. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | An R2 API token scoped to the backup bucket |
| `R2_BACKUP_BUCKET` | A private bucket, separate from the public images bucket |

Run it by hand with **Run workflow** (tick *dry run* to only dump and verify), or locally:

```bash
BACKUP_DATABASE_URL="$SUPABASE_DATABASE_URL" DRY_RUN=1 bash scraper/db-backup.sh
```

Restore with a PostgreSQL 17+ client. The dump already carries `--no-owner --no-privileges`; drop `pg_stat_statements` from the list because Supabase preinstalls it, and run the restore in the background because the pooler is slow (~15 min per 10 MB):

```bash
pg_restore --list lens-db-YYYY-MM-DD.dump | grep -v pg_stat_statements > restore.list
pg_restore -d "$SUPABASE_DATABASE_URL" --clean --if-exists --use-list restore.list lens-db-YYYY-MM-DD.dump
```

## Notes

- Use `pnpm` for the frontend.
- Database schema and migrations are managed from `frontend/`.
- There are additional ad hoc data-cleanup and migration scripts under `frontend/scripts/`.
