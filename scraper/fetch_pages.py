"""
Step 2: Fetch archived pages from the Wayback Machine.
Reads the URL list from discover_urls.py and downloads each page.

Usage:
    python fetch_pages.py [--input urls.json] [--output-dir pages/] [--delay 1.0] [--categories lens,system,camera]
"""

import argparse
import json
import os
import time
import hashlib
import requests

WAYBACK_BASE = "https://web.archive.org/web"


def safe_filename(url: str) -> str:
    """Convert a URL to a safe filename."""
    path = url.replace("https://lens-db.com/", "").replace("http://lens-db.com/", "")
    path = path.strip("/").replace("/", "__")
    if not path:
        path = "index"
    # Truncate long filenames
    if len(path) > 200:
        path = path[:180] + "_" + hashlib.md5(path.encode()).hexdigest()[:12]
    return path + ".html"


def fetch_page(timestamp: str, url: str) -> str | None:
    """Fetch a single page from the Wayback Machine."""
    # Use 'id_' flag to get the original page without the Wayback toolbar
    wayback_url = f"{WAYBACK_BASE}/{timestamp}id_/{url}"
    try:
        resp = requests.get(wayback_url, timeout=30)
        if resp.status_code == 200:
            return resp.text
        else:
            print(f"  HTTP {resp.status_code} for {url}")
            return None
    except requests.RequestException as e:
        print(f"  Error fetching {url}: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Fetch archived lens-db.com pages")
    parser.add_argument("--input", default="urls.json", help="URL list from discover_urls.py")
    parser.add_argument("--output-dir", default="pages", help="Directory to save pages")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between requests (seconds)")
    parser.add_argument("--categories", default="lens,system,camera",
                        help="Comma-separated categories to fetch")
    parser.add_argument("--max-pages", type=int, default=0, help="Max pages to fetch (0=all)")
    args = parser.parse_args()

    with open(args.input) as f:
        urls = json.load(f)

    target_categories = set(args.categories.split(","))
    filtered = [u for u in urls if u.get("category") in target_categories]
    print(f"Found {len(filtered)} URLs in categories: {target_categories}")

    if args.max_pages > 0:
        filtered = filtered[:args.max_pages]
        print(f"Limiting to {args.max_pages} pages")

    os.makedirs(args.output_dir, exist_ok=True)

    # Track progress
    progress_file = os.path.join(args.output_dir, ".progress.json")
    done = set()
    if os.path.exists(progress_file):
        with open(progress_file) as f:
            done = set(json.load(f))
        print(f"Resuming: {len(done)} pages already fetched")

    fetched = 0
    errors = 0
    for i, entry in enumerate(filtered):
        url = entry["original"]
        if url in done:
            continue

        filename = safe_filename(url)
        filepath = os.path.join(args.output_dir, filename)

        print(f"[{i+1}/{len(filtered)}] Fetching: {url}")
        html = fetch_page(entry["timestamp"], url)

        if html:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(html)
            done.add(url)
            fetched += 1
        else:
            errors += 1

        # Save progress periodically
        if fetched % 10 == 0:
            with open(progress_file, "w") as f:
                json.dump(list(done), f)

        time.sleep(args.delay)

    # Final progress save
    with open(progress_file, "w") as f:
        json.dump(list(done), f)

    print(f"\nDone! Fetched {fetched} pages, {errors} errors, {len(done)} total.")


if __name__ == "__main__":
    main()
