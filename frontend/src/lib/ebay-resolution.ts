import type { Resolution } from "./ebay-browse.ts";

/**
 * What a watched listing's own page said, as read by the runner:
 * a banner ("sold", "seller_ended"), "blocked" when the page could not be
 * read at all, or null for a page that loaded but carried no banner (a live
 * listing, or an ended one eBay redirected to its catalogue page).
 */
export type PageVerdict = "sold" | "seller_ended" | "blocked" | null;

export type Decision =
  | { action: "record_sale"; priceUsd: number; soldOn: string }
  | { action: "retire"; resolution: "seller_ended" | "expired" | "ambiguous" | "gone" }
  | { action: "still_live" }
  /** Nothing learned. Checked again tomorrow, not in the next batch. */
  | { action: "skip_for_a_day" };

/**
 * Whether a verdict needs the Browse API before it can be decided. A sale
 * takes its price and date from Browse, which matched our own recorded sales
 * to the cent, and a page with no banner has nothing else to go on.
 */
export function needsBrowse(page: PageVerdict): boolean {
  return page === "sold" || page === null;
}

/**
 * The page and the Browse API, combined into one verdict on a listing.
 *
 * A sale is recorded only when both say sold. Browse reports a listing its
 * seller pulled in the same shape as a sale (41 of 142 recorded that way in
 * September 2026 were not sales), so its "sold" is never enough on its own:
 * without the page's banner it is retired as ambiguous. Its "did not sell",
 * "still active" and "gone" are trusted, since nothing has contradicted them.
 *
 * `browse` is null when Browse was needed but not asked (allowance at its
 * reserve) or the call failed.
 */
export function decide(page: PageVerdict, browse: Resolution | null): Decision {
  if (page === "blocked") return { action: "skip_for_a_day" };
  if (page === "seller_ended") return { action: "retire", resolution: "seller_ended" };
  if (browse == null) return { action: "skip_for_a_day" };
  if (browse.state === "gone") return { action: "retire", resolution: "gone" };

  if (page === "sold") {
    return browse.state === "sold"
      ? { action: "record_sale", priceUsd: browse.priceUsd, soldOn: browse.soldOn }
      : { action: "retire", resolution: "ambiguous" };
  }

  switch (browse.state) {
    case "active":
      return { action: "still_live" };
    case "expired":
      return { action: "retire", resolution: "expired" };
    case "sold":
    case "ambiguous":
      return { action: "retire", resolution: "ambiguous" };
  }
}
