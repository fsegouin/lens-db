import { test } from "node:test";
import assert from "node:assert/strict";
import { affiliateSearchUrl, ebaySiteForCountry } from "./ebay-affiliate.ts";

test("a German reader is sent to ebay.de under the German rotation", () => {
  const url = new URL(affiliateSearchUrl("Canon FD 50mm 1.4", "DE", "123"));
  assert.equal(url.hostname, "rover.ebay.com");
  assert.ok(url.pathname.startsWith("/rover/1/707-53477-19255-0/1"));
  assert.equal(url.searchParams.get("campid"), "123");
  const target = new URL(url.searchParams.get("mpre") ?? "");
  assert.equal(target.hostname, "www.ebay.de");
  assert.equal(target.searchParams.get("_nkw"), "Canon FD 50mm 1.4");
});

test("an unknown country and a lowercase code both resolve sensibly", () => {
  assert.equal(ebaySiteForCountry("BR").domain, "www.ebay.com");
  assert.equal(ebaySiteForCountry("gb").domain, "www.ebay.co.uk");
});

test("without a campaign id the link goes straight to the site", () => {
  const url = new URL(affiliateSearchUrl("Nikon F3", "FR", ""));
  assert.equal(url.hostname, "www.ebay.fr");
  assert.equal(url.searchParams.get("_nkw"), "Nikon F3");
});
