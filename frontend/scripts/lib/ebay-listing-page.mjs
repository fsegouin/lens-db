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
