"""
Step 1: Scrape CollectiBlend manufacturer index pages to build a catalog.

Crawls collectiblend.com to get a full list of cameras and lenses with their URLs
and names. Outputs a JSON catalog file for matching against our database.

Usage:
    python scrape_collectiblend_catalog.py [--output collectiblend_catalog.json] [--type cameras] [--type lenses]

    # Scrape only specific manufacturers (much faster):
    python scrape_collectiblend_catalog.py --manufacturers Canon,Nikon,Leitz-(Leica)

    # List all available manufacturers without scraping items:
    python scrape_collectiblend_catalog.py --list-manufacturers --type cameras
"""

import argparse
import json
import os
import re
import ssl
import time

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

BASE_URL = "https://collectiblend.com"
CAMERAS_URL = f"{BASE_URL}/Cameras/"
LENSES_URL = f"{BASE_URL}/Lenses/"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Delay between requests in seconds
REQUEST_DELAY = 2.0


def fetch_page(url: str, session: requests.Session) -> BeautifulSoup | None:
    """Fetch a page and return parsed BeautifulSoup, or None on failure."""
    try:
        resp = session.get(url, headers=HEADERS, timeout=30)
        if resp.status_code == 200:
            return BeautifulSoup(resp.text, "lxml")
        else:
            print(f"  HTTP {resp.status_code} for {url}")
            return None
    except requests.RequestException as e:
        print(f"  Error fetching {url}: {e}")
        return None


def get_manufacturers(index_url: str, session: requests.Session) -> list[dict]:
    """Get list of manufacturers from the 'All' index page for cameras or lenses."""
    base_path = "/Cameras/" if "/Cameras/" in index_url else "/Lenses/"

    # Use the "All" page which lists every manufacturer
    all_url = BASE_URL + base_path + "All/"
    soup = fetch_page(all_url, session)
    if not soup:
        # Fall back to the main index page
        print("  'All' page not available, falling back to main index")
        soup = fetch_page(index_url, session)
        if not soup:
            return []

    manufacturers = []

    # Exclude alphabet index links and navigation links
    skip_names = {
        "All", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
        "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
    }

    for link in soup.find_all("a", href=True):
        href = link["href"]
        # Match manufacturer links like /Cameras/Canon/ or /Lenses/Canon/
        # but not individual item pages (which end in .html)
        if href.startswith(base_path) and href.endswith("/") and href != base_path:
            name = href.replace(base_path, "").rstrip("/")
            if (name and "/" not in name
                    and name not in skip_names
                    and len(name) > 2):  # Skip 2-char country codes (AR, AT, AU, etc.)
                manufacturers.append({
                    "name": name,
                    "url": BASE_URL + href if not href.startswith("http") else href,
                })

    # Deduplicate
    seen = set()
    unique = []
    for m in manufacturers:
        if m["name"] not in seen:
            seen.add(m["name"])
            unique.append(m)

    return unique


def scrape_manufacturer_items(manufacturer_url: str, manufacturer_name: str,
                               item_type: str, session: requests.Session) -> list[dict]:
    """Scrape all items (cameras or lenses) from a manufacturer's index page."""
    soup = fetch_page(manufacturer_url, session)
    if not soup:
        return []

    items = []
    base_path = f"/{item_type.capitalize()}/" if item_type == "cameras" else "/Lenses/"

    for link in soup.find_all("a", href=True):
        href = link["href"]
        # Match individual item links like /Cameras/Canon/Canon-AE-1.html
        if href.startswith(f"{base_path}{manufacturer_name}/") and href.endswith(".html"):
            item_name = link.get_text(strip=True)
            if item_name:
                items.append({
                    "name": item_name,
                    "url": BASE_URL + href if not href.startswith("http") else href,
                    "manufacturer": manufacturer_name,
                    "slug": href.split("/")[-1].replace(".html", ""),
                })

    # Deduplicate by URL
    seen = set()
    unique = []
    for item in items:
        if item["url"] not in seen:
            seen.add(item["url"])
            unique.append(item)

    return unique


def scrape_catalog(item_type: str, session: requests.Session,
                    manufacturer_filter: list[str] | None = None) -> list[dict]:
    """Scrape the catalog for cameras or lenses.

    Args:
        item_type: "cameras" or "lenses"
        session: requests session
        manufacturer_filter: if set, only scrape these manufacturer slugs
    """
    index_url = CAMERAS_URL if item_type == "cameras" else LENSES_URL
    print(f"\nScraping {item_type} catalog from {index_url}")

    # Step 1: Get all manufacturers
    print("  Getting manufacturer list...")
    manufacturers = get_manufacturers(index_url, session)
    print(f"  Found {len(manufacturers)} manufacturers total")

    # Filter to requested manufacturers if specified
    if manufacturer_filter:
        filter_lower = {m.lower() for m in manufacturer_filter}
        manufacturers = [m for m in manufacturers if m["name"].lower() in filter_lower]
        print(f"  Filtered to {len(manufacturers)} requested manufacturers")

    # Step 2: Scrape each manufacturer's page
    all_items = []
    start_time = time.time()
    for i, mfr in enumerate(manufacturers):
        pct = (i / len(manufacturers)) * 100
        elapsed = time.time() - start_time
        if i > 0:
            eta_sec = int((elapsed / i) * (len(manufacturers) - i))
            eta_min = eta_sec // 60
            eta_str = f"{eta_min}m{eta_sec % 60:02d}s" if eta_min else f"{eta_sec}s"
        else:
            eta_str = "calculating..."
        bar_len = 30
        filled = int(bar_len * i / len(manufacturers))
        bar = "█" * filled + "░" * (bar_len - filled)
        print(f"\r  {bar} {pct:5.1f}% [{i+1}/{len(manufacturers)}] ETA {eta_str} — {mfr['name']:<30}", end="", flush=True)
        time.sleep(REQUEST_DELAY)

        items = scrape_manufacturer_items(mfr["url"], mfr["name"], item_type, session)
        all_items.extend(items)

    print(f"\r  {'█' * 30} 100.0% [{len(manufacturers)}/{len(manufacturers)}] Done{' ' * 40}")

    print(f"  Total {item_type}: {len(all_items)}")
    return all_items


def main():
    parser = argparse.ArgumentParser(description="Scrape CollectiBlend catalog")
    parser.add_argument("--output", default="collectiblend_catalog.json",
                        help="Output JSON file (default: collectiblend_catalog.json)")
    parser.add_argument("--type", action="append", dest="types",
                        choices=["cameras", "lenses"],
                        help="What to scrape (default: both). Can be specified multiple times.")
    parser.add_argument("--delay", type=float, default=2.0,
                        help="Delay between requests in seconds (default: 2.0)")
    parser.add_argument("--manufacturers", type=str, default=None,
                        help="Comma-separated list of manufacturer slugs to scrape (e.g. Canon,Nikon)")
    parser.add_argument("--list-manufacturers", action="store_true",
                        help="Just list available manufacturers, don't scrape items")
    args = parser.parse_args()

    global REQUEST_DELAY
    REQUEST_DELAY = args.delay

    types_to_scrape = args.types or ["cameras", "lenses"]
    manufacturer_filter = None
    if args.manufacturers:
        manufacturer_filter = [m.strip() for m in args.manufacturers.split(",")]

    session = requests.Session()
    session.mount("https://", SSLAdapter())

    if args.list_manufacturers:
        for item_type in types_to_scrape:
            index_url = CAMERAS_URL if item_type == "cameras" else LENSES_URL
            manufacturers = get_manufacturers(index_url, session)
            print(f"\n{item_type.capitalize()} manufacturers ({len(manufacturers)}):")
            for m in manufacturers:
                print(f"  {m['name']}")
        return

    # Load existing catalog if it exists (to resume/extend)
    catalog = {}
    if os.path.exists(args.output):
        with open(args.output, "r") as f:
            catalog = json.load(f)
        print(f"Loaded existing catalog from {args.output}")

    for item_type in types_to_scrape:
        items = scrape_catalog(item_type, session, manufacturer_filter)

        if manufacturer_filter and item_type in catalog:
            # Merge: replace items for scraped manufacturers, keep the rest
            scraped_mfrs = {m.lower() for m in manufacturer_filter}
            existing = [i for i in catalog[item_type]
                        if i["manufacturer"].lower() not in scraped_mfrs]
            catalog[item_type] = existing + items
        else:
            catalog[item_type] = items

        catalog[f"{item_type}_scraped_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    # Save catalog
    with open(args.output, "w") as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)

    print(f"\nCatalog saved to {args.output}")
    for item_type in types_to_scrape:
        print(f"  {item_type}: {len(catalog.get(item_type, []))} items")


if __name__ == "__main__":
    main()
