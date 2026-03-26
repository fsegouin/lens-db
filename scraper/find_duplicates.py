#!/usr/bin/env python3
"""
Find and merge duplicate lenses in the database.

Duplicates are identified by normalizing lens names:
  1. Lowercase for comparison
  2. Normalize brackets: [X] → (X)
  3. Strip mount-system prefixes: "C/Y " (already stored as system_id)
  4. Collapse whitespace

For each duplicate group, the lens with the highest "richness score" is kept.
The others get their data merged into the keeper, then are deleted.

Usage:
  python find_duplicates.py                  # Dry run — show duplicates
  python find_duplicates.py --merge          # Actually merge and delete duplicates
  python find_duplicates.py --merge --verbose  # Merge with detailed output
"""

import argparse
import json
import os
import re
import sys

import psycopg2
import psycopg2.extras


# ---------------------------------------------------------------------------
# Canonical name normalization
# ---------------------------------------------------------------------------

# Mount-system prefixes that appear in lens names but are redundant
# (the mount info is already stored in system_id)
_MOUNT_PREFIXES = [
    r"C/Y\s+",  # Contax/Yashica
]


def canonical_name(name: str) -> str:
    """Normalize a lens name for duplicate comparison.

    This does NOT change the stored name — it's only for grouping.
    """
    s = name.strip()
    # 1. Normalize brackets: [X] → (X), also handles [Tele-] → (Tele-)
    s = re.sub(r"\[([^\]]*)\]", r"(\1)", s)
    # 2. Strip mount-system prefixes
    for prefix in _MOUNT_PREFIXES:
        s = re.sub(rf"\s*{prefix}", " ", s)
    # 3. Collapse whitespace
    s = re.sub(r"\s+", " ", s).strip()
    # 4. Lowercase for comparison
    return s.lower()


# ---------------------------------------------------------------------------
# Richness scoring — higher = more data, better keeper candidate
# ---------------------------------------------------------------------------


def richness_score(row: dict) -> int:
    """Score how 'rich' a lens record is. Higher = more data."""
    score = 0

    # Description length
    desc = row.get("description") or ""
    score += min(len(desc), 2000)  # cap contribution

    # Number of images
    images = row.get("images") or []
    if isinstance(images, str):
        images = json.loads(images)
    score += len(images) * 100

    # Specs completeness
    specs = row.get("specs") or {}
    if isinstance(specs, str):
        specs = json.loads(specs)
    score += len(specs) * 10

    # Parsed numeric fields present
    for field in [
        "focal_length_min", "focal_length_max",
        "aperture_min", "aperture_max",
        "weight_g", "filter_size_mm", "min_focus_distance_m",
        "max_magnification", "lens_elements", "lens_groups",
        "diaphragm_blades", "year_introduced",
    ]:
        if row.get(field) is not None:
            score += 20

    # Has system_id
    if row.get("system_id") is not None:
        score += 50

    # Has brand
    if row.get("brand"):
        score += 30

    # View count (popularity signals value)
    score += (row.get("view_count") or 0)

    return score


# ---------------------------------------------------------------------------
# Merge logic
# ---------------------------------------------------------------------------


def merge_specs(keeper_specs: dict, donor_specs: dict) -> dict:
    """Merge specs from donor into keeper, preferring keeper values."""
    merged = dict(keeper_specs)
    for key, val in donor_specs.items():
        if key not in merged or not merged[key]:
            merged[key] = val
    return merged


def merge_images(keeper_images: list, donor_images: list) -> list:
    """Combine image lists, deduplicating by src URL."""
    seen_srcs = set()
    result = []
    for img in keeper_images + donor_images:
        src = img.get("src", "") if isinstance(img, dict) else str(img)
        if src and src not in seen_srcs:
            seen_srcs.add(src)
            result.append(img)
    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def log(msg: str):
    print(msg, flush=True)


def find_duplicate_groups(conn) -> list[list[dict]]:
    """Find all groups of duplicate lenses."""
    log("  Querying all lenses...")
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT id, name, slug, url, brand, system_id, description,
                   lens_type, era, production_status,
                   focal_length_min, focal_length_max,
                   aperture_min, aperture_max,
                   weight_g, filter_size_mm, min_focus_distance_m,
                   max_magnification, lens_elements, lens_groups,
                   diaphragm_blades, year_introduced, year_discontinued,
                   is_zoom, is_macro, is_prime,
                   has_stabilization, has_autofocus,
                   specs, images,
                   view_count, average_rating, rating_count, verified
            FROM lenses
            ORDER BY id
        """)
        all_lenses = cur.fetchall()

    # Group by canonical name
    groups: dict[str, list[dict]] = {}
    for lens in all_lenses:
        canon = canonical_name(lens["name"])
        groups.setdefault(canon, []).append(lens)

    # Return only groups with duplicates
    return [group for group in groups.values() if len(group) > 1]


def merge_group(conn, group: list[dict], verbose: bool = False):
    """Merge a group of duplicate lenses, keeping the richest one."""
    # Score each lens
    scored = [(richness_score(dict(row)), row) for row in group]
    scored.sort(key=lambda x: x[0], reverse=True)

    keeper_score, keeper = scored[0]
    donors = [row for _, row in scored[1:]]

    if verbose:
        print(f"\n  KEEP: [{keeper['id']}] {keeper['name']} (score={keeper_score})")
        for score, donor in scored[1:]:
            print(f"  DEL:  [{donor['id']}] {donor['name']} (score={score})")

    # Merge data from donors into keeper
    keeper_specs = keeper["specs"] or {}
    if isinstance(keeper_specs, str):
        keeper_specs = json.loads(keeper_specs)

    keeper_images = keeper["images"] or []
    if isinstance(keeper_images, str):
        keeper_images = json.loads(keeper_images)

    for donor in donors:
        # Merge specs
        donor_specs = donor["specs"] or {}
        if isinstance(donor_specs, str):
            donor_specs = json.loads(donor_specs)
        keeper_specs = merge_specs(keeper_specs, donor_specs)

        # Merge images
        donor_images = donor["images"] or []
        if isinstance(donor_images, str):
            donor_images = json.loads(donor_images)
        keeper_images = merge_images(keeper_images, donor_images)

    # Build SET clause for nullable fields — fill gaps in keeper from donors
    fill_fields = {}
    for field in [
        "description", "brand", "system_id", "lens_type", "era",
        "production_status", "focal_length_min", "focal_length_max",
        "aperture_min", "aperture_max", "weight_g", "filter_size_mm",
        "min_focus_distance_m", "max_magnification", "lens_elements",
        "lens_groups", "diaphragm_blades", "year_introduced",
        "year_discontinued",
    ]:
        if keeper[field] is None:
            for donor in donors:
                if donor[field] is not None:
                    fill_fields[field] = donor[field]
                    break

    # Aggregate view counts and ratings
    total_views = sum(row.get("view_count") or 0 for row in group)
    # Weighted average rating
    total_ratings = sum(row.get("rating_count") or 0 for row in group)
    if total_ratings > 0:
        weighted_sum = sum(
            (row.get("average_rating") or 0) * (row.get("rating_count") or 0)
            for row in group
        )
        avg_rating = weighted_sum / total_ratings
    else:
        avg_rating = keeper.get("average_rating")

    donor_ids = [d["id"] for d in donors]

    with conn.cursor() as cur:
        # Update keeper with merged data
        set_parts = [
            "specs = %s",
            "images = %s",
            "view_count = %s",
            "average_rating = %s",
            "rating_count = %s",
        ]
        params = [
            json.dumps(keeper_specs),
            json.dumps(keeper_images),
            total_views,
            avg_rating,
            total_ratings,
        ]

        for field, value in fill_fields.items():
            set_parts.append(f"{field} = %s")
            params.append(value)

        params.append(keeper["id"])
        cur.execute(
            f"UPDATE lenses SET {', '.join(set_parts)} WHERE id = %s",
            params,
        )

        # Update any lens_series_memberships to point to keeper
        cur.execute("""
            INSERT INTO lens_series_memberships (lens_id, series_id)
            SELECT %s, series_id FROM lens_series_memberships
            WHERE lens_id = ANY(%s)
            ON CONFLICT DO NOTHING
        """, (keeper["id"], donor_ids))

        # Update any lens_compatibility to point to keeper
        cur.execute("""
            INSERT INTO lens_compatibility (lens_id, camera_id, is_native, notes)
            SELECT %s, camera_id, is_native, notes FROM lens_compatibility
            WHERE lens_id = ANY(%s)
            ON CONFLICT DO NOTHING
        """, (keeper["id"], donor_ids))

        # Delete donors (CASCADE will clean up memberships/compatibility)
        cur.execute("DELETE FROM lenses WHERE id = ANY(%s)", (donor_ids,))


def main():
    parser = argparse.ArgumentParser(description="Find and merge duplicate lenses")
    parser.add_argument("--merge", action="store_true", help="Actually merge (default: dry run)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show detailed output")
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)

    conn = psycopg2.connect(database_url)

    print("Finding duplicate lens groups...")
    groups = find_duplicate_groups(conn)

    total_dupes = sum(len(g) for g in groups)
    removable = total_dupes - len(groups)
    print(f"Found {len(groups)} duplicate groups ({total_dupes} lenses, {removable} removable)")

    if not groups:
        print("No duplicates found!")
        return

    if not args.merge:
        # Dry run — show all groups
        for i, group in enumerate(groups, 1):
            scored = [(richness_score(dict(row)), row) for row in group]
            scored.sort(key=lambda x: x[0], reverse=True)
            keeper_score, keeper = scored[0]

            print(f"\n--- Group {i}: canonical = '{canonical_name(group[0]['name'])}' ---")
            print(f"  KEEP: [{keeper['id']}] {keeper['name']} (score={keeper_score})")
            for score, donor in scored[1:]:
                print(f"  DEL:  [{donor['id']}] {donor['name']} (score={score})")

        print(f"\nDry run complete. Run with --merge to apply changes.")
        return

    # Merge
    print(f"\nMerging {len(groups)} duplicate groups...")
    for i, group in enumerate(groups, 1):
        merge_group(conn, group, verbose=args.verbose)
        if i % 50 == 0:
            print(f"  Merged {i}/{len(groups)} groups...")

    conn.commit()
    print(f"Done! Merged {len(groups)} groups, removed {removable} duplicate lenses.")

    # Verify
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM lenses")
        count = cur.fetchone()[0]
        print(f"Total lenses remaining: {count}")

    conn.close()


if __name__ == "__main__":
    main()
