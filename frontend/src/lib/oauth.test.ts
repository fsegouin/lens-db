import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  authorizeQuery,
  bearerToken,
  callbackUrl,
  findClient,
  isClientRedirect,
  issueAccessToken,
  issueCode,
  parseAuthorizeRequest,
  verifyPkce,
} from "./oauth.ts";
import { hashToken } from "./one-shot-token.ts";

const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const REDIRECT = "http://127.0.0.1:51234/callback";

const request = (overrides: Record<string, string | undefined> = {}) => ({
  response_type: "code",
  client_id: "oni",
  redirect_uri: REDIRECT,
  scope: "kit",
  state: "xyz",
  code_challenge: CHALLENGE,
  code_challenge_method: "S256",
  ...overrides,
});

describe("the redirect address", () => {
  const oni = findClient("oni")!;

  test("is the app's loopback listener on any port", () => {
    assert.ok(isClientRedirect(oni, REDIRECT));
    assert.ok(isClientRedirect(oni, "http://127.0.0.1:8/callback"));
  });

  test("is nothing else", () => {
    for (const uri of [
      "https://127.0.0.1:51234/callback",
      "http://localhost:51234/callback",
      "http://127.0.0.1/callback",
      "http://127.0.0.1:51234/other",
      "http://127.0.0.1:51234/callback/",
      "http://127.0.0.1:51234/callback?x=1",
      "http://127.0.0.1:51234/callback#x",
      "http://user@127.0.0.1:51234/callback",
      "http://127.0.0.1:51234@evil.example/callback",
      "http://127.0.0.1.evil.example:51234/callback",
      "http://127.0.0.1:51234/a/../callback",
      "http://2130706433:51234/callback",
      "//127.0.0.1:51234/callback",
      "",
    ]) {
      assert.equal(isClientRedirect(oni, uri), false, uri);
    }
  });
});

describe("an authorization request", () => {
  test("is accepted as the contract writes it", () => {
    const outcome = parseAuthorizeRequest(request());
    assert.ok(outcome.ok);
    assert.equal(outcome.request.client.id, "oni");
    assert.equal(outcome.request.scope, "kit");
    assert.equal(outcome.request.state, "xyz");
    assert.equal(outcome.request.codeChallenge, CHALLENGE);
  });

  test("gets the client's scope when it names none, and may omit state", () => {
    const outcome = parseAuthorizeRequest(request({ scope: undefined, state: undefined }));
    assert.ok(outcome.ok);
    assert.equal(outcome.request.scope, "kit");
    assert.equal(outcome.request.state, null);
  });

  test("from an unknown app or to a foreign address is answered on our page", () => {
    for (const bad of [
      request({ client_id: "nobody" }),
      request({ client_id: undefined }),
      request({ client_id: "constructor" }),
      request({ redirect_uri: "https://evil.example/callback" }),
      request({ redirect_uri: undefined }),
    ]) {
      const outcome = parseAuthorizeRequest(bad);
      assert.ok(!outcome.ok);
      assert.equal(outcome.redirect, null);
    }
  });

  test("with any other fault goes back to the app with the error and its state", () => {
    const cases: [Record<string, string | undefined>, string][] = [
      [{ response_type: "token" }, "unsupported_response_type"],
      [{ scope: "kit admin" }, "invalid_scope"],
      [{ code_challenge_method: "plain" }, "invalid_request"],
      [{ code_challenge_method: undefined }, "invalid_request"],
      [{ code_challenge: "short" }, "invalid_request"],
      [{ code_challenge: undefined }, "invalid_request"],
    ];
    for (const [overrides, error] of cases) {
      const outcome = parseAuthorizeRequest(request(overrides));
      assert.ok(!outcome.ok && outcome.redirect !== null);
      const url = new URL(outcome.redirect);
      assert.equal(url.origin + url.pathname, REDIRECT);
      assert.equal(url.searchParams.get("error"), error);
      assert.equal(url.searchParams.get("state"), "xyz");
    }
  });

  test("with an oversized state is refused without echoing it", () => {
    const outcome = parseAuthorizeRequest(request({ state: "s".repeat(513) }));
    assert.ok(!outcome.ok && outcome.redirect !== null);
    const url = new URL(outcome.redirect);
    assert.equal(url.searchParams.get("error"), "invalid_request");
    assert.equal(url.searchParams.get("state"), null);
  });

  test("survives a detour through sign-in unchanged", () => {
    const first = parseAuthorizeRequest(request());
    assert.ok(first.ok);
    const again = parseAuthorizeRequest(Object.fromEntries(authorizeQuery(first.request)));
    assert.deepEqual(again, first);
  });
});

describe("the answer sent to the app", () => {
  test("carries the code and the state", () => {
    const url = new URL(callbackUrl(REDIRECT, { code: "abc", state: "a b&c" }));
    assert.equal(url.searchParams.get("code"), "abc");
    assert.equal(url.searchParams.get("state"), "a b&c");
  });

  test("leaves out a state the app never sent", () => {
    assert.equal(callbackUrl(REDIRECT, { error: "access_denied", state: null }), `${REDIRECT}?error=access_denied`);
  });
});

describe("PKCE", () => {
  test("accepts the verifier the challenge was made from", () => {
    assert.ok(verifyPkce(VERIFIER, CHALLENGE));
  });

  test("rejects another verifier, a malformed one, and the challenge itself", () => {
    assert.equal(verifyPkce(VERIFIER.replace("d", "e"), CHALLENGE), false);
    assert.equal(verifyPkce("too-short", CHALLENGE), false);
    assert.equal(verifyPkce(`${VERIFIER} `, CHALLENGE), false);
    assert.equal(verifyPkce(CHALLENGE, CHALLENGE), false);
  });
});

describe("codes and tokens", () => {
  test("are stored as their SHA-256, never as issued", () => {
    const { code, codeHash } = issueCode();
    const { token, tokenHash } = issueAccessToken();
    assert.equal(codeHash, hashToken(code));
    assert.equal(tokenHash, hashToken(token));
    assert.match(token, /^tldb_[A-Za-z0-9_-]{43}$/);
    assert.notEqual(issueAccessToken().token, token);
  });

  test("a bearer header yields only a token of ours", () => {
    const { token } = issueAccessToken();
    assert.equal(bearerToken(`Bearer ${token}`), token);
    assert.equal(bearerToken(`bearer ${token}`), token);
    assert.equal(bearerToken(token), null);
    assert.equal(bearerToken("Bearer something-else"), null);
    assert.equal(bearerToken(`Basic ${token}`), null);
    assert.equal(bearerToken(null), null);
  });

  // No database harness here, so this pins the source: a code must be
  // consumed by the statement that finds it, or two exchanges racing on one
  // code could both be given a token.
  test("a code is redeemed with DELETE ... RETURNING", () => {
    const src = readFileSync(new URL("./oauth-store.ts", import.meta.url), "utf8");
    const redeem = src.slice(src.indexOf("export async function redeemAuthorizationCode"));
    const lookup = redeem.indexOf("hashToken(exchange.code)");
    assert.ok(lookup !== -1);
    const before = redeem.slice(0, lookup);
    assert.ok(before.includes(".delete(oauthAuthorizationCodes)"));
    assert.ok(!before.includes(".select("), "the code lookup is a delete");
    assert.ok(redeem.slice(lookup).includes(".returning("));
  });
});

// No database harness here, so the tests below pin the source of the code
// that talks to it, as the DELETE ... RETURNING test above does.
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

/** The text of one exported async function, up to the brace that closes it. */
function functionText(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  assert.ok(start !== -1, `${name} exists`);
  return src.slice(start, src.indexOf("\n}\n", start));
}

describe("ending an app's access", () => {
  const store = source("./oauth-store.ts");

  test("disconnecting an app also ends a code it has not exchanged", () => {
    assert.ok(functionText(store, "disconnectApp").includes(".delete(oauthAuthorizationCodes)"));
  });

  // The new password and the end of every app's access have to commit
  // together, or a failure between them leaves whoever held the account with
  // a working token.
  test("a password reset withdraws app access in the transaction that sets the password", () => {
    const route = source("../app/api/auth/reset-password/route.ts");
    const start = route.indexOf("db.transaction(");
    assert.ok(start !== -1, "the reset runs in a transaction");
    const inside = route.slice(start);
    assert.match(inside, /tx\s*\.update\(users\)/);
    assert.ok(inside.includes("revokeAllAppAccess(tx, user.id)"));

    const revoke = functionText(store, "revokeAllAppAccess");
    assert.ok(revoke.includes("tx.delete(oauthTokens)"));
    assert.ok(!revoke.includes("db.delete"), "nothing is deleted outside the transaction");
  });

  test("a code is exchanged only for an account the partner API would let in", () => {
    assert.ok(functionText(store, "redeemAuthorizationCode").includes("user.isBanned !== false"));
    assert.ok(functionText(store, "findTokenOwner").includes("eq(users.isBanned, false)"));
  });
});

describe("the partner API", () => {
  // A token of our shape costs a database lookup, so the per-address limit
  // has to be counted before that lookup runs.
  test("counts a caller's address before it looks the token up", () => {
    const src = source("./partner-auth.ts");
    const counted = src.indexOf("lookupLimiter.limit(");
    const lookedUp = src.indexOf("await findTokenOwner(");
    assert.ok(counted !== -1, "the address is counted");
    assert.ok(lookedUp !== -1, "the token is looked up");
    assert.ok(counted < lookedUp);
  });
});
