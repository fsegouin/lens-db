"""
Quick helper to convert eBay sold listings page text into JSON for the pipeline.

Usage: Copy-paste the full page text from an eBay sold listings search into a file,
then run this to extract structured listings.

    python extract_ebay_browser.py --input ebay_page.txt --output ebay_listings.json

Or pipe from clipboard:
    pbpaste | python extract_ebay_browser.py --output ebay_listings.json
"""

import argparse
import json
import re
import sys


def extract_listings(text: str) -> list[dict]:
    """Extract sold listings from eBay search results page text."""
    listings = []

    # Pattern: "Sold Mon DD, YYYY" followed by a title and price
    # The page text has listings in blocks like:
    # Sold Apr 12, 2026
    # Title here
    # Pre-Owned
    # $89.99

    months = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
        'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
        'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12',
    }

    # Split by "Sold " markers
    parts = re.split(r'(?=Sold [A-Z][a-z]{2} \d{1,2}, \d{4})', text)

    for part in parts:
        # Extract date
        date_match = re.match(r'Sold (\w{3}) (\d{1,2}), (\d{4})', part)
        if not date_match:
            continue
        month = months.get(date_match.group(1), '01')
        date = f"{date_match.group(3)}-{month}-{date_match.group(2).zfill(2)}"

        # The rest of the block has the title and price
        rest = part[date_match.end():]

        # Find title — first substantial text line
        lines = [l.strip() for l in rest.split('\n') if l.strip()]
        title = ''
        for line in lines:
            # Skip common noise
            if line.startswith(('Opens in', 'View similar', 'Sell one', 'Free')):
                continue
            if len(line) > 20 and not line.startswith('$'):
                title = line.replace('Opens in a new window or tab', '').strip()
                if 'New Listing' in title:
                    title = title.replace('New Listing', '').strip()
                break

        if not title:
            continue

        # Find price
        prices = re.findall(r'\$([\d,]+\.\d{2})', rest)
        if not prices:
            continue
        price = float(prices[0].replace(',', ''))

        # Find condition
        cond_match = re.search(r'(Pre-Owned|Parts Only|Very Good - Refurbished|Good - Refurbished)', rest)
        condition = cond_match.group(1) if cond_match else ''

        # Find eBay item URL — look for /itm/DIGITS pattern
        url_match = re.search(r'/itm/(\d{9,15})', rest)
        url = f"https://www.ebay.com/itm/{url_match.group(1)}" if url_match else ''

        listings.append({
            'title': title[:120],
            'price': price,
            'date': date,
            'condition': condition,
            'url': url,
        })

    return listings


def main():
    parser = argparse.ArgumentParser(description='Extract eBay sold listings from page text')
    parser.add_argument('--input', type=str, help='Input text file (or stdin)')
    parser.add_argument('--output', type=str, required=True, help='Output JSON file')
    args = parser.parse_args()

    if args.input:
        with open(args.input) as f:
            text = f.read()
    else:
        text = sys.stdin.read()

    listings = extract_listings(text)

    with open(args.output, 'w') as f:
        json.dump(listings, f, indent=2)

    print(f'Extracted {len(listings)} listings to {args.output}')


if __name__ == '__main__':
    main()
