"""
Step 4: Import parsed data into the Neon PostgreSQL database.

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
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS lenses (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                system_id INTEGER REFERENCES systems(id),
                description TEXT,
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
                -- Full specs as JSON for anything else
                specs JSONB DEFAULT '{}',
                images JSONB DEFAULT '[]',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS cameras (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                system_id INTEGER REFERENCES systems(id),
                description TEXT,
                sensor_type TEXT,
                sensor_size TEXT,
                megapixels REAL,
                year_introduced INTEGER,
                body_type TEXT,
                specs JSONB DEFAULT '{}',
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
            CREATE INDEX IF NOT EXISTS idx_lenses_system ON lenses(system_id);
            CREATE INDEX IF NOT EXISTS idx_lenses_focal ON lenses(focal_length_min, focal_length_max);
            CREATE INDEX IF NOT EXISTS idx_lenses_aperture ON lenses(aperture_min);
            CREATE INDEX IF NOT EXISTS idx_lenses_year ON lenses(year_introduced);
            CREATE INDEX IF NOT EXISTS idx_lenses_zoom ON lenses(is_zoom);
            CREATE INDEX IF NOT EXISTS idx_lenses_macro ON lenses(is_macro);
            CREATE INDEX IF NOT EXISTS idx_cameras_system ON cameras(system_id);

            -- Full-text search
            CREATE INDEX IF NOT EXISTS idx_lenses_name_trgm ON lenses USING gin (name gin_trgm_ops);
            CREATE INDEX IF NOT EXISTS idx_cameras_name_trgm ON cameras USING gin (name gin_trgm_ops);
        """)
    conn.commit()


def slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")


def parse_focal_length(specs: dict) -> tuple[float | None, float | None]:
    """Extract focal length range from specs."""
    for key in ["Focal length", "Focal Length", "focal_length"]:
        if key in specs:
            val = specs[key]
            # Match patterns like "70-200mm" or "50mm"
            match = re.search(r"(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*mm", val)
            if match:
                fl_min = float(match.group(1))
                fl_max = float(match.group(2)) if match.group(2) else fl_min
                return fl_min, fl_max
    return None, None


def parse_aperture(specs: dict) -> tuple[float | None, float | None]:
    """Extract aperture from specs."""
    for key in ["Maximum aperture", "Aperture", "Max. aperture", "aperture"]:
        if key in specs:
            val = specs[key]
            match = re.search(r"f/(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?", val)
            if match:
                ap_min = float(match.group(1))
                ap_max = float(match.group(2)) if match.group(2) else ap_min
                return ap_min, ap_max
    return None, None


def parse_weight(specs: dict) -> float | None:
    for key in ["Weight", "weight"]:
        if key in specs:
            match = re.search(r"(\d+(?:\.\d+)?)\s*g", specs[key])
            if match:
                return float(match.group(1))
    return None


def import_systems(conn, systems: list[dict]) -> dict[str, int]:
    """Import systems and return name->id mapping."""
    name_to_id = {}
    with conn.cursor() as cur:
        for system in systems:
            name = system.get("name", "").strip()
            if not name:
                continue
            slug = slugify(name)
            try:
                cur.execute(
                    """INSERT INTO systems (name, slug, description)
                       VALUES (%s, %s, %s)
                       ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description
                       RETURNING id""",
                    (name, slug, system.get("description"))
                )
                name_to_id[name] = cur.fetchone()[0]
            except Exception as e:
                print(f"  Error importing system '{name}': {e}")
                conn.rollback()
    conn.commit()
    return name_to_id


def import_lenses(conn, lenses: list[dict], system_ids: dict[str, int]):
    """Import lenses into the database."""
    imported = 0
    with conn.cursor() as cur:
        for lens in lenses:
            name = lens.get("name", "").strip()
            if not name:
                continue

            slug = slugify(name)
            specs = lens.get("specs", {})
            system_name = lens.get("system", "")
            system_id = system_ids.get(system_name)

            # If system not found by exact name, try to create it
            if not system_id and system_name:
                sys_slug = slugify(system_name)
                cur.execute(
                    """INSERT INTO systems (name, slug)
                       VALUES (%s, %s)
                       ON CONFLICT (slug) DO NOTHING
                       RETURNING id""",
                    (system_name, sys_slug)
                )
                result = cur.fetchone()
                if result:
                    system_id = result[0]
                    system_ids[system_name] = system_id
                else:
                    cur.execute("SELECT id FROM systems WHERE slug = %s", (sys_slug,))
                    result = cur.fetchone()
                    if result:
                        system_id = result[0]
                        system_ids[system_name] = system_id

            fl_min, fl_max = parse_focal_length(specs)
            ap_min, ap_max = parse_aperture(specs)
            weight = parse_weight(specs)

            is_zoom = fl_min is not None and fl_max is not None and fl_min != fl_max
            is_macro = "macro" in name.lower() or "micro" in name.lower()
            is_prime = not is_zoom and fl_min is not None

            try:
                cur.execute(
                    """INSERT INTO lenses (
                        name, slug, system_id, description,
                        focal_length_min, focal_length_max,
                        aperture_min, aperture_max,
                        weight_g, is_zoom, is_macro, is_prime,
                        specs, images
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (slug) DO UPDATE SET
                        specs = EXCLUDED.specs,
                        description = EXCLUDED.description""",
                    (
                        name, slug, system_id, lens.get("description"),
                        fl_min, fl_max, ap_min, ap_max,
                        weight, is_zoom, is_macro, is_prime,
                        json.dumps(specs), json.dumps(lens.get("images", []))
                    )
                )
                imported += 1
            except Exception as e:
                print(f"  Error importing lens '{name}': {e}")
                conn.rollback()

    conn.commit()
    print(f"  Imported {imported} lenses")


def import_cameras(conn, cameras: list[dict], system_ids: dict[str, int]):
    """Import cameras into the database."""
    imported = 0
    with conn.cursor() as cur:
        for camera in cameras:
            name = camera.get("name", "").strip()
            if not name:
                continue

            slug = slugify(name)
            specs = camera.get("specs", {})

            try:
                cur.execute(
                    """INSERT INTO cameras (name, slug, description, specs)
                       VALUES (%s, %s, %s, %s)
                       ON CONFLICT (slug) DO UPDATE SET specs = EXCLUDED.specs""",
                    (name, slug, camera.get("description"), json.dumps(specs))
                )
                imported += 1
            except Exception as e:
                print(f"  Error importing camera '{name}': {e}")
                conn.rollback()

    conn.commit()
    print(f"  Imported {imported} cameras")


def main():
    parser = argparse.ArgumentParser(description="Import lens data into Neon PostgreSQL")
    parser.add_argument("--input", default="data.json", help="Parsed data file")
    parser.add_argument("--reset", action="store_true", help="Drop and recreate tables")
    args = parser.parse_args()

    conn = get_connection()

    # Enable pg_trgm for fuzzy text search
    with conn.cursor() as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    conn.commit()

    if args.reset:
        print("Resetting database tables...")
        with conn.cursor() as cur:
            cur.execute("""
                DROP TABLE IF EXISTS lens_compatibility CASCADE;
                DROP TABLE IF EXISTS lens_collections CASCADE;
                DROP TABLE IF EXISTS collections CASCADE;
                DROP TABLE IF EXISTS cameras CASCADE;
                DROP TABLE IF EXISTS lenses CASCADE;
                DROP TABLE IF EXISTS systems CASCADE;
            """)
        conn.commit()

    print("Creating tables...")
    create_tables(conn)

    print("Loading data...")
    with open(args.input) as f:
        data = json.load(f)

    print(f"Importing {len(data.get('systems', []))} systems...")
    system_ids = import_systems(conn, data.get("systems", []))

    print(f"Importing {len(data.get('lenses', []))} lenses...")
    import_lenses(conn, data.get("lenses", []), system_ids)

    print(f"Importing {len(data.get('cameras', []))} cameras...")
    import_cameras(conn, data.get("cameras", []), system_ids)

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
