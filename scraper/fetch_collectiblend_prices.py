"""
Step 3: Fetch price data from CollectiBlend for matched entries.

Scrapes individual camera/lens pages for:
  - Average price index (Average / Very Good / Mint ranges)
  - Historical sale prices (date, condition, price, source)

Stores results in the database with extraction timestamps.

Usage:
    DATABASE_URL="postgresql://..." python fetch_collectiblend_prices.py \
        [--matches collectiblend_matches.json] \
        [--type cameras] [--type lenses] \
        [--delay 2.0] \
        [--limit 0]
"""

import argparse
import json
import os
import re
import ssl
import time

import psycopg2
from psycopg2.extras import Json
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
from bs4 import BeautifulSoup


class SSLAdapter(HTTPAdapter):
    """Custom SSL adapter to work around Python 3.14 + OpenSSL 3.6 issues."""
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.check_hostname = True
        ctx.verify_mode = ssl.CERT_REQUIRED
        ctx.load_default_certs()
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)

DATABASE_URL = os.environ.get("DATABASE_URL")

BASE_URL = "https://collectiblend.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Source icon filenames to human-readable names
SOURCE_ICONS = {
    "EB.PNG": "eBay",
    "CA.PNG": "Catawiki",
    "LP.PNG": "LP Foto Auction",
    "PW.PNG": "Photographica World",
    "WL.PNG": "WestLicht Auction",
    "CH.PNG": "Christie's",
    "SAS.PNG": "Special Auction Services",
    "HK.PNG": "Hake's Auction",
    "EV.PNG": "Everard & Company",
    "DN.PNG": "Dave Nosek Price Guide",
    "FL.PNG": "Flints Auctions",
    "WC.PNG": "Wetzlar Camera Auctions",
    "CW.PNG": "Chiswick Auctions",
    "CB.PNG": "CollectiBlend Member",
    "TM.PNG": "Tamarkin Auction",
}

REQUEST_DELAY = 2.0


def get_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is required")
    return psycopg2.connect(DATABASE_URL)


def ensure_price_tables(conn):
    """Create the price data tables if they don't exist."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS price_estimates (
                id SERIAL PRIMARY KEY,
                entity_type TEXT NOT NULL,
                entity_id INTEGER NOT NULL,
                source_url TEXT,
                source_name TEXT,
                price_average_low INTEGER,
                price_average_high INTEGER,
                price_very_good_low INTEGER,
                price_very_good_high INTEGER,
                price_mint_low INTEGER,
                price_mint_high INTEGER,
                currency TEXT DEFAULT 'USD',
                rarity TEXT,
                rarity_votes INTEGER,
                extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(entity_type, entity_id)
            )
        """)
        # Add rarity columns if they don't exist (for existing tables)
        for col, col_type in [("rarity", "TEXT"), ("rarity_votes", "INTEGER")]:
            try:
                cur.execute(f"ALTER TABLE price_estimates ADD COLUMN {col} {col_type}")
            except Exception:
                conn.rollback()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS price_history (
                id SERIAL PRIMARY KEY,
                entity_type TEXT NOT NULL,
                entity_id INTEGER NOT NULL,
                sale_date DATE,
                condition TEXT,
                price_usd INTEGER,
                source TEXT,
                extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_price_estimates_entity
            ON price_estimates(entity_type, entity_id)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_price_history_entity
            ON price_history(entity_type, entity_id)
        """)
    conn.commit()


def parse_price_range(text: str) -> tuple[int | None, int | None]:
    """Parse a price range like '$80-90' or '$100-120' into (low, high)."""
    text = text.strip().replace(",", "")
    # Handle ranges like $80-90, $100-120, $1,200-1,500
    match = re.match(r"\$(\d+)\s*-\s*(\d+)", text)
    if match:
        return int(match.group(1)), int(match.group(2))
    # Handle single values like $80
    match = re.match(r"\$(\d+)", text)
    if match:
        val = int(match.group(1))
        return val, val
    return None, None


def parse_price_value(text: str) -> int | None:
    """Parse a single price like '$112' into an integer."""
    text = text.strip().replace(",", "")
    match = re.match(r"\$(\d+)", text)
    if match:
        return int(match.group(1))
    return None


def extract_source_from_icon(img_tag) -> str:
    """Extract the source name from an icon image tag."""
    if not img_tag:
        return "unknown"
    src = img_tag.get("src", "")
    filename = src.split("/")[-1] if "/" in src else src
    return SOURCE_ICONS.get(filename, filename.replace(".PNG", "").replace(".png", ""))


def scrape_price_data(url: str, session: requests.Session) -> dict | None:
    """Scrape price data from a single CollectiBlend camera/lens page."""
    try:
        resp = session.get(url, headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            return None
    except requests.RequestException:
        return None

    soup = BeautifulSoup(resp.text, "lxml")
    result = {
        "url": url,
        "average_index": None,
        "historical_prices": [],
        "rarity": None,
    }

    # Extract rarity — both numeric scale (1-5 ruby icons) and text label
    # The rarity section contains ruby.png icons (count = scale) and a text like
    # "(Very common. Votes: 26)"
    rarity_tds = [td for td in soup.find_all("td") if "rarity" in td.get_text()]
    for td in rarity_tds:
        ruby_count = len(td.find_all("img", src=re.compile(r"ruby")))
        text_match = re.search(r"\(([^)]+)\)", td.get_text())
        if text_match:
            rarity_text = text_match.group(1)
            parts = rarity_text.split(". Votes:")
            label = parts[0].strip() if parts else rarity_text.strip()
            votes = int(parts[1].strip()) if len(parts) == 2 else None
            result["rarity"] = {
                "label": label,
                "scale": ruby_count if ruby_count > 0 else None,  # 1-5
                "votes": votes,
            }
            break

    tables = soup.find_all("table")

    for table in tables:
        text = table.get_text()

        # Find the Average Index table (Average / Very good / Mint)
        if "Average" in text and "Very good" in text and "Mint" in text:
            cells = [td.get_text(strip=True) for td in table.find_all("td")]
            # Find the price cells - they come after the header row
            # Layout: [icon] [Average] [Very good] [Mint] [icon] [price1] [price2] [price3] ...
            price_cells = [c for c in cells if c.startswith("$")]
            if len(price_cells) >= 3:
                avg_low, avg_high = parse_price_range(price_cells[0])
                vg_low, vg_high = parse_price_range(price_cells[1])
                mint_low, mint_high = parse_price_range(price_cells[2])
                # Drop zero prices — they're meaningless
                idx = {
                    "average_low": avg_low if avg_low else None,
                    "average_high": avg_high if avg_high else None,
                    "very_good_low": vg_low if vg_low else None,
                    "very_good_high": vg_high if vg_high else None,
                    "mint_low": mint_low if mint_low else None,
                    "mint_high": mint_high if mint_high else None,
                }
                # Only keep if at least one non-zero price exists
                if any(v for v in idx.values()):
                    result["average_index"] = idx

        # Find the historical prices table (Date / Condition / Price)
        if "Condition" in text and "Price" in text and "Date" in text:
            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all("td")
                if len(cells) < 3:
                    continue

                # Extract text from cells
                cell_texts = [td.get_text(strip=True) for td in cells]

                # Find date cell (YYYY-MM-DD format)
                date_val = None
                condition_val = None
                price_val = None

                for ct in cell_texts:
                    if re.match(r"\d{4}-\d{2}-\d{2}", ct):
                        date_val = ct
                    elif ct in ("A", "B", "C", "A-B", "B-A", "B-C", "C-B", "A-C",
                                "D", "E", "A+", "B+", "C+", "D+"):
                        condition_val = ct
                    elif ct.startswith("$"):
                        price_val = parse_price_value(ct)

                if date_val and price_val is not None and price_val > 0:
                    # Get source from icon in first cell
                    source_img = cells[0].find("img") if cells else None
                    source = extract_source_from_icon(source_img)

                    result["historical_prices"].append({
                        "date": date_val,
                        "condition": condition_val,
                        "price_usd": price_val,
                        "source": source,
                    })

    # Only return if we found any price data
    if result["average_index"] or result["historical_prices"]:
        return result
    return None


def save_price_data(conn, entity_type: str, entity_id: int,
                     price_data: dict, extracted_at: str):
    """Save price data to the database."""
    with conn.cursor() as cur:
        # Upsert average index + rarity
        if price_data.get("average_index") or price_data.get("rarity"):
            idx = price_data.get("average_index") or {}
            rarity = price_data.get("rarity") or {}
            cur.execute("""
                INSERT INTO price_estimates
                    (entity_type, entity_id, source_url, source_name,
                     price_average_low, price_average_high,
                     price_very_good_low, price_very_good_high,
                     price_mint_low, price_mint_high,
                     rarity, rarity_votes, extracted_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (entity_type, entity_id) DO UPDATE SET
                    source_url = EXCLUDED.source_url,
                    price_average_low = EXCLUDED.price_average_low,
                    price_average_high = EXCLUDED.price_average_high,
                    price_very_good_low = EXCLUDED.price_very_good_low,
                    price_very_good_high = EXCLUDED.price_very_good_high,
                    price_mint_low = EXCLUDED.price_mint_low,
                    price_mint_high = EXCLUDED.price_mint_high,
                    rarity = EXCLUDED.rarity,
                    rarity_votes = EXCLUDED.rarity_votes,
                    extracted_at = EXCLUDED.extracted_at
            """, (
                entity_type, entity_id, price_data["url"], "CollectiBlend",
                idx.get("average_low"), idx.get("average_high"),
                idx.get("very_good_low"), idx.get("very_good_high"),
                idx.get("mint_low"), idx.get("mint_high"),
                rarity.get("label"), rarity.get("votes"),
                extracted_at,
            ))

        # Delete old history for this entity, then insert fresh
        if price_data.get("historical_prices"):
            cur.execute("""
                DELETE FROM price_history
                WHERE entity_type = %s AND entity_id = %s
            """, (entity_type, entity_id))

            for sale in price_data["historical_prices"]:
                cur.execute("""
                    INSERT INTO price_history
                        (entity_type, entity_id, sale_date, condition,
                         price_usd, source, extracted_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (
                    entity_type, entity_id,
                    sale["date"], sale.get("condition"),
                    sale["price_usd"], sale.get("source"),
                    extracted_at,
                ))

    conn.commit()


def main():
    parser = argparse.ArgumentParser(description="Fetch CollectiBlend price data")
    parser.add_argument("--matches", default="collectiblend_matches.json",
                        help="Input matches JSON file")
    parser.add_argument("--type", action="append", dest="types",
                        choices=["cameras", "lenses"],
                        help="What to fetch (default: both)")
    parser.add_argument("--delay", type=float, default=2.0,
                        help="Delay between requests in seconds (default: 2.0)")
    parser.add_argument("--limit", type=int, default=0,
                        help="Max items to fetch (0 = all, default: 0)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Scrape but don't save to DB")
    args = parser.parse_args()

    global REQUEST_DELAY
    REQUEST_DELAY = args.delay

    # Load matches
    with open(args.matches, "r") as f:
        matches = json.load(f)

    types_to_fetch = args.types or ["cameras", "lenses"]
    extracted_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    conn = None
    if not args.dry_run:
        conn = get_connection()
        ensure_price_tables(conn)

    session = requests.Session()
    session.mount("https://", SSLAdapter())

    for item_type in types_to_fetch:
        if item_type not in matches:
            print(f"No matches found for {item_type}, skipping")
            continue

        # Filter to matched items only
        matched = [m for m in matches[item_type] if m["status"] == "matched"]
        print(f"\n=== Fetching {item_type} prices ===")
        print(f"  {len(matched)} matched entries to fetch")

        if args.limit > 0:
            matched = matched[:args.limit]
            print(f"  Limited to {args.limit} entries")

        entity_type = "camera" if item_type == "cameras" else "lens"
        fetched = 0
        with_prices = 0
        errors = 0

        start_time = time.time()

        for i, entry in enumerate(matched):
            url = entry["match"]["url"]

            pct = (i / len(matched)) * 100
            elapsed = time.time() - start_time
            if i > 0:
                eta_sec = int((elapsed / i) * (len(matched) - i))
                eta_min = eta_sec // 60
                eta_str = f"{eta_min}m{eta_sec % 60:02d}s" if eta_min else f"{eta_sec}s"
            else:
                eta_str = "..."
            bar_len = 30
            filled = int(bar_len * i / len(matched))
            bar = "\u2588" * filled + "\u2591" * (bar_len - filled)
            name_short = entry["db_name"][:28]
            print(f"\r  {bar} {pct:5.1f}% [{i+1}/{len(matched)}] ETA {eta_str} \u2014 {name_short:<30}", end="", flush=True)

            time.sleep(REQUEST_DELAY)

            price_data = scrape_price_data(url, session)
            if price_data:
                with_prices += 1

                if conn and not args.dry_run:
                    save_price_data(conn, entity_type, entry["db_id"],
                                     price_data, extracted_at)

            fetched += 1

        print(f"\r  {'\u2588' * 30} 100.0% Done{' ' * 50}")
        print(f"  Fetched: {fetched}, With prices: {with_prices}, Errors: {errors}")

    if conn:
        conn.close()

    print(f"\nDone. Extraction timestamp: {extracted_at}")


if __name__ == "__main__":
    main()
