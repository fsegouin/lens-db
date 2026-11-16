import { NextRequest, NextResponse } from "next/server";
import { bearerToken } from "@/lib/oauth";
import { getClientIP } from "@/lib/api-utils";
import { findTokenOwner, type TokenOwner } from "@/lib/oauth-store";
import { createRateLimit, rateLimiters } from "@/lib/rate-limit";

/**
 * The partner API: what a connected app calls with the token a member gave
 * it (lib/oauth.ts). Its answers belong to one account, so none is ever
 * cached by anything between the app and us.
 */

const PRIVATE = { "Cache-Control": "private, no-store" };

// Counted before a token is looked up, so presenting made-up tokens costs a
// database query only this many times a minute from one address. It sits well
// above the per-account limit because an office shares one address.
const lookupLimiter = createRateLimit("partner-ip", 300, "60 s");

export function partnerJson(body: unknown, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: { ...PRIVATE, ...init?.headers },
  });
}

export function partnerError(message: string, status: number, headers?: HeadersInit) {
  return partnerJson({ error: message }, { status, headers });
}

/**
 * Identifies the account behind a partner call, or answers for it: 401 for a
 * token that is missing or no longer works, 403 for one that lacks the scope,
 * 429 past the per-address or per-account limit.
 */
export async function requirePartner(
  request: NextRequest,
  scope: string,
): Promise<TokenOwner | NextResponse> {
  // The calls come from an app's own code, never from a web page. A browser
  // sends Origin with every write, so one that carries it is a page trying to
  // use a token it should not hold.
  if (request.method !== "GET" && request.headers.has("origin")) {
    return partnerError("This API is not available to web pages", 403);
  }

  const token = bearerToken(request.headers.get("authorization"));
  if (token) {
    const lookups = await lookupLimiter.limit(`ip:${getClientIP(request)}`);
    if (!lookups.success) return tooManyRequests(lookups.reset);
  }
  const owner = token ? await findTokenOwner(token) : null;
  if (!owner) {
    return partnerError("Missing, revoked or expired token", 401, {
      "WWW-Authenticate": 'Bearer realm="The Lens DB"',
    });
  }
  if (!owner.scopes.includes(scope)) {
    return partnerError(`This token does not carry the ${scope} scope`, 403);
  }

  const { success, reset } = await rateLimiters.partner.limit(`user:${owner.userId}`);
  return success ? owner : tooManyRequests(reset);
}

/** A 429 that says when to come back; `reset` is the limiter's, in epoch milliseconds. */
export function tooManyRequests(reset: number) {
  const seconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return partnerError("Too many requests", 429, { "Retry-After": String(seconds) });
}
