"""
eBay Price Pipeline — fetches sold listings, classifies with LLM, stores prices.

This is the main pipeline script. It:
1. Gets cameras/lenses from our DB
2. Fetches recently sold eBay listings (API when available, manual JSON for now)
3. Classifies each listing via our /api/admin/price-classify endpoint
4. Stores classified sales in price_history
5. Recomputes price_estimates ranges + rarity from accumulated data

Usage:
    # Process a single camera with manual eBay data:
    DATABASE_URL="..." python process_ebay_prices.py --camera "Canon AE-1" --input ebay_canon_ae1.json

    # Process all cameras (requires eBay API keys):
    DATABASE_URL="..." python process_ebay_prices.py --all --type cameras

    # Recompute price estimates from existing history (no scraping):
    DATABASE_URL="..." python process_ebay_prices.py --recompute --type cameras
"""

import argparse
import json
import math
import os
import time

import psycopg2

DATABASE_URL = os.environ.get("DATABASE_URL")
CLASSIFY_URL = os.environ.get("CLASSIFY_URL", "http://localhost:3000/api/admin/price-classify")


def get_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is required")
    return psycopg2.connect(DATABASE_URL)


BATCH_SIZE = 20  # Max listings per LLM call to avoid schema errors


def classify_listings(camera_name: str, listings: list[dict]) -> list[dict]:
    """Send listings to the classify API in batches and return classified results."""
    import requests

    all_classified = []
    for i in range(0, len(listings), BATCH_SIZE):
        batch = listings[i:i + BATCH_SIZE]
        resp = requests.post(CLASSIFY_URL, json={
            "cameraName": camera_name,
            "listings": batch,
        }, timeout=120)

        if resp.status_code != 200:
            print(f"    Classification error (batch {i // BATCH_SIZE + 1}): {resp.status_code} {resp.text[:200]}")
            continue

        data = resp.json()
        all_classified.extend(data.get("classified", []))

    return all_classified


def store_classified_sales(conn, entity_type: str, entity_id: int,
                            classified: list[dict], raw: list[dict],
                            extracted_at: str):
    """Store classified eBay sales in price_history."""
    with conn.cursor() as cur:
        stored = 0
        for cl, raw_listing in zip(classified, raw):
            # Skip irrelevant or non-working items
            if not cl.get("isRelevant") or cl.get("conditionGrade") == "skip":
                continue

            # Map our grades to the condition column
            grade_map = {
                "excellent": "A",
                "good": "B",
                "fair": "C",
            }
            condition = grade_map.get(cl["conditionGrade"], cl["conditionGrade"])

            # Check for duplicate (same entity + date + price + url)
            listing_url = raw_listing.get("url")
            if listing_url:
                cur.execute("""
                    SELECT 1 FROM price_history
                    WHERE entity_type = %s AND entity_id = %s AND source_url = %s
                    LIMIT 1
                """, (entity_type, entity_id, listing_url))
            else:
                cur.execute("""
                    SELECT 1 FROM price_history
                    WHERE entity_type = %s AND entity_id = %s
                      AND sale_date = %s AND price_usd = %s AND source = 'eBay'
                    LIMIT 1
                """, (entity_type, entity_id, raw_listing["date"], int(cl["effectivePrice"])))

            if cur.fetchone():
                continue

            cur.execute("""
                INSERT INTO price_history
                    (entity_type, entity_id, sale_date, condition, price_usd, source, source_url, extracted_at)
                VALUES (%s, %s, %s, %s, %s, 'eBay', %s, %s)
            """, (
                entity_type, entity_id,
                raw_listing["date"],
                condition,
                int(cl["effectivePrice"]),
                raw_listing.get("url"),
                extracted_at,
            ))
            stored += 1

    conn.commit()
    return stored


def recompute_price_estimates(conn, entity_type: str, entity_id: int):
    """Recompute price_estimates from price_history for a single entity.

    Uses median prices per condition tier over the last 2 years.
    Also computes rarity based on listing volume.
    """
    with conn.cursor() as cur:
        # Fetch all sales from the last 2 years
        cur.execute("""
            SELECT condition, price_usd, sale_date
            FROM price_history
            WHERE entity_type = %s AND entity_id = %s
              AND price_usd > 0
              AND sale_date >= NOW() - INTERVAL '2 years'
            ORDER BY sale_date DESC
        """, (entity_type, entity_id))

        rows = cur.fetchall()
        if not rows:
            return

        # Bucket by condition grade
        # A = excellent, B = good, C = fair
        buckets: dict[str, list[int]] = {"excellent": [], "good": [], "fair": []}

        for condition, price, _ in rows:
            if condition in ("A", "A+", "A-B"):
                buckets["excellent"].append(price)
            elif condition in ("B", "B+", "B-A"):
                buckets["good"].append(price)
            elif condition in ("C", "C+", "B-C", "C-B"):
                buckets["fair"].append(price)
            else:
                # Unknown condition — put in fair
                buckets["fair"].append(price)

        def compute_range(prices: list[int]) -> tuple[int | None, int | None]:
            if not prices:
                return None, None
            prices.sort()
            n = len(prices)
            if n == 1:
                return prices[0], prices[0]
            # Use 25th and 75th percentile for the range
            low_idx = max(0, int(n * 0.25))
            high_idx = min(n - 1, int(n * 0.75))
            return prices[low_idx], prices[high_idx]

        avg_low, avg_high = compute_range(buckets["fair"])
        vg_low, vg_high = compute_range(buckets["good"])
        mint_low, mint_high = compute_range(buckets["excellent"])

        # If we don't have enough data in each bucket, estimate from others
        # Use all prices as fallback for any empty bucket
        all_prices = sorted([price for _, price, _ in rows])
        if not buckets["fair"] and all_prices:
            p15 = all_prices[int(len(all_prices) * 0.15)]
            p40 = all_prices[int(len(all_prices) * 0.40)]
            avg_low, avg_high = p15, p40
        if not buckets["good"] and all_prices:
            p40 = all_prices[int(len(all_prices) * 0.40)]
            p65 = all_prices[int(len(all_prices) * 0.65)]
            vg_low, vg_high = p40, p65
        if not buckets["excellent"] and all_prices:
            p75 = all_prices[int(len(all_prices) * 0.75)]
            p95 = all_prices[min(len(all_prices) - 1, int(len(all_prices) * 0.95))]
            mint_low, mint_high = p75, p95

        # Compute rarity from listing volume
        # Count unique sales in the last 90 days
        cur.execute("""
            SELECT COUNT(*) FROM price_history
            WHERE entity_type = %s AND entity_id = %s
              AND sale_date >= NOW() - INTERVAL '90 days'
        """, (entity_type, entity_id))
        recent_count = cur.fetchone()[0]

        # Rarity scale based on 90-day listing volume:
        # 20+ listings → Very common (1)
        # 10-19 → Common (2)
        # 4-9 → Somewhat rare (3)
        # 1-3 → Very scarce (4)
        # 0 → Extremely rare (5) — but we wouldn't have data anyway
        rarity_map = [
            (20, "Very common", 1),
            (10, "Common", 2),
            (4, "Somewhat rare", 3),
            (1, "Very scarce", 4),
            (0, "Extremely rare", 5),
        ]
        rarity_label = "Extremely rare"
        for threshold, label, _ in rarity_map:
            if recent_count >= threshold:
                rarity_label = label
                break

        extracted_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        cur.execute("""
            INSERT INTO price_estimates
                (entity_type, entity_id, source_url, source_name,
                 price_average_low, price_average_high,
                 price_very_good_low, price_very_good_high,
                 price_mint_low, price_mint_high,
                 rarity, rarity_votes, extracted_at)
            VALUES (%s, %s, NULL, 'eBay', %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (entity_type, entity_id) DO UPDATE SET
                source_name = 'eBay',
                price_average_low = EXCLUDED.price_average_low,
                price_average_high = EXCLUDED.price_average_high,
                price_very_good_low = EXCLUDED.price_very_good_low,
                price_very_good_high = EXCLUDED.price_very_good_high,
                price_mint_low = EXCLUDED.price_mint_low,
                price_mint_high = EXCLUDED.price_mint_high,
                rarity = EXCLUDED.rarity,
                rarity_votes = EXCLUDED.rarity_votes,
                extracted_at = EXCLUDED.extracted_at
        """, (
            entity_type, entity_id, avg_low, avg_high,
            vg_low, vg_high, mint_low, mint_high,
            rarity_label, recent_count, extracted_at,
        ))

    conn.commit()


def process_camera(conn, camera_id: int, camera_name: str,
                    listings: list[dict], extracted_at: str) -> dict:
    """Process a single camera: classify → store → recompute."""
    # Classify
    classified = classify_listings(camera_name, listings)
    if not classified:
        return {"camera": camera_name, "classified": 0, "stored": 0}

    # Store
    stored = store_classified_sales(conn, "camera", camera_id, classified, listings, extracted_at)

    # Recompute
    recompute_price_estimates(conn, "camera", camera_id)

    relevant = sum(1 for c in classified if c.get("isRelevant") and c.get("conditionGrade") != "skip")
    return {"camera": camera_name, "classified": len(classified), "relevant": relevant, "stored": stored}


def main():
    parser = argparse.ArgumentParser(description="eBay Price Pipeline")
    parser.add_argument("--camera", type=str, help="Process a single camera by name")
    parser.add_argument("--input", type=str, help="JSON file with manual eBay listings")
    parser.add_argument("--recompute", action="store_true",
                        help="Recompute price estimates from existing history (no scraping)")
    parser.add_argument("--type", choices=["cameras", "lenses"], default="cameras")
    args = parser.parse_args()

    conn = get_connection()
    extracted_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    if args.recompute:
        entity_type = "camera" if args.type == "cameras" else "lens"
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT entity_id FROM price_history
                WHERE entity_type = %s
            """, (entity_type,))
            entity_ids = [r[0] for r in cur.fetchall()]

        print(f"Recomputing price estimates for {len(entity_ids)} {args.type}...")
        for i, eid in enumerate(entity_ids):
            recompute_price_estimates(conn, entity_type, eid)
            if (i + 1) % 50 == 0:
                print(f"  {i + 1}/{len(entity_ids)}")
        print("Done.")
        conn.close()
        return

    if args.camera and args.input:
        # Single camera with manual data
        with open(args.input) as f:
            listings = json.load(f)

        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM cameras WHERE name ILIKE %s LIMIT 1",
                        (f"%{args.camera}%",))
            row = cur.fetchone()
            if not row:
                print(f"Camera not found: {args.camera}")
                conn.close()
                return
            camera_id, camera_name = row

        print(f"Processing {camera_name} (id={camera_id}) with {len(listings)} listings...")
        result = process_camera(conn, camera_id, camera_name, listings, extracted_at)
        print(f"  Classified: {result['classified']}, Relevant: {result.get('relevant', 0)}, Stored: {result['stored']}")

        # Show resulting price estimates
        with conn.cursor() as cur:
            cur.execute("""
                SELECT price_average_low, price_average_high,
                       price_very_good_low, price_very_good_high,
                       price_mint_low, price_mint_high,
                       rarity, rarity_votes
                FROM price_estimates
                WHERE entity_type = 'camera' AND entity_id = %s
            """, (camera_id,))
            pe = cur.fetchone()
            if pe:
                print(f"  Price estimates:")
                print(f"    Average:   ${pe[0] or '?'}-${pe[1] or '?'}")
                print(f"    Very Good: ${pe[2] or '?'}-${pe[3] or '?'}")
                print(f"    Mint:      ${pe[4] or '?'}-${pe[5] or '?'}")
                print(f"    Rarity:    {pe[6]} ({pe[7]} listings in 90 days)")

    conn.close()


if __name__ == "__main__":
    main()
