import { test } from "node:test";
import assert from "node:assert/strict";
import { isCatalogueSlug, isLensDbUrl } from "./lensdb-source.mjs";

test("isCatalogueSlug accepts the generateSlug shape only", () => {
  assert.equal(isCatalogueSlug("canon-fd-50mm-f14-ssc-i-1973"), true);
  for (const bad of ["..", "", "a--b", "-a", "a-", "sun-kōki-135mm", "a/b", "A-b", "a b", undefined]) {
    assert.equal(isCatalogueSlug(bad), false, String(bad));
  }
});

test("isLensDbUrl matches the real host, not a substring", () => {
  assert.equal(isLensDbUrl("https://lens-db.com/canon-fd-50mm-f14-1973/"), true);
  assert.equal(isLensDbUrl("https://www.lens-db.com/x/"), true);
  for (const bad of ["https://evil.example/lens-db.com/x", "https://lens-db.com.evil.example/x", "javascript:alert(1)//lens-db.com", "not a url", undefined]) {
    assert.equal(isLensDbUrl(bad), false, String(bad));
  }
});
