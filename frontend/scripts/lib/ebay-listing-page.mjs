/**
 * What an ended eBay listing's own page says happened to it.
 *
 * The page carries a banner the Browse API does not: "This listing sold on
 * ..." for a sale, and "This listing was ended by the seller ... because the
 * item is no longer available" for a listing the seller pulled. The API
 * reports the second in the same shape as the first, so the banner is the
 * only way to tell them apart.
 *
 * Returns "sold", "seller_ended", or null for anything else (a live listing,
 * a block page, wording this does not know). Null is never evidence either
 * way, and callers leave the record alone.
 */
export function readListingOutcome(text) {
  const flat = text.replace(/\s+/g, " ");
  if (/This listing was ended by the seller/i.test(flat)) return "seller_ended";
  if (/This listing sold on/i.test(flat)) return "sold";
  return null;
}

/** eBay's challenge and error pages, which say nothing about the listing. */
const BLOCK_PAGE = /Security Measure|Please verify yourself|Pardon our interruption|Error Page/i;

/**
 * readListingOutcome, plus whether the page could be read at all.
 *
 * "blocked" is a fact about eBay rather than the listing: a 403, a challenge
 * page, a timeout. It must never be mistaken for "no banner", because no
 * banner sends a listing on to the Browse fallback, which would then decide
 * it on the one signal this exists to distrust.
 *
 * `status` is the HTTP status, or null when the page never loaded.
 */
export function readListingPage({ status, title = "", text = "" }) {
  if (status == null || status === 403 || status === 429 || status >= 500) return "blocked";
  if (BLOCK_PAGE.test(title) || BLOCK_PAGE.test(text.slice(0, 2_000))) return "blocked";
  return readListingOutcome(text);
}
