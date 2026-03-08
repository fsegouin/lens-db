"""
Step 3: Parse downloaded lens-db.com pages and extract structured data.

Extracts lens specs, camera specs, and metadata from archived HTML pages
by targeting the "Specification" heading + following table pattern used
consistently across lens-db.com.

Usage:
    python parse_lenses.py [--input-dir pages/] [--output data.json]
"""

import argparse
import json
import os
import re
from bs4 import BeautifulSoup, Tag


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clean_wayback_url(url: str) -> str:
    """Strip Wayback Machine URL wrapper."""
    return re.sub(r"https?://web\.archive\.org/web/\d+(?:id_)?/", "", url)


def _find_table_after_heading(soup: BeautifulSoup, heading_text: str) -> Tag | None:
    """Find the first <table> that follows a heading containing *heading_text*."""
    for h in soup.find_all(["h2", "h3", "h4"]):
        if heading_text.lower() in h.get_text(strip=True).lower():
            table = h.find_next("table")
            if table:
                return table
    return None


def _parse_spec_table(table: Tag) -> dict:
    """Parse a lens-db.com specification table into a dict.

    The table uses:
    - 2-cell rows for key/value pairs (key in td[0], value in td[1])
    - 1-cell rows with colspan as section headers (e.g. "Optical design")
    - 1-cell rows without colspan as continuation values for the previous key
    """
    specs = {}
    current_section = ""
    last_key = ""

    for row in table.find_all("tr"):
        cells = row.find_all(["th", "td"])

        if len(cells) == 1:
            cell = cells[0]
            text = cell.get_text(strip=True)
            if not text:
                continue
            # Section header (has colspan) vs continuation value
            if cell.get("colspan"):
                current_section = text.rstrip(":")
            else:
                # Continuation value — append to the previous key
                if last_key and last_key in specs:
                    specs[last_key] += f"; {text}"

        elif len(cells) >= 2:
            key = cells[0].get_text(strip=True).rstrip(":")
            value = cells[1].get_text(strip=True)
            if not key:
                continue
            # Prefix with section for disambiguation if useful
            specs[key] = value
            last_key = key

    return specs


def _extract_subtitle(soup: BeautifulSoup) -> str | None:
    """Extract the lens/camera classification subtitle.

    This is typically an h2 or h3 like:
    "Ultra-wide angle prime lens • Film era • Discontinued"
    Located near the top of the page, after the h1 and possibly after
    a "LENS-DB.COM" heading.
    """
    keywords = [
        "lens", "prime", "zoom", "fisheye", "tele", "wide", "macro",
        "mirror", "shift", "camera", "slr", "rangefinder", "era",
        "discontinued", "in production",
    ]
    for h in soup.find_all(["h2", "h3"]):
        text = h.get_text(strip=True)
        # Skip site name
        if text.upper() == "LENS-DB.COM":
            continue
        # Skip headings that are lens/camera names (alternatives sections)
        if re.search(r"\d+mm.*F/\d", text, re.IGNORECASE):
            continue
        if any(kw in text.lower() for kw in keywords):
            return text
    return None


def _extract_images(soup: BeautifulSoup) -> list[dict]:
    """Extract content images, cleaning Wayback URLs."""
    images = []
    seen = set()
    for img in soup.find_all("img"):
        src = img.get("src", "") or img.get("data-src", "")
        if not src:
            continue
        clean = _clean_wayback_url(src)
        # Only keep lens-db.com content images
        if "lens-db.com" not in clean:
            continue
        # Skip theme assets (icons, UI elements)
        if "/themes/" in clean or "/plugins/" in clean:
            continue
        if clean in seen:
            continue
        # Skip tiny images (likely icons)
        width = img.get("width", "")
        if width and width.isdigit() and int(width) < 50:
            continue
        seen.add(clean)
        images.append({"src": clean, "alt": img.get("alt", "")})
    return images


def _extract_mount_info(soup: BeautifulSoup) -> dict | None:
    """Extract mount system info from the mount table at the bottom of lens pages."""
    for h in soup.find_all(["h2", "h3"]):
        text = h.get_text(strip=True).lower()
        if "mount" in text or "bayonet" in text:
            table = h.find_next("table")
            if table:
                info = {}
                for row in table.find_all("tr"):
                    cells = row.find_all(["th", "td"])
                    if len(cells) >= 2:
                        k = cells[0].get_text(strip=True).rstrip(":")
                        v = cells[1].get_text(strip=True)
                        if k and v:
                            info[k] = v
                if info:
                    return info
    return None


# ---------------------------------------------------------------------------
# Page parsers
# ---------------------------------------------------------------------------

def _extract_description(soup: BeautifulSoup) -> str | None:
    """Extract editorial description text from the page."""
    # Try "Description" tab/section via heading
    for h in soup.find_all(["h2", "h3", "h4"]):
        if "description" in h.get_text(strip=True).lower():
            # Collect all paragraphs until next heading
            parts = []
            for sib in h.find_next_siblings():
                if sib.name in ("h2", "h3", "h4"):
                    break
                text = sib.get_text(strip=True)
                if text and len(text) > 20:
                    parts.append(text)
            if parts:
                return " ".join(parts)

    # Try div.formatted-text (used in tabbed lens-db.com pages)
    for div in soup.find_all("div", class_="formatted-text"):
        raw = div.get_text(strip=True)
        if not raw or len(raw) < 30:
            continue
        # Strip leading label like "Manufacturer description" or "From the editor"
        text = re.sub(
            r"^(Manufacturer\s+description\s*#?\d*|From\s+the\s+editor)\s*",
            "", raw, flags=re.IGNORECASE,
        ).strip()
        if text and len(text) > 20:
            return text

    # Try div.field-item or tab-pane content
    for div in soup.find_all("div", class_=["field-item", "tab-pane"]):
        text = div.get_text(strip=True)
        if text and len(text) > 50:
            return text

    return None


def parse_lens_page(html: str, filename: str) -> dict | None:
    """Extract structured lens data from a lens-db.com page."""
    soup = BeautifulSoup(html, "lxml")

    data = {"_source_file": filename}

    # Name from h1
    h1 = soup.find("h1")
    if h1:
        name = h1.get_text(strip=True)
        # Skip if it's just the site name
        if name.upper() == "LENS-DB.COM":
            # Try <title> as fallback
            title = soup.find("title")
            if title:
                name = title.get_text(strip=True).replace(" | LENS-DB.COM", "").strip()
            else:
                return None
        data["name"] = name
    else:
        return None

    if not data.get("name"):
        return None

    # Subtitle (lens classification)
    subtitle = _extract_subtitle(soup)
    if subtitle:
        data["subtitle"] = subtitle
        # Parse out classification, era, and status
        parts = [p.strip() for p in subtitle.split("•")]
        if parts:
            data["lens_type"] = parts[0].strip()
        if len(parts) >= 2:
            data["era"] = parts[1].strip()
        if len(parts) >= 3:
            data["production_status"] = parts[2].strip()

    # Description
    desc = _extract_description(soup)
    if desc:
        data["description"] = desc

    # Specification table — the main data source
    spec_table = _find_table_after_heading(soup, "Specification")
    if spec_table:
        data["specs"] = _parse_spec_table(spec_table)
    else:
        # Some pages have specs without the "Specification" heading
        # Try to find a table with characteristic spec keys
        for table in soup.find_all("table"):
            rows = table.find_all("tr")
            if len(rows) < 5:
                continue
            text = table.get_text()
            if "Announced" in text and ("Focal length" in text or "Mount" in text or "Weight" in text):
                data["specs"] = _parse_spec_table(table)
                break

    # Model history table
    history_table = _find_table_after_heading(soup, "Model history")
    if history_table:
        models = []
        for row in history_table.find_all("tr"):
            cells = row.find_all(["th", "td"])
            if len(cells) >= 2:
                era = cells[0].get_text(strip=True)
                name = cells[1].get_text(strip=True)
                if name:
                    models.append({"era": era, "name": name})
        if models:
            data["model_history"] = models

    # Mount system info
    mount_info = _extract_mount_info(soup)
    if mount_info:
        data["mount_info"] = mount_info

    # Images
    images = _extract_images(soup)
    if images:
        data["images"] = images

    return data


def parse_camera_page(html: str, filename: str) -> dict | None:
    """Extract structured camera data from a lens-db.com camera page."""
    soup = BeautifulSoup(html, "lxml")

    data = {"_source_file": filename}

    h1 = soup.find("h1")
    if h1:
        data["name"] = h1.get_text(strip=True)
    if not data.get("name"):
        return None

    # Subtitle (camera type)
    subtitle = _extract_subtitle(soup)
    if subtitle:
        data["subtitle"] = subtitle

    # Description
    desc = _extract_description(soup)
    if desc:
        data["description"] = desc

    # Camera pages typically have a single spec table (no heading)
    # or one after a heading. Try heading first, fallback to first big table.
    spec_table = _find_table_after_heading(soup, "Specification")
    if not spec_table:
        # Camera pages often have their spec table as the first/only table
        for table in soup.find_all("table"):
            rows = table.find_all("tr")
            if len(rows) >= 5:
                text = table.get_text()
                if "Announced" in text:
                    spec_table = table
                    break

    if spec_table:
        data["specs"] = _parse_spec_table(spec_table)

    images = _extract_images(soup)
    if images:
        data["images"] = images

    return data


def parse_accessory_page(html: str, filename: str) -> dict | None:
    """Extract accessory data — same structure as lenses but tagged differently."""
    result = parse_lens_page(html, filename)
    if result:
        result["type"] = "accessory"
    return result


def parse_collection_page(html: str, filename: str) -> dict | None:
    """Extract collection data: name, description, and member lens URLs."""
    soup = BeautifulSoup(html, "lxml")

    data = {"_source_file": filename}

    h1 = soup.find("h1")
    if h1:
        name = h1.get_text(strip=True)
        if name.upper() == "LENS-DB.COM":
            title = soup.find("title")
            if title:
                name = title.get_text(strip=True).replace(" | LENS-DB.COM", "").strip()
            else:
                return None
        data["name"] = name
    else:
        return None

    if not data.get("name"):
        return None

    # Description
    desc = _extract_description(soup)
    if desc:
        data["description"] = desc

    # Extract member lens URLs from tables
    # Collection pages have tables where each row links to a lens page
    lens_urls = []
    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            cells = row.find_all(["th", "td"])
            if not cells:
                continue
            # First cell typically contains the lens link
            link = cells[0].find("a", href=True)
            if link:
                href = link.get("href", "")
                # Normalize to relative URL path
                href = href.replace("https://lens-db.com/", "").replace("http://lens-db.com/", "")
                href = href.strip("/")
                if href and not href.startswith("system/") and not href.startswith("collections/"):
                    lens_urls.append(href)

    data["lens_urls"] = lens_urls
    return data


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Parse lens-db.com archived pages")
    parser.add_argument("--input-dir", default="pages", help="Directory with downloaded HTML files")
    parser.add_argument("--urls-file", default="urls.json", help="URL list with categories")
    parser.add_argument("--output", default="data.json", help="Output JSON file")
    args = parser.parse_args()

    # Build a lookup from filename -> (category, original_url)
    url_meta: dict[str, dict] = {}
    if os.path.exists(args.urls_file):
        with open(args.urls_file) as f:
            urls = json.load(f)
        for entry in urls:
            path = entry["original"].replace("https://lens-db.com/", "").replace("http://lens-db.com/", "")
            path = path.strip("/").replace("/", "__")
            if not path:
                path = "index"
            url_meta[path + ".html"] = {
                "category": entry.get("category", "other"),
                "url": entry["original"],
            }

    results = {"lenses": [], "cameras": [], "accessories": [], "collections": [], "skipped": []}

    html_files = [f for f in os.listdir(args.input_dir) if f.endswith(".html")]
    print(f"Found {len(html_files)} HTML files to parse")

    parse_errors = 0
    for filename in sorted(html_files):
        filepath = os.path.join(args.input_dir, filename)
        with open(filepath, encoding="utf-8", errors="replace") as f:
            html = f.read()

        meta = url_meta.get(filename, {"category": "other", "url": ""})
        category = meta["category"]

        try:
            if category == "lens":
                parsed = parse_lens_page(html, filename)
                if parsed:
                    parsed["_url"] = meta["url"]
                    results["lenses"].append(parsed)
            elif category == "camera":
                parsed = parse_camera_page(html, filename)
                if parsed:
                    parsed["_url"] = meta["url"]
                    results["cameras"].append(parsed)
            elif category == "accessory":
                parsed = parse_accessory_page(html, filename)
                if parsed:
                    parsed["_url"] = meta["url"]
                    results["accessories"].append(parsed)
            elif category == "collection":
                parsed = parse_collection_page(html, filename)
                if parsed:
                    parsed["_url"] = meta["url"]
                    results["collections"].append(parsed)
            else:
                # blog, article, etc. — skip for now
                results["skipped"].append({"file": filename, "category": category})
        except Exception as e:
            parse_errors += 1
            print(f"  ERROR parsing {filename}: {e}")

    print(f"\nParsed data:")
    for key, items in results.items():
        print(f"  {key}: {len(items)}")
    if parse_errors:
        print(f"  errors: {parse_errors}")

    # Don't include skipped list in output
    output = {k: v for k, v in results.items() if k != "skipped"}

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nSaved to {args.output}")


if __name__ == "__main__":
    main()
