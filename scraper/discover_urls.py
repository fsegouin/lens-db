"""
Step 1: Discover all archived URLs for lens-db.com using the Wayback Machine CDX API.
Outputs a JSON file with all unique URLs and their most recent snapshot timestamps.

Usage:
    python discover_urls.py [--output urls.json] [--limit 0]
"""

import argparse
import json
import re
import time
import requests

CDX_API = "https://web.archive.org/cdx/search/cdx"


def fetch_urls(limit: int = 0) -> list[dict]:
    """Query the CDX API to get all archived HTML pages for lens-db.com.

    Fetches all snapshots and keeps only the most recent one per URL.
    """
    params = {
        "url": "lens-db.com/*",
        "output": "json",
        "fl": "timestamp,original,statuscode,mimetype",
        "filter": ["statuscode:200", "mimetype:text/html"],
        # No collapse — we fetch all snapshots and pick the latest per URL ourselves
    }
    if limit > 0:
        params["limit"] = limit

    print("Querying CDX API for lens-db.com URLs...")
    resp = requests.get(CDX_API, params=params, timeout=300)
    resp.raise_for_status()

    data = resp.json()
    if not data:
        print("No results found.")
        return []

    # First row is header
    header = data[0]
    rows = data[1:]
    print(f"Found {len(rows)} total snapshots.")

    # Keep only the most recent snapshot per URL
    latest: dict[str, dict] = {}
    for row in rows:
        entry = dict(zip(header, row))
        url = entry["original"]
        if url not in latest or entry["timestamp"] > latest[url]["timestamp"]:
            latest[url] = entry

    results = list(latest.values())
    print(f"Deduplicated to {len(results)} unique URLs (most recent snapshots).")

    return results


# Patterns that indicate a URL slug is a lens product page
_LENS_SLUG_RE = re.compile(
    r"\d+mm"  # focal length like 50mm, 70-200mm
    r"|f\d"  # aperture like f2, f28
    r"|f-\d"  # aperture like f-2.8
    r"|fisheye|macro|zoom|tele|wide"
    r"|nikkor|rokkor|takumar|planar|sonnar|elmarit|summicron|summilux"
    r"|distagon|biogon|tessar|xenon|heliar|skopar|nokton|topcor"
    r"|hexanon|zuiko|fujinon|flektogon|pancolar|oreston|biotar"
    r"|triotar|industar|jupiter|helios|mir-|vega-|tair-"
    r"|smc-|ef-s|ef-m|rf-s|di-ii|di-iii|sel\d"
    r"|sekor|serenar|serinar|canon-fd|canon-ef|canon-rf"
    r"|apo-|asph|aspherical",
    re.IGNORECASE,
)

# Known non-content pages that should be skipped
_SKIP_SLUGS = {
    "wp-login.php", "comments", "recent-comments", "search-rules",
}


def categorize_url(url: str) -> str | None:
    """Categorize a URL based on its path structure and slug content."""
    path = url.replace("https://lens-db.com/", "").replace("http://lens-db.com/", "")
    path = path.strip("/")

    if not path:
        return "homepage"

    parts = path.split("/")

    # Skip known junk pages
    if parts[0] in _SKIP_SLUGS:
        return None

    # Multi-segment paths — use first segment to route
    if parts[0] == "camera":
        return "camera"
    elif parts[0] == "cameras":
        return "camera"
    elif parts[0] == "advanced-search":
        return None  # search results, not useful
    elif parts[0] == "about":
        return "about"
    elif parts[0] == "how-to-use-this-website":
        return "help"
    elif parts[0] == "collections":
        return "collection"
    elif parts[0] == "genres":
        return "genre"
    elif parts[0] == "blog":
        return "blog"
    elif parts[0] == "articles-and-tables":
        return "article"
    elif parts[0] == "accessory":
        return "accessory"

    # Single-segment paths — distinguish lenses from articles/pages
    if len(parts) == 1:
        slug = parts[0]
        if _LENS_SLUG_RE.search(slug):
            return "lens"
        # Everything else is an article or informational page
        return "article"

    # Multi-segment paths not caught above
    if len(parts) >= 2:
        # lens-lineup pages are mount system lists, not individual lenses
        if parts[0] == "lens-lineup":
            return "article"
        return "lens"

    return "other"


def main():
    parser = argparse.ArgumentParser(description="Discover archived lens-db.com URLs")
    parser.add_argument("--output", default="urls.json", help="Output file path")
    parser.add_argument("--limit", type=int, default=0, help="Max URLs to fetch (0=all)")
    args = parser.parse_args()

    urls = fetch_urls(limit=args.limit)

    # Add categories and filter out junk
    categorized = []
    for entry in urls:
        cat = categorize_url(entry["original"])
        if cat is not None:
            entry["category"] = cat
            categorized.append(entry)

    skipped = len(urls) - len(categorized)
    if skipped:
        print(f"Filtered out {skipped} non-content URLs.")

    # Filter out query-parameter URLs (search results, login redirects, etc.)
    clean = [e for e in categorized if "?" not in e["original"]]
    param_count = len(categorized) - len(clean)
    if param_count:
        print(f"Filtered out {param_count} URLs with query parameters.")

    # Summary
    categories = {}
    for entry in clean:
        cat = entry["category"]
        categories[cat] = categories.get(cat, 0) + 1

    print("\nURL categories:")
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")

    with open(args.output, "w") as f:
        json.dump(clean, f, indent=2)
    print(f"\nSaved {len(clean)} URLs to {args.output}")


if __name__ == "__main__":
    main()
