"""
Step 3: Parse downloaded lens pages and extract structured data.
This is the main data extraction script.

Usage:
    python parse_lenses.py [--input-dir pages/] [--output data.json]
"""

import argparse
import json
import os
import re
from bs4 import BeautifulSoup


def parse_lens_page(html: str, filename: str) -> dict | None:
    """Extract lens data from an archived lens-db.com page."""
    soup = BeautifulSoup(html, "lxml")

    data = {"_source_file": filename}

    # Page title - usually contains the lens name
    title_el = soup.find("h1")
    if title_el:
        data["name"] = title_el.get_text(strip=True)
    else:
        title_tag = soup.find("title")
        if title_tag:
            data["name"] = title_tag.get_text(strip=True).replace(" | LENS-DB.COM", "")

    if not data.get("name"):
        return None

    # Try to extract specification table
    specs = {}
    spec_tables = soup.find_all("table")
    for table in spec_tables:
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all(["th", "td"])
            if len(cells) >= 2:
                key = cells[0].get_text(strip=True)
                value = cells[1].get_text(strip=True)
                if key and value:
                    specs[key] = value

    if specs:
        data["specs"] = specs

    # Extract description/body text
    content_div = (
        soup.find("div", class_="entry-content")
        or soup.find("div", class_="content")
        or soup.find("article")
        or soup.find("main")
    )
    if content_div:
        # Get paragraphs
        paragraphs = content_div.find_all("p")
        text_parts = [p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True)]
        if text_parts:
            data["description"] = "\n\n".join(text_parts)

    # Extract images
    images = []
    if content_div:
        for img in content_div.find_all("img"):
            src = img.get("src", "")
            alt = img.get("alt", "")
            if src and "lens-db.com" in src:
                # Clean Wayback Machine URL prefix
                clean_src = re.sub(r"https?://web\.archive\.org/web/\d+/", "", src)
                images.append({"src": clean_src, "alt": alt})
    if images:
        data["images"] = images

    # Extract breadcrumb for system/category info
    breadcrumb = soup.find("nav", class_="breadcrumb") or soup.find("div", class_="breadcrumb")
    if breadcrumb:
        links = breadcrumb.find_all("a")
        crumbs = [{"text": a.get_text(strip=True), "href": a.get("href", "")} for a in links]
        if crumbs:
            data["breadcrumbs"] = crumbs
            # Second crumb is usually the system
            if len(crumbs) >= 2:
                data["system"] = crumbs[1]["text"]

    # Extract lists (often used for features, compatibility, etc.)
    if content_div:
        for ul in content_div.find_all("ul"):
            items = [li.get_text(strip=True) for li in ul.find_all("li")]
            if items:
                # Try to identify what kind of list this is
                parent = ul.find_previous_sibling(["h2", "h3", "h4"])
                if parent:
                    key = parent.get_text(strip=True).lower().replace(" ", "_")
                    data[key] = items

    return data


def parse_system_page(html: str, filename: str) -> dict | None:
    """Extract camera system data from an archived page."""
    soup = BeautifulSoup(html, "lxml")

    data = {"_source_file": filename, "type": "system"}

    title_el = soup.find("h1")
    if title_el:
        data["name"] = title_el.get_text(strip=True)

    if not data.get("name"):
        return None

    # Extract lens list for this system
    lenses = []
    content_div = (
        soup.find("div", class_="entry-content")
        or soup.find("div", class_="content")
        or soup.find("article")
        or soup.find("main")
    )
    if content_div:
        for link in content_div.find_all("a"):
            href = link.get("href", "")
            text = link.get_text(strip=True)
            if text and "/lens-db.com/" not in href:
                lenses.append({"name": text, "href": href})

    if lenses:
        data["lenses"] = lenses

    # Extract description
    if content_div:
        paragraphs = content_div.find_all("p")
        text_parts = [p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True)]
        if text_parts:
            data["description"] = "\n\n".join(text_parts)

    return data


def parse_camera_page(html: str, filename: str) -> dict | None:
    """Extract camera data from an archived page."""
    soup = BeautifulSoup(html, "lxml")

    data = {"_source_file": filename, "type": "camera"}

    title_el = soup.find("h1")
    if title_el:
        data["name"] = title_el.get_text(strip=True)

    if not data.get("name"):
        return None

    # Extract spec table
    specs = {}
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all(["th", "td"])
            if len(cells) >= 2:
                key = cells[0].get_text(strip=True)
                value = cells[1].get_text(strip=True)
                if key and value:
                    specs[key] = value
    if specs:
        data["specs"] = specs

    return data


def main():
    parser = argparse.ArgumentParser(description="Parse lens-db.com archived pages")
    parser.add_argument("--input-dir", default="pages", help="Directory with downloaded HTML files")
    parser.add_argument("--urls-file", default="urls.json", help="URL list with categories")
    parser.add_argument("--output", default="data.json", help="Output JSON file")
    args = parser.parse_args()

    # Load URL categories
    url_categories = {}
    if os.path.exists(args.urls_file):
        with open(args.urls_file) as f:
            urls = json.load(f)
        for entry in urls:
            filename = entry["original"].replace("https://lens-db.com/", "").replace("http://lens-db.com/", "")
            filename = filename.strip("/").replace("/", "__")
            if not filename:
                filename = "index"
            url_categories[filename + ".html"] = entry.get("category", "other")

    results = {"lenses": [], "systems": [], "cameras": [], "other": []}

    html_files = [f for f in os.listdir(args.input_dir) if f.endswith(".html")]
    print(f"Found {len(html_files)} HTML files to parse")

    for filename in sorted(html_files):
        filepath = os.path.join(args.input_dir, filename)
        with open(filepath, encoding="utf-8", errors="replace") as f:
            html = f.read()

        category = url_categories.get(filename, "other")

        if category == "lens":
            parsed = parse_lens_page(html, filename)
            if parsed:
                results["lenses"].append(parsed)
        elif category == "system":
            parsed = parse_system_page(html, filename)
            if parsed:
                results["systems"].append(parsed)
        elif category == "camera":
            parsed = parse_camera_page(html, filename)
            if parsed:
                results["cameras"].append(parsed)
        else:
            parsed = parse_lens_page(html, filename)  # Generic parse
            if parsed:
                results["other"].append(parsed)

    print(f"\nParsed data:")
    for key, items in results.items():
        print(f"  {key}: {len(items)}")

    with open(args.output, "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nSaved to {args.output}")


if __name__ == "__main__":
    main()
