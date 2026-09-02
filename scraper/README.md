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

Imports the parsed data into the Neon PostgreSQL database. Requires `DATABASE_URL` environment variable.

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
- `dpreview-lens-watch-action.mjs` — DPReview new-lens watcher (`.github/workflows/dpreview-new-lenses.yml`, Mondays 09:00 UTC): scans the DPReview lens index for unseen products and POSTs candidates to `/api/cron/dpreview-lenses`. Env: `PAGES` (index pages to scan, default 1), `LIMIT`.
- `dpreview-review-cli.mjs` — interactive CLI for uncertain DPReview duplicate candidates via `/api/cron/dpreview-review`: mark each as duplicate, new lens, version-group member, or skip.
- `dpreview-audit-cli.mjs` — LLM audit of DPReview-extracted specs via `/api/cron/dpreview-audit`; writes `dpreview-audit-report.json` in the working directory. Env: `LIMIT`, `CREATE_EDITS=1` (file findings as pending edits), `RECENT_HOURS` (only recent candidates; the watcher workflow passes 192), `AFTER_ID` (resume). Also runs as the second step of the watcher workflow.
