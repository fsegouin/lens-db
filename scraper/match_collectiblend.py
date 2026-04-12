"""
Step 2: Match our DB entries to the CollectiBlend catalog.

Uses fuzzy string matching to find the best match for each of our cameras/lenses
in the CollectiBlend catalog. Outputs a mapping file for use by the price scraper.

Usage:
    DATABASE_URL="postgresql://..." python match_collectiblend.py \
        [--catalog collectiblend_catalog.json] \
        [--output collectiblend_matches.json] \
        [--type cameras] [--type lenses] \
        [--threshold 70]
"""

import argparse
import json
import os
import re
import unicodedata

import psycopg2

DATABASE_URL = os.environ.get("DATABASE_URL")


def get_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is required")
    return psycopg2.connect(DATABASE_URL)


def normalize(name: str) -> str:
    """Normalize a name for comparison: lowercase, strip accents, simplify whitespace."""
    # Normalize unicode
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    # Lowercase
    name = name.lower()
    # Remove common noise characters
    name = name.replace("'", "").replace('"', "").replace("'", "")
    # Normalize whitespace
    name = re.sub(r"\s+", " ", name).strip()
    return name


def tokenize(name: str) -> set[str]:
    """Split a normalized name into tokens for comparison."""
    # Split on spaces, hyphens, slashes, parentheses
    tokens = re.split(r"[\s\-/(),.]+", normalize(name))
    result = set()
    for t in tokens:
        if not t:
            continue
        result.add(t)
        # Also split on letter/digit boundaries (e.g., "1v" -> "1", "v")
        # This helps match "EOS 1V" with "EOS 1 V"
        sub = re.split(r"(?<=\d)(?=[a-z])|(?<=[a-z])(?=\d)", t)
        if len(sub) > 1:
            result.update(sub)
    return result


def similarity_score(name_a: str, name_b: str) -> float:
    """Calculate similarity between two names using token overlap + prefix matching."""
    norm_a = normalize(name_a)
    norm_b = normalize(name_b)

    # Exact match after normalization
    if norm_a == norm_b:
        return 100.0

    # Also check with all spaces/hyphens removed (catches "1V" vs "1 V", "AE1" vs "AE-1")
    compact_a = re.sub(r"[\s\-]+", "", norm_a)
    compact_b = re.sub(r"[\s\-]+", "", norm_b)
    if compact_a == compact_b:
        return 98.0

    tokens_a = tokenize(name_a)
    tokens_b = tokenize(name_b)

    if not tokens_a or not tokens_b:
        return 0.0

    # Token overlap (Jaccard-like but weighted toward recall of our tokens)
    intersection = tokens_a & tokens_b
    if not intersection:
        return 0.0

    # How many of our tokens are found in theirs
    recall = len(intersection) / len(tokens_a)
    # How many of their tokens match ours
    precision = len(intersection) / len(tokens_b)

    # F1-like score weighted toward recall (we want to find our items in their catalog)
    if recall + precision == 0:
        return 0.0
    f1 = 2 * (recall * precision) / (recall + precision)

    # Bonus for substring containment
    bonus = 0.0
    if norm_a in norm_b or norm_b in norm_a:
        bonus = 15.0

    # Bonus for compact form containment (handles spacing differences)
    if compact_a in compact_b or compact_b in compact_a:
        bonus = max(bonus, 10.0)

    return min(100.0, f1 * 85.0 + bonus)


def extract_camera_manufacturer(name: str) -> str | None:
    """Try to extract the manufacturer from a camera name."""
    # Camera names typically start with the manufacturer
    # e.g., "Canon AE-1", "Nikon F3", "Leica M6"
    parts = name.split()
    if parts:
        return parts[0]
    return None


def extract_lens_brand(brand: str | None, name: str) -> str | None:
    """Get the brand for a lens, from the brand field or the name."""
    if brand:
        return brand
    parts = name.split()
    if parts:
        return parts[0]
    return None


# Map our brand/manufacturer names to CollectiBlend manufacturer URL slugs
BRAND_ALIASES = {
    # Cameras
    "canon": "Canon",
    "nikon": "Nikon",
    "leica": "Leitz",
    "leitz": "Leitz",
    "pentax": "Asahi",
    "asahi": "Asahi",
    "olympus": "Olympus",
    "minolta": "Minolta",
    "contax": "Yashica",
    "yashica": "Yashica",
    "zeiss": "Zeiss-Ikon",
    "zeiss ikon": "Zeiss-Ikon",
    "carl zeiss": "Carl-Zeiss",
    "carl zeiss jena": "Carl-Zeiss-Jena",
    "hasselblad": "Hasselblad",
    "mamiya": "Mamiya",
    "mamiya/sekor": "Mamiya",
    "fuji": "Fuji-Optical",
    "fujifilm": "Fuji-Optical",
    "fujica": "Fuji-Optical",
    "kodak": "Kodak-Eastman",
    "ricoh": "Riken-(Ricoh)",
    "voigtlander": "Voigtlander",
    "voigtländer": "Voigtlander",
    "rollei": "Rollei",
    "rolleiflex": "Rollei",
    "rolleicord": "Rollei",
    "polaroid": "Polaroid",
    "sony": "Sony",
    "sigma": "Sigma",
    "tamron": "Tamron",
    "tokina": "Tokina",
    "konica": "Konica",
    "konica minolta": "Konica-Minolta",
    "miranda": "Miranda",
    "praktica": "KW-(KameraWerkstatten)",
    "zenit": "KMZ-(Zenit)",
    "kiev": "Kiev",
    "fed": "FED",
    "chinon": "Chinon",
    "cosina": "Cosina",
    "schneider": "Schneider",
    "rodenstock": "Rodenstock",
    "angénieux": "Angenieux",
    "angenieux": "Angenieux",
    "bronica": "Zenza",
    "zenza": "Zenza",
    "alpa": "Pignons",
    "exakta": "Ihagee",
    "topcon": "Tokyo-Kogaku",
    "nikkormat": "Nikon",
    "nikomat": "Nikon",
    "leotax": "Leotax",
    "graflex": "Graflex",
    "argus": "Argus",
    "bell & howell": "Bell-&-Howell",
    "minox": "Minox",
    "petri": "Kuribayashi-(Petri)",
    "agfa": "AGFA",
    "ilford": "Ilford",
}


def find_manufacturer_match(brand: str, catalog_items: list[dict]) -> list[dict]:
    """Filter catalog items to those from a matching manufacturer."""
    brand_lower = brand.lower().strip()

    # Check our alias map first
    alias = BRAND_ALIASES.get(brand_lower)

    # Get unique manufacturers from catalog
    manufacturers = {item["manufacturer"] for item in catalog_items}

    matched_mfr = None
    if alias:
        # Direct alias lookup
        if alias in manufacturers:
            matched_mfr = alias

    if not matched_mfr:
        # Try exact match
        for mfr in manufacturers:
            if mfr.lower() == brand_lower:
                matched_mfr = mfr
                break

    if not matched_mfr:
        # Try substring match
        for mfr in manufacturers:
            mfr_lower = mfr.lower().replace("-", " ").replace("(", "").replace(")", "")
            if brand_lower in mfr_lower or mfr_lower.startswith(brand_lower):
                matched_mfr = mfr
                break

    if matched_mfr:
        return [item for item in catalog_items if item["manufacturer"] == matched_mfr]
    return []


def match_cameras(db_cameras: list[dict], catalog_cameras: list[dict],
                   threshold: float) -> list[dict]:
    """Match our camera entries to CollectiBlend catalog entries."""
    matches = []

    for cam in db_cameras:
        brand = extract_camera_manufacturer(cam["name"])
        if not brand:
            matches.append({
                "db_id": cam["id"],
                "db_name": cam["name"],
                "db_slug": cam["slug"],
                "match": None,
                "score": 0,
                "status": "no_brand",
            })
            continue

        # Filter catalog to same manufacturer
        candidates = find_manufacturer_match(brand, catalog_cameras)
        if not candidates:
            matches.append({
                "db_id": cam["id"],
                "db_name": cam["name"],
                "db_slug": cam["slug"],
                "match": None,
                "score": 0,
                "status": "no_manufacturer",
                "brand": brand,
            })
            continue

        # Score each candidate
        best_score = 0
        best_match = None
        for candidate in candidates:
            score = similarity_score(cam["name"], candidate["name"])
            if score > best_score:
                best_score = score
                best_match = candidate

        if best_score >= threshold:
            matches.append({
                "db_id": cam["id"],
                "db_name": cam["name"],
                "db_slug": cam["slug"],
                "match": best_match,
                "score": round(best_score, 1),
                "status": "matched",
            })
        else:
            matches.append({
                "db_id": cam["id"],
                "db_name": cam["name"],
                "db_slug": cam["slug"],
                "match": best_match,
                "score": round(best_score, 1),
                "status": "below_threshold",
            })

    return matches


def match_lenses(db_lenses: list[dict], catalog_lenses: list[dict],
                  threshold: float) -> list[dict]:
    """Match our lens entries to CollectiBlend catalog entries."""
    matches = []

    for lens in db_lenses:
        brand = extract_lens_brand(lens.get("brand"), lens["name"])
        if not brand:
            matches.append({
                "db_id": lens["id"],
                "db_name": lens["name"],
                "db_slug": lens["slug"],
                "match": None,
                "score": 0,
                "status": "no_brand",
            })
            continue

        candidates = find_manufacturer_match(brand, catalog_lenses)
        if not candidates:
            matches.append({
                "db_id": lens["id"],
                "db_name": lens["name"],
                "db_slug": lens["slug"],
                "match": None,
                "score": 0,
                "status": "no_manufacturer",
                "brand": brand,
            })
            continue

        best_score = 0
        best_match = None
        for candidate in candidates:
            score = similarity_score(lens["name"], candidate["name"])
            if score > best_score:
                best_score = score
                best_match = candidate

        if best_score >= threshold:
            matches.append({
                "db_id": lens["id"],
                "db_name": lens["name"],
                "db_slug": lens["slug"],
                "match": best_match,
                "score": round(best_score, 1),
                "status": "matched",
            })
        else:
            matches.append({
                "db_id": lens["id"],
                "db_name": lens["name"],
                "db_slug": lens["slug"],
                "match": best_match,
                "score": round(best_score, 1),
                "status": "below_threshold",
            })

    return matches


def main():
    parser = argparse.ArgumentParser(description="Match DB entries to CollectiBlend catalog")
    parser.add_argument("--catalog", default="collectiblend_catalog.json",
                        help="Input catalog JSON file")
    parser.add_argument("--output", default="collectiblend_matches.json",
                        help="Output matches JSON file")
    parser.add_argument("--type", action="append", dest="types",
                        choices=["cameras", "lenses"],
                        help="What to match (default: both)")
    parser.add_argument("--threshold", type=float, default=85.0,
                        help="Minimum similarity score to consider a match (default: 85)")
    args = parser.parse_args()

    # Load catalog
    with open(args.catalog, "r") as f:
        catalog = json.load(f)

    types_to_match = args.types or ["cameras", "lenses"]
    results = {}

    conn = get_connection()

    try:
        with conn.cursor() as cur:
            if "cameras" in types_to_match and "cameras" in catalog:
                print("\n=== Matching Cameras ===")
                cur.execute("SELECT id, name, slug FROM cameras WHERE merged_into_id IS NULL ORDER BY name")
                db_cameras = [{"id": r[0], "name": r[1], "slug": r[2]} for r in cur.fetchall()]
                print(f"  DB cameras: {len(db_cameras)}")
                print(f"  Catalog cameras: {len(catalog['cameras'])}")

                camera_matches = match_cameras(db_cameras, catalog["cameras"], args.threshold)
                results["cameras"] = camera_matches

                matched = sum(1 for m in camera_matches if m["status"] == "matched")
                below = sum(1 for m in camera_matches if m["status"] == "below_threshold")
                no_mfr = sum(1 for m in camera_matches if m["status"] == "no_manufacturer")
                print(f"  Results: {matched} matched, {below} below threshold, {no_mfr} no manufacturer found")

            if "lenses" in types_to_match and "lenses" in catalog:
                print("\n=== Matching Lenses ===")
                cur.execute("SELECT id, name, slug, brand FROM lenses WHERE merged_into_id IS NULL ORDER BY name")
                db_lenses = [{"id": r[0], "name": r[1], "slug": r[2], "brand": r[3]} for r in cur.fetchall()]
                print(f"  DB lenses: {len(db_lenses)}")
                print(f"  Catalog lenses: {len(catalog['lenses'])}")

                lens_matches = match_lenses(db_lenses, catalog["lenses"], args.threshold)
                results["lenses"] = lens_matches

                matched = sum(1 for m in lens_matches if m["status"] == "matched")
                below = sum(1 for m in lens_matches if m["status"] == "below_threshold")
                no_mfr = sum(1 for m in lens_matches if m["status"] == "no_manufacturer")
                print(f"  Results: {matched} matched, {below} below threshold, {no_mfr} no manufacturer found")

    finally:
        conn.close()

    # Save results
    with open(args.output, "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\nMatches saved to {args.output}")


if __name__ == "__main__":
    main()
