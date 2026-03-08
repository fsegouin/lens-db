"""
Step 1: Discover all archived URLs for lens-db.com using the Wayback Machine CDX API.
Outputs a JSON file with all unique URLs and their most recent snapshot timestamps.

Usage:
    python discover_urls.py [--output urls.json] [--limit 0]
"""

import argparse
import json
import time
import requests

CDX_API = "https://web.archive.org/cdx/search/cdx"


def fetch_urls(limit: int = 0) -> list[dict]:
    """Query the CDX API to get all archived HTML pages for lens-db.com."""
    params = {
        "url": "lens-db.com/*",
        "output": "json",
        "fl": "timestamp,original,statuscode,mimetype",
        "filter": ["statuscode:200", "mimetype:text/html"],
        "collapse": "urlkey",  # deduplicate by URL
    }
    if limit > 0:
        params["limit"] = limit

    print(f"Querying CDX API for lens-db.com URLs...")
    resp = requests.get(CDX_API, params=params, timeout=120)
    resp.raise_for_status()

    data = resp.json()
    if not data:
        print("No results found.")
        return []

    # First row is header
    header = data[0]
    rows = data[1:]
    print(f"Found {len(rows)} unique URLs.")

    results = []
    for row in rows:
        entry = dict(zip(header, row))
        results.append(entry)

    return results


def categorize_url(url: str) -> str | None:
    """Categorize a URL based on its path structure."""
    path = url.replace("https://lens-db.com/", "").replace("http://lens-db.com/", "")
    path = path.strip("/")

    if not path or path == "":
        return "homepage"

    # System pages like /canon-eos/ or /nikon-f/
    # Lens pages are usually nested: /system/lens-name/
    # Camera pages: /cameras/
    parts = path.split("/")

    if parts[0] == "cameras":
        return "camera"
    elif parts[0] == "advanced-search":
        return "search"
    elif parts[0] == "about":
        return "about"
    elif parts[0] == "how-to-use-this-website":
        return "help"
    elif parts[0] == "collections":
        return "collection"
    elif parts[0] == "genres":
        return "genre"
    elif len(parts) == 1:
        return "system"
    elif len(parts) >= 2:
        return "lens"

    return "other"


def main():
    parser = argparse.ArgumentParser(description="Discover archived lens-db.com URLs")
    parser.add_argument("--output", default="urls.json", help="Output file path")
    parser.add_argument("--limit", type=int, default=0, help="Max URLs to fetch (0=all)")
    args = parser.parse_args()

    urls = fetch_urls(limit=args.limit)

    # Add categories
    for entry in urls:
        entry["category"] = categorize_url(entry["original"])

    # Summary
    categories = {}
    for entry in urls:
        cat = entry["category"]
        categories[cat] = categories.get(cat, 0) + 1

    print("\nURL categories:")
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")

    with open(args.output, "w") as f:
        json.dump(urls, f, indent=2)
    print(f"\nSaved {len(urls)} URLs to {args.output}")


if __name__ == "__main__":
    main()
