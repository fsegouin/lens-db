import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

/**
 * Create a rate limiter backed by Upstash Redis.
 * Uses a sliding window algorithm for accurate limiting across
 * all serverless instances.
 *
 * @param maxRequests - Maximum requests allowed in the window
 * @param window - Time window (e.g. "60 s", "1 m", "1 h")
 */
export function createRateLimit(maxRequests: number, window: string) {
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
};
