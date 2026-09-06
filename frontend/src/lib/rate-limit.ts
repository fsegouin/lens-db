import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis";

/** No-op limiter that always allows requests in development */
const noopLimiter = {
  limit: async () => ({ success: true, limit: 0, remaining: 0, reset: 0 }),
};

/**
 * Create a rate limiter backed by Upstash Redis.
 * Disabled in development (always allows requests).
 *
 * `name` has to be unique across the limiters below, because it is what keeps
 * their counters apart. Upstash builds the key from the prefix, the identifier
 * and the window index alone and leaves the allowance out of it, so limiters
 * sharing a prefix and a window length share one counter per visitor. Every
 * limiter here uses a 60 second window, so a single hardcoded prefix collapsed
 * all of them into one: loading a page spent the allowance a vote needed, and
 * whichever limiter had the tightest number silently governed the lot.
 */
export function createRateLimit(
  name: string,
  maxRequests: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1],
) {
  if (!redis) return noopLimiter;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, window),
    analytics: true,
    prefix: `lens-db:${name}`,
  });
}

// Pre-configured limiters for each route group
// Kept tight for free-tier DB and Redis plans
export const rateLimiters = {
  // Reading your own rating happens once per lens or camera page view, so it
  // has to be generous enough to browse on. It used to share one 10-a-minute
  // allowance with the writes below, which meant opening ten pages left you
  // unable to vote at all — the read spent the budget the vote needed.
  ratingsRead: createRateLimit("ratings-read", 60, "60 s"),
  // Casting or withdrawing a rating. Both write and then recompute the
  // entity's average, so they share one tight allowance; a rating is unique
  // per (entity, IP) anyway, so this caps DB churn rather than ballot-stuffing.
  ratingsWrite: createRateLimit("ratings-write", 20, "60 s"),
  views: createRateLimit("views", 20, "60 s"),
  comparisons: createRateLimit("comparisons", 10, "60 s"),
  search: createRateLimit("search", 20, "60 s"),
  chat: createRateLimit("chat", 10, "60 s"),
  // One call per entity page view; kept off the "search" bucket so browsing
  // detail pages doesn't eat a visitor's list/typeahead allowance.
  ebay: createRateLimit("ebay", 30, "60 s"),
  // Cataloguing a shelf is bursty: someone who just found the site adds twenty
  // bodies and lenses in a couple of minutes, which the ratings allowance this
  // used to share would cut off after ten. Only signed-in requests ever reach
  // this limiter, and it is keyed by account rather than by IP, so a household
  // or an office behind one address no longer shares a single allowance.
  kit: createRateLimit("kit", 60, "60 s"),
};
