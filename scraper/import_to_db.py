"""
Step 4: Import parsed data into the Neon PostgreSQL database.

Reads structured JSON from parse_lenses.py and inserts into the DB.
Systems/mounts are extracted from lens specs (Mount field) rather than
being separate entities.

Requires DATABASE_URL environment variable.

Usage:
    DATABASE_URL="postgresql://..." python import_to_db.py [--input data.json] [--reset]
"""

import argparse
import json
import os
import re

import psycopg2
from psycopg2.extras import execute_values

DATABASE_URL = os.environ.get("DATABASE_URL")


def get_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is required")
    return psycopg2.connect(DATABASE_URL)


def create_tables(conn):
    """Create database tables if they don't exist."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS systems (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                slug TEXT NOT NULL UNIQUE,
                description TEXT,
                mount_type TEXT,
                manufacturer TEXT,
                flange_distance TEXT,
                view_count INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS lenses (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                url TEXT,
                brand TEXT,
                system_id INTEGER REFERENCES systems(id),
                description TEXT,
                lens_type TEXT,
                era TEXT,
                production_status TEXT,
                -- Common specs extracted as columns for filtering
                focal_length_min REAL,
                focal_length_max REAL,
                aperture_min REAL,
                aperture_max REAL,
                weight_g REAL,
                filter_size_mm REAL,
                min_focus_distance_m REAL,
                max_magnification REAL,
                lens_elements INTEGER,
                lens_groups INTEGER,
                diaphragm_blades INTEGER,
                year_introduced INTEGER,
                year_discontinued INTEGER,
                is_zoom BOOLEAN DEFAULT FALSE,
                is_macro BOOLEAN DEFAULT FALSE,
                is_prime BOOLEAN DEFAULT FALSE,
                has_stabilization BOOLEAN DEFAULT FALSE,
                has_autofocus BOOLEAN DEFAULT FALSE,
                -- Engagement
                view_count INTEGER DEFAULT 0,
                average_rating REAL,
                rating_count INTEGER DEFAULT 0,
                -- Full specs as JSON for anything else
                specs JSONB DEFAULT '{}',
                images JSONB DEFAULT '[]',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS cameras (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                url TEXT,
                system_id INTEGER REFERENCES systems(id),
                description TEXT,
                sensor_type TEXT,
                sensor_size TEXT,
                megapixels REAL,
                resolution TEXT,
                year_introduced INTEGER,
                body_type TEXT,
                weight_g REAL,
                view_count INTEGER DEFAULT 0,
                specs JSONB DEFAULT '{}',
                images JSONB DEFAULT '[]',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS collections (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS lens_collections (
                lens_id INTEGER REFERENCES lenses(id) ON DELETE CASCADE,
                collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
                PRIMARY KEY (lens_id, collection_id)
            );

            CREATE TABLE IF NOT EXISTS lens_compatibility (
                lens_id INTEGER REFERENCES lenses(id) ON DELETE CASCADE,
                camera_id INTEGER REFERENCES cameras(id) ON DELETE CASCADE,
                is_native BOOLEAN DEFAULT TRUE,
                notes TEXT,
                PRIMARY KEY (lens_id, camera_id)
            );

            -- Indexes for common queries
            CREATE INDEX IF NOT EXISTS idx_lenses_brand ON lenses(brand);
            CREATE INDEX IF NOT EXISTS idx_lenses_system ON lenses(system_id);
            CREATE INDEX IF NOT EXISTS idx_lenses_focal ON lenses(focal_length_min, focal_length_max);
            CREATE INDEX IF NOT EXISTS idx_lenses_aperture ON lenses(aperture_min);
            CREATE INDEX IF NOT EXISTS idx_lenses_year ON lenses(year_introduced);
            CREATE INDEX IF NOT EXISTS idx_lenses_zoom ON lenses(is_zoom);
            CREATE INDEX IF NOT EXISTS idx_lenses_macro ON lenses(is_macro);
            CREATE INDEX IF NOT EXISTS idx_cameras_system ON cameras(system_id);

            -- Ratings
            CREATE TABLE IF NOT EXISTS lens_ratings (
                id SERIAL PRIMARY KEY,
                lens_id INTEGER NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
                ip_hash TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(lens_id, ip_hash)
            );
            CREATE INDEX IF NOT EXISTS idx_lens_ratings_lens ON lens_ratings(lens_id);

            -- Comparisons
            CREATE TABLE IF NOT EXISTS lens_comparisons (
                id SERIAL PRIMARY KEY,
                lens_id_1 INTEGER NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
                lens_id_2 INTEGER NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
                view_count INTEGER DEFAULT 1,
                last_compared_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(lens_id_1, lens_id_2),
                CHECK(lens_id_1 < lens_id_2)
            );
            CREATE INDEX IF NOT EXISTS idx_lens_comparisons_views ON lens_comparisons(view_count DESC);

            -- Full-text search
            CREATE EXTENSION IF NOT EXISTS pg_trgm;
            CREATE INDEX IF NOT EXISTS idx_lenses_name_trgm ON lenses USING gin (name gin_trgm_ops);
            CREATE INDEX IF NOT EXISTS idx_cameras_name_trgm ON cameras USING gin (name gin_trgm_ops);
        """)
    conn.commit()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")


def canonical_slug(name: str) -> str:
    """Generate a canonical slug that collapses cosmetic name variants.

    This normalizes common differences that produce false "unique" slugs:
      - Brackets: [MM] and (MM) → mm
      - Mount prefixes: "C/Y " → stripped (already stored as system_id)
      - Case: "TESSAR" and "Tessar" → tessar

    Used as the ON CONFLICT key so cosmetic variants upsert instead of
    creating duplicates.
    """
    s = name.strip()
    # 1. Normalize brackets: [X] → (X) before slugify strips them
    s = re.sub(r"\[([^\]]*)\]", r"(\1)", s)
    # 2. Strip mount-system prefixes (redundant with system_id)
    s = re.sub(r"\s*C/Y\s+", " ", s)
    # 3. Collapse whitespace
    s = re.sub(r"\s+", " ", s).strip()
    return slugify(s)


def _is_valid_name(name: str) -> bool:
    """Check if a name is meaningful (not junk like '-', 'n/a', single chars, punctuation-only)."""
    if not name:
        return False
    clean = name.strip().lower()
    if clean in ("-", "n/a", "na", "none", "unknown", "–", "—"):
        return False
    if len(clean) <= 1:
        return False
    # Punctuation-only
    if all(c in "-.–—_/\\|()[]{}!@#$%^&*+=<>?,.:;'\" " for c in clean):
        return False
    return True


# Multi-word brand prefixes — checked first (longest match wins)
_MULTI_WORD_BRANDS = [
    ("Fuji Photo Film", "Fuji"),
    ("Auto Mamiya/Sekor", "Mamiya"),
    ("Auto Mamiya-Sekor", "Mamiya"),
    ("Asahi Super-Multi-Coated Takumar", "Asahi Pentax"),
    ("Asahi Super-Takumar", "Asahi Pentax"),
    ("Asahi Takumar", "Asahi Pentax"),
    ("Asahi Opt.", "Asahi Pentax"),
    ("Carl Zeiss", "Carl Zeiss"),
    ("Meyer-Optik Gorlitz", "Meyer-Optik Görlitz"),
    ("Meyer-Optik Görlitz", "Meyer-Optik Görlitz"),
    ("Schneider-Kreuznach", "Schneider-Kreuznach"),
    ("Schneider-KREUZNACH", "Schneider-Kreuznach"),
    ("Zenza Bronica", "Bronica"),
    ("Tokyo Kogaku", "Topcon"),
    ("Tokyo Optical", "Topcon"),
    ("Tokyo Opt.", "Topcon"),
    ("Sankyo Kohki", "Komura"),
    ("Kino Precision", "Kiron"),
    ("Fuji EBC", "Fuji"),
    ("Fuji Fujinon", "Fuji"),
    ("P. Angenieux", "Angénieux"),
    ("smc Pentax", "Pentax"),
    ("SMC Pentax", "Pentax"),
    ("HD Pentax", "Pentax"),
    ("RMC Tokina", "Tokina"),
    ("Auto Chinon", "Chinon"),
    ("Mamiya-Sekor", "Mamiya"),
    ("Sigma[-XQ]", "Sigma"),
]

# Single-word brands that need name normalization
_BRAND_ALIASES = {
    "Nikon": "Nikon",
    "Nikkor": "Nikon",
    "Canon": "Canon",
    "Minolta": "Minolta",
    "Sigma": "Sigma",
    "Leica": "Leica",
    "Leitz": "Leica",
    "Tamron": "Tamron",
    "Cosina": "Cosina",
    "Sony": "Sony",
    "Vivitar": "Vivitar",
    "Tokina": "Tokina",
    "Yashica": "Yashica",
    "Olympus": "Olympus",
    "Ricoh": "Ricoh",
    "Konica": "Konica",
    "Mamiya": "Mamiya",
    "Soligor": "Soligor",
    "Samyang": "Samyang",
    "Fujifilm": "Fuji",
    "Hasselblad": "Hasselblad",
    "Pentax": "Pentax",
    "Voigtlander": "Voigtländer",
    "Voigtländer": "Voigtländer",
    "Samsung": "Samsung",
    "Panasonic": "Panasonic",
    "Pentacon": "Pentacon",
    "Chinon": "Chinon",
    "Konishiroku": "Konica",
    "Chiyoko": "Minolta",
    "ZEISS": "Carl Zeiss",
    "Zeiss": "Carl Zeiss",
    "Enna": "Enna",
    "Panagor": "Panagor",
    "Kowa": "Kowa",
    "Petri": "Petri",
    "Rodenstock": "Rodenstock",
    "Albinar": "Albinar",
    "Kiron": "Kiron",
    "Komura": "Komura",
}


def parse_brand(name: str) -> str | None:
    """Extract the brand/manufacturer from a lens or camera name."""
    # Strip leading brackets like "[Auto]" or "(Auto)"
    clean = re.sub(r"^[\[\(][^\]\)]*[\]\)]\s*", "", name)

    # Try multi-word prefixes first (longest match)
    for prefix, brand in _MULTI_WORD_BRANDS:
        if clean.startswith(prefix):
            return brand

    # Try first word as single-word brand
    first_word = clean.split()[0] if clean.split() else ""
    if first_word in _BRAND_ALIASES:
        return _BRAND_ALIASES[first_word]

    # Fallback: return first word as-is if it looks like a brand (starts uppercase, not a number/spec)
    if first_word and first_word[0].isupper() and not re.match(r"\d", first_word) and _is_valid_name(first_word):
        return first_word

    return None


def _first_int(text: str) -> int | None:
    """Extract the first integer from a string."""
    m = re.search(r"(\d+)", text)
    return int(m.group(1)) if m else None


def _first_float(text: str) -> float | None:
    """Extract the first float from a string."""
    m = re.search(r"(\d+(?:\.\d+)?)", text)
    return float(m.group(1)) if m else None


def parse_focal_length(specs: dict, name: str) -> tuple[float | None, float | None]:
    """Extract focal length range from specs or lens name."""
    # Try spec keys first
    for key in ["Focal length"]:
        if key in specs and specs[key]:
            m = re.search(r"(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*mm", specs[key])
            if m:
                fl_min = float(m.group(1))
                fl_max = float(m.group(2)) if m.group(2) else fl_min
                return fl_min, fl_max

    # Fallback: parse from lens name (e.g. "Canon EF 70-200mm F/2.8L")
    m = re.search(r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*mm", name)
    if m:
        return float(m.group(1)), float(m.group(2))
    m = re.search(r"(\d+(?:\.\d+)?)\s*mm", name)
    if m:
        fl = float(m.group(1))
        return fl, fl

    return None, None


def parse_aperture(specs: dict, name: str) -> tuple[float | None, float | None]:
    """Extract aperture from specs or lens name."""
    # Try "Speed" key (lens-db.com uses this)
    for key in ["Speed", "Maximum aperture", "Aperture"]:
        if key in specs and specs[key]:
            m = re.search(r"[Ff]/?\s*(\d+(?:\.\d+)?)\s*(?:-\s*[Ff]/?\s*(\d+(?:\.\d+)?))?", specs[key])
            if m:
                ap_min = float(m.group(1))
                ap_max = float(m.group(2)) if m.group(2) else ap_min
                return ap_min, ap_max

    # Fallback: parse from lens name (e.g. "50mm F/1.4" or "70-200mm F/2.8-4")
    # Require the "/" to avoid matching "EF 14mm" as aperture
    m = re.search(r"[Ff]/(\d+(?:\.\d+)?)\s*(?:-\s*[Ff]?/?(\d+(?:\.\d+)?))?", name)
    if m:
        ap_min = float(m.group(1))
        ap_max = float(m.group(2)) if m.group(2) else ap_min
        return ap_min, ap_max

    return None, None


def parse_weight(specs: dict) -> float | None:
    """Extract weight in grams."""
    val = specs.get("Weight", "")
    if not val:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*g", val)
    return float(m.group(1)) if m else None


def parse_filter_size(specs: dict) -> float | None:
    """Extract filter thread size in mm."""
    val = specs.get("Filters", "")
    if not val:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*mm", val)
    return float(m.group(1)) if m else None


def parse_focus_distance(specs: dict) -> float | None:
    """Extract minimum focus distance in meters."""
    val = specs.get("Closest focusing distance", "")
    if not val:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*m", val)
    return float(m.group(1)) if m else None


def parse_elements_groups(specs: dict) -> tuple[int | None, int | None]:
    """Extract lens elements and groups from construction string."""
    val = specs.get("Lens construction", "")
    if not val:
        return None, None
    elements = None
    groups = None
    m = re.search(r"(\d+)\s*elements?", val)
    if m:
        elements = int(m.group(1))
    m = re.search(r"(\d+)\s*groups?", val)
    if m:
        groups = int(m.group(1))
    return elements, groups


def parse_blades(specs: dict) -> int | None:
    """Extract number of diaphragm blades."""
    val = specs.get("Number of blades", "")
    if not val:
        return None
    return _first_int(val)


def parse_year(specs: dict, key: str = "Announced", url: str = "") -> int | None:
    """Extract a year from a spec value, falling back to the URL slug."""
    val = specs.get(key, "")
    if val:
        m = re.search(r"((?:19|20)\d{2})", val)
        if m:
            return int(m.group(1))
    # Fallback: year at end of URL path (e.g. /canon-ef-50mm-f18-1987/)
    if url:
        path = url.replace("https://lens-db.com/", "").replace("http://lens-db.com/", "").strip("/")
        m = re.search(r"-(\d{4})/?$", path)
        if m:
            year = int(m.group(1))
            if 1800 <= year <= 2030:
                return year
    return None


def parse_mount_name(specs: dict) -> str | None:
    """Extract mount system name from specs."""
    # "Mount" is used on newer pages, "Mount and Flange focal distance" on older
    for key in ["Mount", "Mount and Flange focal distance"]:
        val = specs.get(key, "")
        if not val:
            continue
        # Clean up: "Canon EF" or "Exakta[44.7mm]; M42[45.5mm]"
        # Take the first mount if multiple
        val = val.split(";")[0].strip()
        # Remove flange distance bracket
        val = re.sub(r"\[.*?\]", "", val).strip()
        if _is_valid_name(val):
            return val
    return None


def has_autofocus(specs: dict) -> bool:
    modes = specs.get("Focusing modes", "").lower()
    return "autofocus" in modes or "af" in modes


def has_stabilization(specs: dict) -> bool:
    for key in ["Image Stabilizer (IS)", "Built-in OIS", "Sensor-shift image stabilization"]:
        val = specs.get(key, "").lower()
        if val and val not in ("none", "-", "no", ""):
            return True
    return False


def parse_magnification(specs: dict) -> float | None:
    """Extract max magnification ratio."""
    val = specs.get("Maximum magnification ratio", "") or specs.get("Magnification ratio", "")
    if not val or val == "<No data>":
        return None
    # Match patterns like "1:2", "0.5x", "1:5.56"
    m = re.search(r"1\s*:\s*(\d+(?:\.\d+)?)", val)
    if m:
        return 1.0 / float(m.group(1))
    m = re.search(r"(\d+(?:\.\d+)?)\s*x", val, re.IGNORECASE)
    if m:
        return float(m.group(1))
    return None


# ---------------------------------------------------------------------------
# Import functions
# ---------------------------------------------------------------------------

def get_or_create_system(cur, name: str, cache: dict) -> int | None:
    """Get or create a mount system, returning its ID."""
    if not name:
        return None
    if name in cache:
        return cache[name]

    slug = slugify(name)
    cur.execute(
        """INSERT INTO systems (name, slug)
           VALUES (%s, %s)
           ON CONFLICT (slug) DO NOTHING
           RETURNING id""",
        (name, slug)
    )
    result = cur.fetchone()
    if result:
        cache[name] = result[0]
        return result[0]

    # Already exists
    cur.execute("SELECT id FROM systems WHERE slug = %s", (slug,))
    result = cur.fetchone()
    if result:
        cache[name] = result[0]
        return result[0]

    return None


def _merge_images(base: list, other: list) -> list:
    """Merge two image lists, deduplicating by src URL."""
    seen = {(img.get("src") if isinstance(img, dict) else img) for img in base}
    merged = list(base)
    for img in other:
        src = img.get("src") if isinstance(img, dict) else img
        if src and src not in seen:
            merged.append(img)
            seen.add(src)
    return merged


def _merge_lens_row(keeper: dict, donor: dict):
    """Merge donor lens data into keeper in-place. Richer description wins name/desc."""
    # If donor has a longer description, take its name and description
    keeper_desc_len = len(keeper.get("description") or "")
    donor_desc_len = len(donor.get("description") or "")
    if donor_desc_len > keeper_desc_len:
        keeper["name"] = donor["name"]
        keeper["description"] = donor["description"]
        keeper["url"] = donor["url"] or keeper["url"]

    # Fill empty fields from donor
    fillable = [
        "brand", "system_id", "lens_type", "era", "production_status",
        "fl_min", "fl_max", "ap_min", "ap_max",
        "weight", "filter_size", "focus_dist", "magnification",
        "elements", "groups", "blades", "year",
    ]
    for field in fillable:
        if keeper.get(field) is None and donor.get(field) is not None:
            keeper[field] = donor[field]

    # Merge specs (keeper values win on conflict)
    donor_specs = donor.get("specs") or {}
    for k, v in donor_specs.items():
        if k not in keeper["specs"] or not keeper["specs"][k]:
            keeper["specs"][k] = v

    # Merge images
    keeper["images"] = _merge_images(keeper.get("images") or [], donor.get("images") or [])


def _lens_row_to_tuple(row: dict) -> tuple:
    """Convert a lens row dict to a tuple for execute_values."""
    return (
        row["name"], row["slug"], row["url"],
        row["brand"], row["system_id"], row["description"],
        row["lens_type"], row["era"], row["production_status"],
        row["fl_min"], row["fl_max"], row["ap_min"], row["ap_max"],
        row["weight"], row["filter_size"], row["focus_dist"], row["magnification"],
        row["elements"], row["groups"], row["blades"],
        row["year"],
        row["is_zoom"], row["is_macro"], row["is_prime"],
        row["stab"], row["af"],
        json.dumps(row["specs"]), json.dumps(row["images"]),
    )


def import_lenses(conn, lenses: list[dict]):
    """Import lenses into the database using batch inserts."""
    system_cache: dict[str, int] = {}
    skipped = 0
    total = len(lenses)

    # Phase 1: collect all unique mount names and create systems in one pass
    print("  Phase 1: Creating mount systems...", flush=True)
    mount_names = set()
    for lens in lenses:
        specs = lens.get("specs", {})
        mount_name = parse_mount_name(specs)
        if mount_name:
            mount_names.add(mount_name)

    with conn.cursor() as cur:
        for mount_name in mount_names:
            get_or_create_system(cur, mount_name, system_cache)
    conn.commit()
    print(f"  Created {len(system_cache)} mount systems", flush=True)

    # Phase 2: prepare all rows in memory, deduplicating by canonical slug
    print("  Phase 2: Preparing lens rows...", flush=True)
    prepared: list[dict] = []
    seen_canonical: dict[str, int] = {}  # canonical_slug → index in prepared
    deduped = 0
    for lens in lenses:
        name = lens.get("name", "").strip()
        if not name:
            skipped += 1
            continue

        url = lens.get("_url", "")
        url_path = url.replace("https://lens-db.com/", "").replace("http://lens-db.com/", "").strip("/")
        slug = url_path or slugify(name)
        if not slug:
            skipped += 1
            continue

        specs = lens.get("specs", {})
        mount_name = parse_mount_name(specs)
        system_id = system_cache.get(mount_name)

        brand = parse_brand(name)
        fl_min, fl_max = parse_focal_length(specs, name)
        ap_min, ap_max = parse_aperture(specs, name)
        weight = parse_weight(specs)
        filter_size = parse_filter_size(specs)
        focus_dist = parse_focus_distance(specs)
        elements, groups = parse_elements_groups(specs)
        blades = parse_blades(specs)
        year = parse_year(specs, url=url)
        magnification = parse_magnification(specs)

        is_zoom = fl_min is not None and fl_max is not None and fl_min != fl_max
        is_macro = "macro" in name.lower() or "micro" in name.lower()
        is_prime = not is_zoom and fl_min is not None
        af = has_autofocus(specs)
        stab = has_stabilization(specs)

        lens_type = lens.get("lens_type")
        era = lens.get("era")
        production_status = lens.get("production_status")
        if not production_status:
            ps = specs.get("Production status", "")
            if "discontinued" in ps.lower():
                production_status = "Discontinued"
            elif "in production" in ps.lower():
                production_status = "In production"

        description = lens.get("description")

        row = {
            "name": name, "slug": slug, "url": lens.get("_url"),
            "brand": brand, "system_id": system_id, "description": description,
            "lens_type": lens_type, "era": era, "production_status": production_status,
            "fl_min": fl_min, "fl_max": fl_max, "ap_min": ap_min, "ap_max": ap_max,
            "weight": weight, "filter_size": filter_size,
            "focus_dist": focus_dist, "magnification": magnification,
            "elements": elements, "groups": groups, "blades": blades,
            "year": year,
            "is_zoom": is_zoom, "is_macro": is_macro, "is_prime": is_prime,
            "stab": stab, "af": af,
            "specs": specs, "images": lens.get("images", []),
        }

        # Deduplicate by canonical slug — if we've seen this canonical form,
        # merge data into the existing row (keep the one with more data)
        canon = canonical_slug(name)
        if canon in seen_canonical:
            idx = seen_canonical[canon]
            existing = prepared[idx]
            _merge_lens_row(existing, row)
            deduped += 1
            continue

        seen_canonical[canon] = len(prepared)
        prepared.append(row)

    print(f"  Prepared {len(prepared)} rows ({skipped} skipped, {deduped} deduped)", flush=True)

    # Phase 3: batch insert — convert dicts to tuples for execute_values
    print("  Phase 3: Batch inserting...", flush=True)
    rows = [_lens_row_to_tuple(r) for r in prepared]
    batch_size = 500
    imported = 0
    with conn.cursor() as cur:
        for batch_start in range(0, len(rows), batch_size):
            batch = rows[batch_start : batch_start + batch_size]
            try:
                execute_values(
                    cur,
                    """INSERT INTO lenses (
                        name, slug, url, brand, system_id, description, lens_type, era, production_status,
                        focal_length_min, focal_length_max,
                        aperture_min, aperture_max,
                        weight_g, filter_size_mm, min_focus_distance_m, max_magnification,
                        lens_elements, lens_groups, diaphragm_blades,
                        year_introduced,
                        is_zoom, is_macro, is_prime,
                        has_stabilization, has_autofocus,
                        specs, images
                    ) VALUES %s
                    ON CONFLICT (slug) DO UPDATE SET
                        specs = EXCLUDED.specs,
                        images = EXCLUDED.images,
                        brand = COALESCE(EXCLUDED.brand, lenses.brand),
                        system_id = COALESCE(EXCLUDED.system_id, lenses.system_id),
                        description = COALESCE(EXCLUDED.description, lenses.description),
                        lens_type = COALESCE(EXCLUDED.lens_type, lenses.lens_type),
                        focal_length_min = COALESCE(EXCLUDED.focal_length_min, lenses.focal_length_min),
                        focal_length_max = COALESCE(EXCLUDED.focal_length_max, lenses.focal_length_max),
                        aperture_min = COALESCE(EXCLUDED.aperture_min, lenses.aperture_min),
                        aperture_max = COALESCE(EXCLUDED.aperture_max, lenses.aperture_max),
                        weight_g = COALESCE(EXCLUDED.weight_g, lenses.weight_g),
                        year_introduced = COALESCE(EXCLUDED.year_introduced, lenses.year_introduced)
                    """,
                    batch,
                    page_size=100,
                )
                imported += len(batch)
                print(f"  Lenses: {imported}/{len(rows)} inserted", flush=True)
            except Exception as e:
                print(f"  Error at batch {batch_start}: {e}", flush=True)
                conn.rollback()

    conn.commit()
    print(f"  Lenses done: {imported} imported, {skipped} skipped", flush=True)
    return system_cache


def import_cameras(conn, cameras: list[dict], system_cache: dict[str, int]):
    """Import cameras into the database using batch inserts."""
    skipped = 0

    # Phase 1: collect and create systems
    print("  Phase 1: Creating camera systems...", flush=True)
    with conn.cursor() as cur:
        for camera in cameras:
            specs = camera.get("specs", {})
            system_name = specs.get("System", "")
            system_name = re.sub(r"[●•]", "", system_name)
            system_name = re.sub(r"\(\d+\)", "", system_name).strip()
            if system_name:
                get_or_create_system(cur, system_name, system_cache)
            mount_name = parse_mount_name(specs)
            if mount_name:
                get_or_create_system(cur, mount_name, system_cache)
    conn.commit()
    print(f"  Systems cache now has {len(system_cache)} entries", flush=True)

    # Phase 2: prepare rows
    print("  Phase 2: Preparing camera rows...", flush=True)
    rows = []
    for camera in cameras:
        name = camera.get("name", "").strip()
        if not name:
            skipped += 1
            continue

        url = camera.get("_url", "")
        url_path = url.replace("https://lens-db.com/", "").replace("http://lens-db.com/", "").strip("/")
        slug = url_path or slugify(name)
        if not slug:
            skipped += 1
            continue

        specs = camera.get("specs", {})

        system_name = specs.get("System", "")
        system_name = re.sub(r"[●•]", "", system_name)
        system_name = re.sub(r"\(\d+\)", "", system_name).strip()
        system_id = system_cache.get(system_name)
        if not system_id:
            mount_name = parse_mount_name(specs)
            system_id = system_cache.get(mount_name)

        year = parse_year(specs, url=url)
        weight = parse_weight(specs)
        sensor_size = specs.get("Maximum format")
        sensor_type = None
        resolution = specs.get("Resolution")
        megapixels = None

        # Check multiple spec keys for sensor type (different cameras use different keys)
        imaging = specs.get("Imaging plane", "") or specs.get("Imaging sensor", "")
        if "CMOS" in imaging:
            sensor_type = "CMOS"
        elif "CCD" in imaging:
            sensor_type = "CCD"

        if resolution:
            m = re.search(r"(\d+(?:\.\d+)?)\s*MP", resolution)
            if m:
                megapixels = float(m.group(1))

        rows.append((
            name, slug, camera.get("_url"), system_id,
            sensor_type, sensor_size, megapixels, resolution,
            year, weight,
            json.dumps(specs), json.dumps(camera.get("images", []))
        ))

    print(f"  Prepared {len(rows)} rows ({skipped} skipped)", flush=True)

    # Phase 3: batch insert
    print("  Phase 3: Batch inserting...", flush=True)
    batch_size = 500
    imported = 0
    with conn.cursor() as cur:
        for batch_start in range(0, len(rows), batch_size):
            batch = rows[batch_start : batch_start + batch_size]
            try:
                execute_values(
                    cur,
                    """INSERT INTO cameras (
                        name, slug, url, system_id, sensor_type, sensor_size,
                        megapixels, resolution, year_introduced, weight_g, specs, images
                    ) VALUES %s
                    ON CONFLICT (slug) DO UPDATE SET
                        specs = EXCLUDED.specs,
                        images = EXCLUDED.images,
                        system_id = COALESCE(EXCLUDED.system_id, cameras.system_id),
                        sensor_type = COALESCE(EXCLUDED.sensor_type, cameras.sensor_type),
                        sensor_size = COALESCE(EXCLUDED.sensor_size, cameras.sensor_size),
                        resolution = COALESCE(EXCLUDED.resolution, cameras.resolution),
                        megapixels = COALESCE(EXCLUDED.megapixels, cameras.megapixels),
                        year_introduced = COALESCE(EXCLUDED.year_introduced, cameras.year_introduced)
                    """,
                    batch,
                    page_size=100,
                )
                imported += len(batch)
                print(f"  Cameras: {imported}/{len(rows)} inserted", flush=True)
            except Exception as e:
                print(f"  Error at batch {batch_start}: {e}", flush=True)
                conn.rollback()

    conn.commit()
    print(f"  Cameras done: {imported} imported, {skipped} skipped", flush=True)


def import_collections(conn, collections_data: list[dict]):
    """Import collections and link them to lenses via lens_collections."""
    imported = 0
    linked = 0

    for coll in collections_data:
        name = coll.get("name", "").strip()
        if not name or not _is_valid_name(name):
            continue

        url = coll.get("_url", "")
        url_path = url.replace("https://lens-db.com/", "").replace("http://lens-db.com/", "").strip("/")
        # Collection URLs look like "collections/anniversary-lenses"
        # Strip the "collections/" prefix for the slug
        slug = url_path.replace("collections/", "") if url_path.startswith("collections/") else slugify(name)
        if not slug:
            continue

        description = coll.get("description")

        with conn.cursor() as cur:
            # Upsert collection
            cur.execute(
                """INSERT INTO collections (name, slug, description)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (slug) DO UPDATE SET
                       description = COALESCE(EXCLUDED.description, collections.description)
                   RETURNING id""",
                (name, slug, description)
            )
            result = cur.fetchone()
            if not result:
                cur.execute("SELECT id FROM collections WHERE slug = %s", (slug,))
                result = cur.fetchone()
            if not result:
                continue

            collection_id = result[0]
            imported += 1

            # Link lenses by matching their URL slugs
            lens_urls = coll.get("lens_urls", [])
            for lens_slug in lens_urls:
                if not lens_slug:
                    continue
                cur.execute(
                    """INSERT INTO lens_collections (lens_id, collection_id)
                       SELECT id, %s FROM lenses WHERE slug = %s
                       ON CONFLICT DO NOTHING""",
                    (collection_id, lens_slug)
                )
                if cur.rowcount > 0:
                    linked += 1

    # Delete collections with no lenses
    with conn.cursor() as cur:
        cur.execute(
            """DELETE FROM collections
               WHERE id NOT IN (SELECT DISTINCT collection_id FROM lens_collections)"""
        )
        empty_count = cur.rowcount

    conn.commit()
    print(f"  Collections done: {imported} imported, {linked} lens links created, {empty_count} empty deleted", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Import lens data into Neon PostgreSQL")
    parser.add_argument("--input", default="data.json", help="Parsed data file")
    parser.add_argument("--reset", action="store_true", help="Drop and recreate tables")
    args = parser.parse_args()

    conn = get_connection()

    if args.reset:
        print("Resetting database tables...", flush=True)
        with conn.cursor() as cur:
            cur.execute("""
                DROP TABLE IF EXISTS lens_ratings CASCADE;
                DROP TABLE IF EXISTS lens_comparisons CASCADE;
                DROP TABLE IF EXISTS lens_compatibility CASCADE;
                DROP TABLE IF EXISTS lens_collections CASCADE;
                DROP TABLE IF EXISTS collections CASCADE;
                DROP TABLE IF EXISTS cameras CASCADE;
                DROP TABLE IF EXISTS lenses CASCADE;
                DROP TABLE IF EXISTS systems CASCADE;
            """)
        conn.commit()
        print("  Tables dropped.", flush=True)

    print("Creating tables...", flush=True)
    create_tables(conn)
    print("  Tables created.", flush=True)

    print("Loading data...", flush=True)
    with open(args.input) as f:
        data = json.load(f)
    print(f"  Loaded {len(data.get('lenses', []))} lenses, {len(data.get('cameras', []))} cameras, "
          f"{len(data.get('collections', []))} collections", flush=True)

    print("Importing lenses...", flush=True)
    system_cache = import_lenses(conn, data.get("lenses", []))

    print("Importing cameras...", flush=True)
    import_cameras(conn, data.get("cameras", []), system_cache)

    if data.get("collections"):
        print("Importing collections...", flush=True)
        import_collections(conn, data.get("collections", []))

    print("All done!", flush=True)

    # Summary
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM systems")
        print(f"\nTotal systems: {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM lenses")
        print(f"Total lenses: {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM cameras")
        print(f"Total cameras: {cur.fetchone()[0]}")

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
