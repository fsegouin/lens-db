"""
Download lens and camera images from lens-db.com URLs stored in the database.

Saves images to frontend/public/images/ for local serving.

Requires DATABASE_URL environment variable.

Usage:
    DATABASE_URL="postgresql://..." python download_images.py [--limit 100] [--type lenses]
"""

import argparse
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
import requests

DATABASE_URL = os.environ.get("DATABASE_URL")
BASE_DIR = Path(__file__).parent.parent / "frontend" / "public" / "images"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"})


def get_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is required")
    return psycopg2.connect(DATABASE_URL)


def sanitize_filename(url: str) -> str:
    """Extract a safe filename from a URL."""
    parsed = urlparse(url)
    filename = os.path.basename(parsed.path)
    # Remove query params from filename
    filename = re.sub(r"[?#].*", "", filename)
    # Replace unsafe chars
    filename = re.sub(r"[^\w.\-]", "_", filename)
    return filename or "image.jpg"


def find_wayback_url(url: str) -> str | None:
    """Use the Wayback CDX API to find the best archived version of a URL."""
    try:
        cdx_url = f"https://web.archive.org/cdx/search/cdx?url={url}&output=json&limit=1&filter=statuscode:200&sort=reverse"
        resp = SESSION.get(cdx_url, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            if len(data) > 1:  # First row is headers
                timestamp = data[1][1]
                original = data[1][2]
                return f"https://web.archive.org/web/{timestamp}if_/{original}"
    except Exception:
        pass
    return None


def download_image(url: str, dest: Path, backoff: float = 1.0) -> tuple[bool, float]:
    """Download a single image. Returns (downloaded, next_backoff).

    Uses CDX API to find archived URLs, with exponential backoff on failures.
    """
    if dest.exists():
        return False, backoff

    dest.parent.mkdir(parents=True, exist_ok=True)

    for attempt in range(3):
        try:
            # Find the correct Wayback Machine URL via CDX API
            wayback_url = find_wayback_url(url)
            time.sleep(0.3)  # Rate limit CDX lookups

            if not wayback_url:
                # Image was never archived and lens-db.com is offline
                return False, backoff

            download_url = wayback_url
            resp = SESSION.get(download_url, timeout=30, stream=True)

            if resp.status_code == 200:
                content_type = resp.headers.get("content-type", "")
                if "image" not in content_type and "octet-stream" not in content_type:
                    return False, max(backoff * 0.9, 0.5)

                with open(dest, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        f.write(chunk)
                return True, max(backoff * 0.9, 0.5)  # Decrease backoff on success
            elif resp.status_code == 429:
                wait = min(backoff * (2 ** attempt), 60)
                print(f"  Rate limited, waiting {wait:.0f}s...")
                time.sleep(wait)
                continue
            else:
                return False, backoff
        except Exception as e:
            if dest.exists():
                dest.unlink()
            if attempt < 2:
                wait = min(backoff * (2 ** attempt), 30)
                time.sleep(wait)
                continue
            print(f"  Failed: {os.path.basename(url)}: {type(e).__name__}")
            return False, min(backoff * 1.5, 30)  # Increase backoff on failure

    return False, min(backoff * 2, 30)


def filter_images(images: list, entity_name: str) -> list:
    """Filter images to only those belonging to this entity (not sidebar thumbnails).

    Keeps images whose alt text matches the entity name.
    Skips small thumbnail variants (e.g. -150x150 in filename).
    """
    name_lower = entity_name.lower()
    filtered = []
    for img in images:
        src = img.get("src", "")
        alt = (img.get("alt", "") or "").lower()

        # Skip small thumbnails by filename pattern (e.g. "-72x150.jpg", "-150x150.jpeg")
        if re.search(r"-\d{2,3}x\d{2,3}\.", src):
            continue

        # Keep images whose alt text matches the entity name
        if alt and name_lower in alt:
            filtered.append(img)
        # Keep images with no alt text (likely product photos without labels)
        elif not alt:
            filtered.append(img)
    return filtered


def download_for_table(conn, table: str, limit: int | None = None):
    """Download images for all entries in a table."""
    category = table  # "lenses" or "cameras"
    out_dir = BASE_DIR / category

    query = f"SELECT slug, name, images FROM {table} WHERE images IS NOT NULL AND images != '[]'::jsonb"
    if limit:
        query += f" LIMIT {limit}"

    with conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    print(f"Found {len(rows)} {category} with images")

    total_downloaded = 0
    total_skipped = 0
    total_filtered = 0
    backoff = 1.0  # Adaptive delay between requests

    for i, (slug, name, images_json) in enumerate(rows):
        if not images_json:
            continue

        images = images_json if isinstance(images_json, list) else json.loads(images_json)
        if not images:
            continue

        # Filter out unrelated sidebar thumbnails
        relevant = filter_images(images, name)
        total_filtered += len(images) - len(relevant)

        entity_dir = out_dir / slug.replace("/", "__")

        for img in relevant:
            src = img.get("src", "")
            if not src:
                continue

            filename = sanitize_filename(src)
            dest = entity_dir / filename

            downloaded, backoff = download_image(src, dest, backoff)
            if downloaded:
                total_downloaded += 1
            else:
                total_skipped += 1

            # Always wait between requests to avoid getting blocked
            time.sleep(backoff)

        if (i + 1) % 50 == 0:
            print(f"  Progress: {i + 1}/{len(rows)} {category} processed ({total_downloaded} downloaded, {total_skipped} skipped, {total_filtered} filtered out, backoff={backoff:.1f}s)")

    print(f"  {category}: {total_downloaded} downloaded, {total_skipped} skipped, {total_filtered} filtered out")
    return total_downloaded


def main():
    parser = argparse.ArgumentParser(description="Download lens/camera images")
    parser.add_argument("--limit", type=int, help="Limit number of entries to process")
    parser.add_argument("--type", choices=["lenses", "cameras"], help="Only download for one type")
    args = parser.parse_args()

    conn = get_connection()

    if args.type:
        tables = [args.type]
    else:
        tables = ["lenses", "cameras"]

    total = 0
    for table in tables:
        print(f"\nDownloading {table} images...")
        total += download_for_table(conn, table, args.limit)

    conn.close()
    print(f"\nDone! Total images downloaded: {total}")


if __name__ == "__main__":
    main()
