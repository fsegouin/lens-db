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
