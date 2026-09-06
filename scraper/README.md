# Lens-DB Scraper

Scrapes archived lens-db.com pages from the Wayback Machine and extracts structured lens/camera data.

## Setup

```bash
pip install -r requirements.txt
```

## Usage

### Step 1: Discover URLs

```bash
python discover_urls.py --output urls.json
```

This queries the Wayback Machine CDX API and finds all archived lens-db.com HTML pages.

### Step 2: Download Pages

```bash
# Fetch lens, system, and camera pages (default)
python fetch_pages.py --input urls.json --output-dir pages/ --delay 1.0

# Fetch only specific categories
python fetch_pages.py --categories lens,system --max-pages 100

# Resume interrupted download (automatic)
python fetch_pages.py
```

The fetcher saves progress automatically and can resume from where it left off.

### Step 3: Parse Data

```bash
python parse_lenses.py --input-dir pages/ --output data.json
```

Extracts structured data (specs, descriptions, images, system info) from the downloaded HTML pages.

### Step 4: Import to Database

```bash
python import_to_db.py --input data.json
```

Imports the parsed data into the Supabase PostgreSQL database. Requires `DATABASE_URL` environment variable.

The Python scripts hand `DATABASE_URL` straight to psycopg2. Supabase signs its pooler certificates with its own root CA, so either use `sslmode=require` in that URL or add `sslrootcert=<path to frontend/src/db/supabase-ca.ts's PEM>` alongside `sslmode=verify-full`.

## Output Format

The `data.json` file contains:

```json
{
  "lenses": [...],
  "systems": [...],
  "cameras": [...],
  "other": [...]
}
```

Each lens entry has: `name`, `specs` (key-value), `description`, `images`, `system`, `breadcrumbs`.

## Node scripts (GitHub Actions / CLI)

The `.mjs` scripts talk to the deployed app's `/api/cron/*` endpoints, authenticated with a `CRON_SECRET` Bearer token. Common env: `API_URL` (default `https://thelensdb.com`), `CRON_SECRET`.

- `ebay-scrape-action.mjs` / `ebay-lens-scrape-action.mjs` — eBay sold-listing price scrapers for cameras/lenses (`.github/workflows/ebay-prices.yml`, `ebay-lens-prices.yml`); scrape with Playwright and POST listings to `/api/cron/ebay-prices` / `/api/cron/ebay-lens-prices` for LLM classification.
- `dpreview-watch-action.mjs` — DPReview new-product watcher, for both lenses and camera bodies. `ENTITY=lenses` (default) scans the lens index and POSTs to `/api/cron/dpreview-lenses` (`.github/workflows/dpreview-new-lenses.yml`, Mondays 09:00 UTC); `ENTITY=cameras` scans the camera index and POSTs to `/api/cron/dpreview-cameras` (`dpreview-new-cameras.yml`, Mondays 10:00 UTC). Env: `PAGES` (index pages to scan, default 1), `LIMIT`.
  Camera product links carry the category segment a body was first filed under — mirrorless and DSLRs alike under `/slrs/`, fixed-lens bodies under `/compacts/`, only the newest under `/cameras/` — so the script matches all three. `/actioncams/` is deliberately not collected (the database holds no GoPro/DJI/Insta360 bodies); the script logs any category segment it does not recognise rather than skipping it silently.
- `dpreview-review-cli.mjs` — interactive CLI for uncertain DPReview duplicate candidates via `/api/cron/dpreview-review` (or `/api/cron/dpreview-camera-review` with `ENTITY=cameras`): mark each as duplicate, new, version-group member (lenses only), or skip. Cameras have no version groups — a successor body is its own record, so answer "new".
- `dpreview-audit-cli.mjs` — LLM audit of DPReview-extracted specs via `/api/cron/dpreview-audit`; writes `dpreview-audit-report.json` in the working directory. Env: `ENTITY` (`lenses` default, `cameras`, or `all`), `LIMIT`, `CREATE_EDITS=1` (file findings as pending edits), `RECENT_HOURS` (only recent candidates; the watcher workflows pass 192), `AFTER_ID` (resume). Also runs as the second step of each watcher workflow.
- `mir-nikkor-scrape.mjs` — one-off crawler for mir.com.my's Nikkor Resources tree (Leofoo's Nikon reference). Extracts spec blocks, model designations, introduction years and image URLs into `mir-nikkor.json`. Takes **facts only**: the body prose is the site owner's own writing and the photographs carry third-party credits, so image URLs are recorded for a permission request and nothing is downloaded. Args: `--limit`, `--delay`, `--seed`, `--out`. Map the result onto our rows with `frontend/scripts/map-mir-to-lenses.mjs`.
  Body pages use the same `Key : Value` layout with a different vocabulary, so the parser carries both and tags each page `kind: "lens" | "camera"`.
