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
- Neon PostgreSQL
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

## Notes

- Use `pnpm` for the frontend.
- Database schema and migrations are managed from `frontend/`.
- There are additional ad hoc data-cleanup and migration scripts under `frontend/scripts/`.
