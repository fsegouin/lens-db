import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { nextQuery, returnsToApp, safeNextPath, signInPath, utmSource } from "./safe-next.ts";

const AUTHORIZE = "/oauth/authorize?client_id=oni&state=a%20b&utm_source=oni";

describe("the way back after signing in", () => {
  test("is a path on this site", () => {
    assert.equal(safeNextPath("/kit"), "/kit");
    assert.equal(safeNextPath(AUTHORIZE), AUTHORIZE);
  });

  test("is never another host", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "/a\\b",
      "kit",
      "",
      null,
      undefined,
      42,
      { toString: () => "/kit" },
      `/${"a".repeat(2000)}`,
    ]) {
      assert.equal(safeNextPath(bad), null, String(bad));
    }
  });

  test("survives being put on a link and read back", () => {
    const params = new URLSearchParams(nextQuery(AUTHORIZE));
    assert.equal(safeNextPath(params.get("next")), AUTHORIZE);
    assert.equal(nextQuery(null), "");
  });

  test("rides along to the sign-in page with its message", () => {
    const url = new URL(signInPath({ error: "invalid-token" }, AUTHORIZE), "http://site.invalid");
    assert.equal(url.pathname, "/login");
    assert.equal(url.searchParams.get("error"), "invalid-token");
    assert.equal(safeNextPath(url.searchParams.get("next")), AUTHORIZE);
    assert.equal(signInPath({ verified: "true" }, null), "/login?verified=true");
  });

  test("knows when it leads to an app waiting to be connected", () => {
    assert.ok(returnsToApp(AUTHORIZE));
    assert.equal(returnsToApp("/kit"), false);
    assert.equal(returnsToApp("/oauth/authorized"), false);
    assert.equal(returnsToApp(null), false);
  });
});

describe("the campaign a visitor arrived under", () => {
  test("is read from the page or from the page they are returning to", () => {
    assert.equal(utmSource(new URLSearchParams("utm_source=oni")), "oni");
    assert.equal(utmSource(new URLSearchParams({ next: AUTHORIZE })), "oni");
    assert.equal(utmSource(new URLSearchParams({ next: "/kit" })), "");
    assert.equal(utmSource(new URLSearchParams()), "");
  });

  test("falls back to the way back when the page's own is empty", () => {
    assert.equal(utmSource(new URLSearchParams({ utm_source: "", next: AUTHORIZE })), "oni");
  });

  test("is dropped when it is not a plain label", () => {
    assert.equal(utmSource(new URLSearchParams({ utm_source: "<script>" })), "");
    assert.equal(utmSource(new URLSearchParams({ utm_source: "x".repeat(41) })), "");
  });
});
