"""
Fetch camera/lens images from CollectiBlend for matched entries.

Uses the matches file from match_collectiblend.py to construct image URLs
and downloads them to the local images directory. Does NOT need to scrape
individual pages — image URLs follow a predictable pattern:
  Cameras: https://collectiblend.com/Cameras/images/{Manufacturer}-{Slug}.jpg
  Lenses:  https://collectiblend.com/Lenses/images/{Manufacturer}-{Slug}.jpg

Usage:
    python fetch_collectiblend_images.py [--matches collectiblend_matches.json] \
        [--type cameras] [--type lenses] [--delay 1.0] [--limit 0]
"""

import argparse
import json
import os
import ssl
import time
from io import BytesIO
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
from PIL import Image

BASE_URL = "https://collectiblend.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
}

# Output directory: frontend/public/images/{cameras,lenses}/{slug}/
BASE_DIR = Path(__file__).parent.parent / "frontend" / "public" / "images"

REQUEST_DELAY = 1.0


class SSLAdapter(HTTPAdapter):
    """Custom SSL adapter to work around Python 3.14 + OpenSSL 3.6 issues."""
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.check_hostname = True
        ctx.verify_mode = ssl.CERT_REQUIRED
        ctx.load_default_certs()
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


def download_image(url: str, dest_path: Path, session: requests.Session) -> bool:
    """Download an image, convert to WebP, and save. Returns True on success."""
    try:
        resp = session.get(url, headers=HEADERS, timeout=30)
        if resp.status_code != 200 or len(resp.content) < 1000:
            return False

        img = Image.open(BytesIO(resp.content))
        # Convert to RGB if needed (handles RGBA, palette modes)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        dest_path = dest_path.with_suffix(".webp")
        dest_path.parent.mkdir(parents=True, exist_ok=True)

        img.save(dest_path, format="WEBP", quality=80)
        return True
    except (requests.RequestException, Exception):
        return False


def build_image_url(match_entry: dict, item_type: str) -> dict:
    """Build the image URL from a match entry.

    CollectiBlend uses the pattern:
      /Cameras/images/{Manufacturer}-{Slug}.jpg  (full size ~400px)
      /Lenses/images/{Manufacturer}-{Slug}.jpg
    """
    match = match_entry["match"]
    mfr = match["manufacturer"]
    slug = match["slug"]
    section = "Cameras" if item_type == "cameras" else "Lenses"

    return {
        "url": f"{BASE_URL}/{section}/images/{mfr}-{slug}.jpg",
        "filename": f"{slug}.webp",
    }


def main():
    parser = argparse.ArgumentParser(description="Fetch CollectiBlend images")
    parser.add_argument("--matches", default="collectiblend_matches.json",
                        help="Input matches JSON file")
    parser.add_argument("--type", action="append", dest="types",
                        choices=["cameras", "lenses"],
                        help="What to fetch (default: both)")
    parser.add_argument("--delay", type=float, default=1.0,
                        help="Delay between requests in seconds (default: 1.0)")
    parser.add_argument("--limit", type=int, default=0,
                        help="Max items to fetch (0 = all)")
    parser.add_argument("--skip-existing", action="store_true", default=True,
                        help="Skip entries that already have local images (default: True)")
    args = parser.parse_args()

    global REQUEST_DELAY
    REQUEST_DELAY = args.delay

    with open(args.matches, "r") as f:
        matches = json.load(f)

    types_to_fetch = args.types or ["cameras", "lenses"]

    session = requests.Session()
    session.mount("https://", SSLAdapter())

    for item_type in types_to_fetch:
        if item_type not in matches:
            print(f"No matches found for {item_type}, skipping")
            continue

        matched = [m for m in matches[item_type] if m["status"] == "matched"]
        print(f"\n=== Fetching {item_type} images ===")
        print(f"  {len(matched)} matched entries")

        if args.limit > 0:
            matched = matched[:args.limit]

        img_dir = BASE_DIR / item_type
        downloaded = 0
        skipped = 0
        failed = 0
        start_time = time.time()

        for i, entry in enumerate(matched):
            db_slug = entry["db_slug"]
            # Slug may contain / which becomes __ in directory names
            local_dir = img_dir / db_slug.replace("/", "__")

            # Skip if we already have images for this entry
            if args.skip_existing and local_dir.exists() and any(local_dir.iterdir()):
                skipped += 1
                continue

            img_info = build_image_url(entry, item_type)
            dest = local_dir / img_info["filename"]

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
            if download_image(img_info["url"], dest, session):
                downloaded += 1
            else:
                failed += 1

        print(f"\r  {'\u2588' * 30} 100.0% Done{' ' * 50}")
        print(f"  Downloaded: {downloaded}, Skipped (existing): {skipped}, No image: {failed}")


if __name__ == "__main__":
    main()
