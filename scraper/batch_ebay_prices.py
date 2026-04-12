"""
Batch eBay Price Pipeline — fetches sold listings for multiple cameras and processes them.

Fetches eBay sold listings search pages via HTTP, extracts listing data,
classifies via LLM, and stores prices in the DB.

Usage:
    DATABASE_URL="..." python batch_ebay_prices.py --top 50 --delay 5.0
    DATABASE_URL="..." python batch_ebay_prices.py --cameras "Canon AE-1,Nikon F2"
"""

import argparse
import json
import os
import re
import ssl
import time
from urllib.parse import quote_plus

import psycopg2
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
from bs4 import BeautifulSoup

DATABASE_URL = os.environ.get("DATABASE_URL")
CLASSIFY_URL = os.environ.get("CLASSIFY_URL", "http://localhost:3000/api/admin/price-classify")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

BATCH_SIZE = 20
REQUEST_DELAY = 5.0


class SSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.check_hostname = True
        ctx.verify_mode = ssl.CERT_REQUIRED
        ctx.load_default_certs()
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


def get_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is required")
    return psycopg2.connect(DATABASE_URL)


def get_top_cameras(conn, limit: int) -> list[dict]:
    """Get cameras likely to have eBay listings, prioritized by popularity."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, name FROM cameras
            WHERE merged_into_id IS NULL
            AND id NOT IN (
                SELECT DISTINCT entity_id FROM price_estimates WHERE entity_type = 'camera'
            )
            ORDER BY view_count DESC NULLS LAST
            LIMIT %s
        """, (limit,))
        return [{"id": r[0], "name": r[1]} for r in cur.fetchall()]


def build_search_query(camera_name: str) -> str:
    """Build an eBay search query from a camera name."""
    # Clean up common prefixes that hurt search
    name = camera_name
    for prefix in ["Asahi ", "Nippon Kogaku "]:
        if name.startswith(prefix):
            name = name[len(prefix):]

    # Add "camera body" to focus on body-only listings
    return f"{name} camera body"


def fetch_ebay_sold(query: str, session: requests.Session) -> list[dict]:
    """Fetch sold listings from eBay search results page.

    Note: eBay renders sold dates via JavaScript, so we use the _fcid=51 parameter
    and parse the server-rendered JSON data embedded in the page.
    """
    url = f"https://www.ebay.com/sch/i.html?_nkw={quote_plus(query)}&_sop=13&rt=nc&LH_Sold=1&LH_Complete=1"

    try:
        resp = session.get(url, headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            return []
    except requests.RequestException:
        return []

    text = resp.text
    listings = []

    months = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
        'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
        'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12',
    }

    # eBay embeds listing data in JSON within <script> tags
    # Try to find the srp-results data
    soup = BeautifulSoup(text, "lxml")

    # Method 1: Parse from inline JSON data (s-item data)
    for script in soup.find_all("script"):
        script_text = script.string or ""
        if '"itemId"' in script_text and '"soldDate"' not in script_text:
            continue
        if '"listingId"' in script_text or '"RESULTS"' in script_text:
            # Try to extract JSON
            try:
                # Find JSON objects with listing data
                for match in re.finditer(r'"itemId"\s*:\s*"(\d+)"', script_text):
                    # This approach is fragile — fall back to method 2
                    pass
            except Exception:
                pass

    # Method 2: Parse the visible text for "Sold" patterns
    # eBay server-renders the item titles and prices but not sold dates in plain HTTP
    # However, some data is in aria labels and data attributes
    item_data = {}
    for link in soup.find_all("a", href=True):
        href = link.get("href", "")
        m = re.search(r"/itm/(\d+)", href)
        if not m:
            continue
        item_id = m.group(1)
        link_text = link.get_text(strip=True)
        link_text = re.sub(r"Opens in a new window or tab$", "", link_text).strip()
        link_text = re.sub(r"^New Listing", "", link_text).strip()
        link_text = re.sub(r"[^\x20-\x7E]", "", link_text).strip()
        if len(link_text) > 15 and item_id not in item_data:
            item_data[item_id] = {"title": link_text}

    # Find prices near each item — look for s-item__price or similar
    for item_el in soup.select("[data-view]"):
        # Try to find item ID, price, and date within this element
        link = item_el.find("a", href=re.compile(r"/itm/\d+"))
        if not link:
            continue
        m = re.search(r"/itm/(\d+)", link["href"])
        if not m:
            continue
        item_id = m.group(1)
        if item_id not in item_data:
            continue

        el_text = item_el.get_text(" ", strip=True)

        # Price
        price_match = re.search(r"\$([\d,]+\.\d{2})", el_text)
        if price_match:
            item_data[item_id]["price"] = float(price_match.group(1).replace(",", ""))

        # Date (may not be present in server HTML)
        date_match = re.search(r"Sold (\w{3}) (\d{1,2}), (\d{4})", el_text)
        if date_match:
            month = months.get(date_match.group(1), "01")
            item_data[item_id]["date"] = f"{date_match.group(3)}-{month}-{date_match.group(2).zfill(2)}"

        # Condition
        cond_match = re.search(
            r"(Pre-Owned|Parts Only|Very Good - Refurbished|Good - Refurbished|Excellent - Refurbished)",
            el_text,
        )
        if cond_match:
            item_data[item_id]["condition"] = cond_match.group(1)

    # Build listing objects from collected data
    for item_id, data in item_data.items():
        if "price" not in data:
            continue
        # Use today's date if sold date not available (eBay renders it client-side)
        date = data.get("date", time.strftime("%Y-%m-%d"))

        listings.append({
            "title": data["title"][:120],
            "price": data["price"],
            "date": date,
            "condition": data.get("condition", ""),
            "url": f"https://www.ebay.com/itm/{item_id}",
        })

    return listings


def classify_listings(camera_name: str, listings: list[dict]) -> list[dict]:
    """Classify listings via the LLM API in batches."""
    all_classified = []
    for i in range(0, len(listings), BATCH_SIZE):
        batch = listings[i:i + BATCH_SIZE]
        try:
            resp = requests.post(CLASSIFY_URL, json={
                "cameraName": camera_name,
                "listings": batch,
            }, timeout=120)
            if resp.status_code == 200:
                all_classified.extend(resp.json().get("classified", []))
        except requests.RequestException:
            pass
    return all_classified


def store_and_compute(conn, camera_id: int, camera_name: str,
                       classified: list[dict], raw: list[dict]):
    """Store classified sales and recompute price estimates."""
    from process_ebay_prices import store_classified_sales, recompute_price_estimates

    extracted_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    stored = store_classified_sales(conn, "camera", camera_id, classified, raw, extracted_at)
    if stored > 0:
        recompute_price_estimates(conn, "camera", camera_id)
    return stored


def main():
    parser = argparse.ArgumentParser(description="Batch eBay Price Pipeline")
    parser.add_argument("--top", type=int, default=50,
                        help="Process top N cameras by popularity (default: 50)")
    parser.add_argument("--cameras", type=str,
                        help="Comma-separated camera names to process")
    parser.add_argument("--delay", type=float, default=5.0,
                        help="Delay between eBay requests (default: 5.0)")
    parser.add_argument("--classify-delay", type=float, default=1.0,
                        help="Delay between classify API calls (default: 1.0)")
    args = parser.parse_args()

    global REQUEST_DELAY
    REQUEST_DELAY = args.delay

    conn = get_connection()

    if args.cameras:
        camera_names = [c.strip() for c in args.cameras.split(",")]
        cameras = []
        with conn.cursor() as cur:
            for name in camera_names:
                cur.execute("SELECT id, name FROM cameras WHERE name ILIKE %s AND merged_into_id IS NULL LIMIT 1",
                            (f"%{name}%",))
                row = cur.fetchone()
                if row:
                    cameras.append({"id": row[0], "name": row[1]})
                else:
                    print(f"  Camera not found: {name}")
    else:
        cameras = get_top_cameras(conn, args.top)

    print(f"Processing {len(cameras)} cameras\n")

    session = requests.Session()
    session.mount("https://", SSLAdapter())

    total_stored = 0
    start_time = time.time()

    for i, cam in enumerate(cameras):
        elapsed = time.time() - start_time
        if i > 0:
            eta_sec = int((elapsed / i) * (len(cameras) - i))
            eta_min = eta_sec // 60
            eta_str = f"{eta_min}m{eta_sec % 60:02d}s"
        else:
            eta_str = "..."

        bar_len = 30
        filled = int(bar_len * i / len(cameras))
        bar = "\u2588" * filled + "\u2591" * (bar_len - filled)
        print(f"\r{bar} {i+1}/{len(cameras)} ETA {eta_str} \u2014 {cam['name'][:35]:<37}", end="", flush=True)

        # Fetch eBay listings
        query = build_search_query(cam["name"])
        time.sleep(REQUEST_DELAY)
        listings = fetch_ebay_sold(query, session)

        if not listings:
            continue

        # Classify
        time.sleep(args.classify_delay)
        classified = classify_listings(cam["name"], listings)
        if not classified:
            continue

        # Store
        stored = store_and_compute(conn, cam["id"], cam["name"], classified, listings)
        total_stored += stored

    print(f"\r{'\u2588' * 30} {len(cameras)}/{len(cameras)} Done{' ' * 40}")
    print(f"\nProcessed {len(cameras)} cameras, stored {total_stored} price records")

    conn.close()


if __name__ == "__main__":
    main()
