import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const isDev = process.env.NODE_ENV === "development";

const redis = isDev
  ? null
  : new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });

/** No-op limiter that always allows requests in development */
const noopLimiter = {
  limit: async () => ({ success: true, limit: 0, remaining: 0, reset: 0 }),
};

/**
 * Create a rate limiter backed by Upstash Redis.
 * Disabled in development (always allows requests).
 */
export function createRateLimit(maxRequests: number, window: string) {
  if (!redis) return noopLimiter;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, window as Parameters<typeof Ratelimit.slidingWindow>[1]),
    analytics: true,
    prefix: "lens-db",
  });
}

// Pre-configured limiters for each route group
// Kept tight for free-tier DB and Redis plans
export const rateLimiters = {
  ratings: createRateLimit(10, "60 s"),
  views: createRateLimit(20, "60 s"),
  comparisons: createRateLimit(10, "60 s"),
  search: createRateLimit(20, "60 s"),
  chat: createRateLimit(10, "60 s"),
};
