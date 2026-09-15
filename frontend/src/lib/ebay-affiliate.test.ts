import { test } from "node:test";
import assert from "node:assert/strict";
import { affiliateSearchUrl, ebaySiteForCountry } from "./ebay-affiliate.ts";

test("a German reader is sent to ebay.de with the German tracking parameters", () => {
  const url = new URL(affiliateSearchUrl("Canon FD 50mm 1.4", "DE", "123"));
  assert.equal(url.hostname, "www.ebay.de");
  assert.equal(url.pathname, "/sch/i.html");
  assert.equal(url.searchParams.get("_nkw"), "Canon FD 50mm 1.4");
  assert.equal(url.searchParams.get("mkrid"), "707-53477-19255-0");
  assert.equal(url.searchParams.get("siteid"), "77");
  assert.equal(url.searchParams.get("campid"), "123");
  assert.equal(url.searchParams.get("mkcid"), "1");
});

test("an unknown country and a lowercase code both resolve sensibly", () => {
  assert.equal(ebaySiteForCountry("BR").domain, "www.ebay.com");
  assert.equal(ebaySiteForCountry("gb").domain, "www.ebay.co.uk");
});

test("without a campaign id the link goes straight to the site", () => {
  const url = new URL(affiliateSearchUrl("Nikon F3", "FR", ""));
  assert.equal(url.hostname, "www.ebay.fr");
  assert.equal(url.searchParams.get("_nkw"), "Nikon F3");
  assert.equal(url.searchParams.get("campid"), null);
});
