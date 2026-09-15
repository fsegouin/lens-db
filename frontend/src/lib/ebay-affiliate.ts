/**
 * Tagged "search on eBay" links, one per eBay site.
 *
 * The Browse API already hands back per-listing links for the reader's own
 * marketplace, but the "view all" link was built by hand and pointed every
 * reader at ebay.com under the US programme, so a reader in Germany landed on
 * the US site in dollars with US shipping. Each eBay site has its own EPN
 * rotation id and its own domain, and a click is only attributed when the
 * two match the site the reader lands on.
 */

interface EbaySite {
  /** EPN rotation id for this site. */
  rotation: string;
  domain: string;
}

// Keyed by the same country codes as the Browse marketplace map, so a reader
// searched on EBAY_DE is sent to ebay.de. Countries without an EPN site of
// their own fall back to the US programme, as their listings already do.
const SITE_BY_COUNTRY: Record<string, EbaySite> = {
  US: { rotation: "711-53200-19255-0", domain: "www.ebay.com" },
  GB: { rotation: "710-53481-19255-0", domain: "www.ebay.co.uk" },
  DE: { rotation: "707-53477-19255-0", domain: "www.ebay.de" },
  FR: { rotation: "709-53476-19255-0", domain: "www.ebay.fr" },
  IT: { rotation: "724-53478-19255-0", domain: "www.ebay.it" },
  ES: { rotation: "1185-53479-19255-0", domain: "www.ebay.es" },
  AT: { rotation: "5221-53469-19255-0", domain: "www.ebay.at" },
  CH: { rotation: "5222-53480-19255-0", domain: "www.ebay.ch" },
  BE: { rotation: "1553-53471-19255-0", domain: "www.benl.ebay.be" },
  NL: { rotation: "1346-53482-19255-0", domain: "www.ebay.nl" },
  IE: { rotation: "5282-53468-19255-0", domain: "www.ebay.ie" },
  AU: { rotation: "705-53470-19255-0", domain: "www.ebay.com.au" },
  CA: { rotation: "706-53473-19255-0", domain: "www.ebay.ca" },
};

export function ebaySiteForCountry(countryCode: string): EbaySite {
  return SITE_BY_COUNTRY[countryCode.toUpperCase()] ?? SITE_BY_COUNTRY.US;
}

/**
 * The search results page for a query on the reader's eBay site, tagged for
 * the affiliate programme when a campaign id is configured and plain when
 * it is not, so a local build without credentials still links somewhere.
 */
export function affiliateSearchUrl(
  searchQuery: string,
  countryCode: string,
  campaignId: string,
): string {
  const site = ebaySiteForCountry(countryCode);
  const target = `https://${site.domain}/sch/i.html?_nkw=${encodeURIComponent(searchQuery)}`;
  if (!campaignId) return target;
  return `https://rover.ebay.com/rover/1/${site.rotation}/1?campid=${campaignId}&toolid=10001&mpre=${encodeURIComponent(target)}`;
}
