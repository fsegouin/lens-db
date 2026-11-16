import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hashToken } from "./one-shot-token.ts";

/**
 * Signing in from another app: OAuth 2.0, authorization code with PKCE.
 *
 * An app here is a public client, a desktop program whose source anyone can
 * read, so it can keep no secret. PKCE (S256) stands in for the secret, and
 * the code goes back to a loopback address the app listens on (RFC 8252).
 *
 * This file is the protocol with no database or framework in it, so the rules
 * can be tested as written. lib/oauth-store.ts keeps the codes and tokens.
 */

export type OAuthClient = {
  id: string;
  /** The name shown on the consent screen and on the kit page. */
  name: string;
  /** The path the app listens on; the host is always 127.0.0.1, the port its own choice. */
  redirectPath: string;
  scopes: readonly string[];
};

const CLIENTS = new Map<string, OAuthClient>([
  ["oni", { id: "oni", name: "ONI", redirectPath: "/callback", scopes: ["kit"] }],
]);

/**
 * What each scope lets an app do and what stays out of its reach, in the
 * words of the consent screen. `withheld` is a promise the partner API keeps
 * by having no field for any of it (lib/partner-objects.ts).
 */
export const SCOPES: Record<string, { grants: readonly string[]; withheld: string }> = {
  kit: {
    grants: ["See the lenses and cameras in your kit", "Add items to your kit and remove them"],
    withheld:
      "It never sees what you paid, your serial numbers, conditions or notes, and it cannot change anything else in your account.",
  },
};

export const CODE_TTL_MS = 2 * 60 * 1000;
/** A token nothing has presented for this long stops working. */
export const TOKEN_IDLE_DAYS = 365;

const ACCESS_TOKEN_PREFIX = "tldb_";
const MAX_STATE_LENGTH = 512;
const S256_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const CODE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;

export function findClient(id: string | null | undefined): OAuthClient | null {
  return (id && CLIENTS.get(id)) || null;
}

/**
 * Whether a redirect address is the client's own loopback listener:
 * http://127.0.0.1:<port><redirectPath>, any port, nothing else. The literal
 * address is required rather than "localhost", which a hosts file can point
 * anywhere.
 */
export function isClientRedirect(client: OAuthClient, uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  return (
    url.href === uri &&
    url.protocol === "http:" &&
    url.hostname === "127.0.0.1" &&
    url.port !== "" &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === client.redirectPath &&
    url.search === "" &&
    url.hash === ""
  );
}

export type AuthorizeRequest = {
  client: OAuthClient;
  redirectUri: string;
  scope: string;
  state: string | null;
  codeChallenge: string;
};

export type AuthorizeOutcome =
  | { ok: true; request: AuthorizeRequest }
  /** Shown on our own page: there is no trusted address to send anyone to. */
  | { ok: false; redirect: null; message: string }
  /** Sent back to the app, which is where a mistake in its request belongs. */
  | { ok: false; redirect: string };

type Params = Record<string, string | undefined>;

/**
 * Reads an authorization request. The client and its redirect address are
 * checked first and fail on our page; only once both are known is any other
 * error sent to the app, so a forged link can never bounce someone to an
 * address of its choosing.
 */
export function parseAuthorizeRequest(params: Params): AuthorizeOutcome {
  const client = findClient(params.client_id);
  if (!client) return { ok: false, redirect: null, message: "This app is not known to The Lens DB." };

  const redirectUri = params.redirect_uri ?? "";
  if (!isClientRedirect(client, redirectUri)) {
    return {
      ok: false,
      redirect: null,
      message: `${client.name} asked to be sent to an address it is not registered for.`,
    };
  }

  const rawState = params.state ?? null;
  const state = rawState !== null && rawState.length <= MAX_STATE_LENGTH ? rawState : null;
  const fail = (error: string, description: string) => ({
    ok: false as const,
    redirect: callbackUrl(redirectUri, { error, error_description: description, state }),
  });

  if (rawState !== null && state === null) {
    return fail("invalid_request", `state is longer than ${MAX_STATE_LENGTH} characters`);
  }
  if (params.response_type !== "code") {
    return fail("unsupported_response_type", "response_type must be code");
  }

  const requested = params.scope?.split(" ").filter(Boolean) ?? [];
  const scopes = requested.length > 0 ? [...new Set(requested)] : [...client.scopes];
  if (!scopes.every((s) => client.scopes.includes(s))) {
    return fail("invalid_scope", `${client.name} may ask for: ${client.scopes.join(" ")}`);
  }

  if (params.code_challenge_method !== "S256") {
    return fail("invalid_request", "code_challenge_method must be S256");
  }
  const codeChallenge = params.code_challenge ?? "";
  if (!S256_CHALLENGE.test(codeChallenge)) {
    return fail("invalid_request", "code_challenge must be a base64url SHA-256 digest");
  }

  return { ok: true, request: { client, redirectUri, scope: scopes.join(" "), state, codeChallenge } };
}

/** The query string that asks for the same authorization again, for a detour through sign-in. */
export function authorizeQuery(request: AuthorizeRequest): URLSearchParams {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: request.client.id,
    redirect_uri: request.redirectUri,
    scope: request.scope,
    code_challenge: request.codeChallenge,
    code_challenge_method: "S256",
  });
  if (request.state !== null) query.set("state", request.state);
  return query;
}

/** The app's redirect address with an answer on it; null values are left out. */
export function callbackUrl(redirectUri: string, answer: Record<string, string | null>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(answer)) {
    if (value !== null) url.searchParams.set(key, value);
  }
  return url.href;
}

/** Whether the verifier presented at the exchange is the one the challenge was made from. */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  if (!CODE_VERIFIER.test(codeVerifier)) return false;
  const computed = Buffer.from(createHash("sha256").update(codeVerifier).digest("base64url"));
  const expected = Buffer.from(codeChallenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

/** A fresh authorization code: `code` goes to the app, `codeHash` in the database. */
export function issueCode(): { code: string; codeHash: string } {
  const code = randomBytes(32).toString("base64url");
  return { code, codeHash: hashToken(code) };
}

/** A fresh access token: `token` goes to the app, `tokenHash` in the database. */
export function issueAccessToken(): { token: string; tokenHash: string } {
  const token = ACCESS_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

/** The token of an "Authorization: Bearer ..." header, or null when it is not one of ours. */
export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer +(\S+)$/i);
  const token = match?.[1];
  return token?.startsWith(ACCESS_TOKEN_PREFIX) ? token : null;
}
