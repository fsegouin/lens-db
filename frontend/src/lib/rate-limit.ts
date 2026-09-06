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
 * `name` has to be unique across every limiter in the codebase, because it is
 * what keeps their counters apart. Upstash builds the key from the prefix, the
 * identifier and the window index alone and leaves the allowance out of it, so
 * limiters sharing a prefix and a window length share one counter per visitor.
 * A single hardcoded prefix once collapsed all of them into one, and whichever
 * limiter had the tightest number silently governed the lot.
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

/**
 * Per-IP limits on the public read endpoints now live in the Vercel firewall,
 * which rejects at the edge before the function or the database is touched.
 * See the table in CLAUDE.md for what each route is allowed.
 *
 * What stays here is what the firewall cannot express:
 *
 * - Anything keyed by account rather than by IP. The edge can read a cookie but
 *   cannot verify the session HMAC, so it cannot key on a trusted user id, and
 *   keying these by IP would throttle an office behind one address as if it
 *   were one person.
 * - Anything on a window longer than ten minutes. A firewall rule's window is
 *   capped at 600 seconds, and the submission and edit limits are hourly.
 */
export const rateLimiters = {
  // Cataloguing a shelf is bursty: someone who just found the site adds twenty
  // bodies and lenses in a couple of minutes. Only signed-in requests reach
  // this limiter, and it is keyed by account rather than by IP.
  kit: createRateLimit("kit", 60, "60 s"),
};
