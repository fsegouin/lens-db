#!/usr/bin/env python3
"""
Fix camera sensor_type values in the database.

Some cameras have incorrect sensor_type values (e.g. "35mm full frame" instead of "CMOS").
This script:
1. Audits all cameras for suspicious sensor_type values
2. Extracts the correct sensor type from the specs JSON ("Imaging sensor" or "Imaging plane")
3. Updates the database
"""

import json
import os
import re

import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "frontend", ".env.local"))


VALID_SENSOR_TYPES = {"CMOS", "CCD", None}


def extract_sensor_type(specs: dict) -> str | None:
    """Extract sensor type from specs JSON."""
    for key in ("Imaging plane", "Imaging sensor"):
        imaging = specs.get(key, "")
        if "CMOS" in imaging:
            return "CMOS"
        if "CCD" in imaging:
            return "CCD"
    return None


def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set")
        return

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Find cameras with suspicious sensor_type values
    cur.execute("SELECT id, name, sensor_type, specs FROM cameras ORDER BY name")
    rows = cur.fetchall()

    print(f"Auditing {len(rows)} cameras...\n")

    fixes = []
    oddities = []

    for camera_id, name, sensor_type, specs_json in rows:
        specs = specs_json if isinstance(specs_json, dict) else json.loads(specs_json or "{}")
        correct_type = extract_sensor_type(specs)

        # Flag wrong sensor_type values
        if sensor_type and sensor_type not in VALID_SENSOR_TYPES:
            oddities.append((camera_id, name, sensor_type, correct_type))
            if correct_type:
                fixes.append((camera_id, name, sensor_type, correct_type))

        # Flag cameras where sensor_type is None but we can extract from specs
        elif sensor_type is None and correct_type:
            fixes.append((camera_id, name, sensor_type, correct_type))

    if oddities:
        print("=== CAMERAS WITH SUSPICIOUS sensor_type VALUES ===")
        for camera_id, name, current, correct in oddities:
            print(f"  [{camera_id}] {name}: '{current}' → should be '{correct or 'NULL'}'")
        print()

    if fixes:
        print(f"=== {len(fixes)} CAMERAS TO FIX ===")
        for camera_id, name, current, correct in fixes:
            print(f"  [{camera_id}] {name}: '{current}' → '{correct}'")

        response = input(f"\nApply {len(fixes)} fixes? [y/N] ")
        if response.lower() == "y":
            for camera_id, name, current, correct in fixes:
                cur.execute(
                    "UPDATE cameras SET sensor_type = %s WHERE id = %s",
                    (correct, camera_id),
                )
            conn.commit()
            print(f"Fixed {len(fixes)} cameras.")
        else:
            print("No changes made.")
    else:
        print("No fixes needed — all sensor_type values look correct!")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
