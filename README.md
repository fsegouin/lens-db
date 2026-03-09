# Lens DB

Lens DB is a camera and lens database project built from archived `lens-db.com` data and extended with a modern web frontend, admin tooling, and data-cleanup scripts.

## Repo Layout

- `frontend/`
  Next.js application for browsing lenses, cameras, systems, collections, comparisons, ratings, submissions, and admin workflows.

- `scraper/`
  Python tools for discovering archived pages, downloading them from the Wayback Machine, parsing structured data, and importing it into PostgreSQL.

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

See [`frontend/README.md`](frontend/README.md) for architecture and app-specific details.

### Run Locally

```bash
cd frontend
pnpm install
pnpm dev
```

Required environment variables include:

- `DATABASE_URL`
- `RATE_HASH_SALT`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `ADMIN_PASSWORD`

## Scraper

The scraper lives in [`scraper/`](scraper/) and is used to rebuild or extend the dataset from archived Lens DB pages.

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
