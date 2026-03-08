"""
Step 2: Fetch archived pages from the Wayback Machine.
Reads the URL list from discover_urls.py and downloads each page.

Uses async I/O with concurrent requests for speed.

Usage:
    python fetch_pages.py [--input urls.json] [--output-dir pages/] [--concurrency 10] [--categories lens,camera,accessory]
"""

import argparse
import asyncio
import hashlib
import json
import os
import time

import aiohttp

WAYBACK_BASE = "https://web.archive.org/web"


def safe_filename(url: str) -> str:
    """Convert a URL to a safe filename."""
    path = url.replace("https://lens-db.com/", "").replace("http://lens-db.com/", "")
    path = path.strip("/").replace("/", "__")
    if not path:
        path = "index"
    if len(path) > 200:
        path = path[:180] + "_" + hashlib.md5(path.encode()).hexdigest()[:12]
    return path + ".html"


async def fetch_page(
    session: aiohttp.ClientSession,
    semaphore: asyncio.Semaphore,
    entry: dict,
    output_dir: str,
    stats: dict,
):
    url = entry["original"]
    timestamp = entry["timestamp"]
    filename = safe_filename(url)
    filepath = os.path.join(output_dir, filename)

    # Skip if already on disk
    if os.path.exists(filepath) and os.path.getsize(filepath) > 500:
        stats["skipped"] += 1
        return url

    wayback_url = f"{WAYBACK_BASE}/{timestamp}id_/{url}"

    async with semaphore:
        for attempt in range(3):
            try:
                async with session.get(wayback_url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status == 200:
                        html = await resp.text(encoding=None, errors="replace")
                        with open(filepath, "w", encoding="utf-8") as f:
                            f.write(html)
                        stats["fetched"] += 1
                        return url
                    elif resp.status == 429:
                        wait = 10 * (attempt + 1)
                        stats["rate_limited"] += 1
                        await asyncio.sleep(wait)
                        continue
                    else:
                        stats["errors"] += 1
                        return None
            except (aiohttp.ClientError, asyncio.TimeoutError):
                if attempt < 2:
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
                stats["errors"] += 1
                return None


async def run(args):
    with open(args.input) as f:
        urls = json.load(f)

    target_categories = set(args.categories.split(","))
    filtered = [u for u in urls if u.get("category") in target_categories]
    print(f"Found {len(filtered)} URLs in categories: {target_categories}")

    if args.max_pages > 0:
        filtered = filtered[:args.max_pages]
        print(f"Limiting to {args.max_pages} pages")

    os.makedirs(args.output_dir, exist_ok=True)

    # Load progress
    progress_file = os.path.join(args.output_dir, ".progress.json")
    done = set()
    if os.path.exists(progress_file):
        with open(progress_file) as f:
            done = set(json.load(f))
        print(f"Resuming: {len(done)} pages already fetched")

    remaining = [e for e in filtered if e["original"] not in done]
    print(f"Remaining: {len(remaining)} pages to fetch")
    if not remaining:
        print("Nothing to do!")
        return

    stats = {"fetched": 0, "skipped": 0, "errors": 0, "rate_limited": 0}
    semaphore = asyncio.Semaphore(args.concurrency)
    start_time = time.time()

    connector = aiohttp.TCPConnector(limit=args.concurrency, limit_per_host=args.concurrency)
    headers = {"User-Agent": "Mozilla/5.0 (compatible; lens-db-scraper/1.0)"}

    async with aiohttp.ClientSession(connector=connector, headers=headers) as session:
        # Process in batches to save progress periodically
        batch_size = 100
        for batch_start in range(0, len(remaining), batch_size):
            batch = remaining[batch_start : batch_start + batch_size]
            tasks = [fetch_page(session, semaphore, entry, args.output_dir, stats) for entry in batch]
            results = await asyncio.gather(*tasks)

            # Update done set
            for url in results:
                if url:
                    done.add(url)

            # Save progress
            with open(progress_file, "w") as f:
                json.dump(list(done), f)

            elapsed = time.time() - start_time
            total_done = stats["fetched"] + stats["skipped"]
            rate = total_done / elapsed if elapsed > 0 else 0
            remaining_count = len(remaining) - batch_start - len(batch)
            eta = remaining_count / rate if rate > 0 else 0
            print(
                f"  Progress: {total_done} done, {stats['errors']} errors, "
                f"{stats['rate_limited']} rate-limited, "
                f"{rate:.1f}/sec, ETA: {eta/60:.0f}min"
            )

    elapsed = time.time() - start_time
    print(
        f"\nDone! fetched={stats['fetched']}, skipped={stats['skipped']}, "
        f"errors={stats['errors']}, total={len(done)} in {elapsed/60:.1f}min"
    )


def main():
    parser = argparse.ArgumentParser(description="Fetch archived lens-db.com pages")
    parser.add_argument("--input", default="urls.json", help="URL list from discover_urls.py")
    parser.add_argument("--output-dir", default="pages", help="Directory to save pages")
    parser.add_argument("--concurrency", type=int, default=10, help="Max concurrent requests")
    parser.add_argument("--categories", default="lens,camera,accessory",
                        help="Comma-separated categories to fetch")
    parser.add_argument("--max-pages", type=int, default=0, help="Max pages to fetch (0=all)")
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
