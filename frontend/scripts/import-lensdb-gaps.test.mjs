import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Both scripts connect to the database or the model gateway when run, so
// these check their source instead.
const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("shutter_type goes through the closed vocabulary before it is written", () => {
  assert.match(read("import-lensdb-gaps.mjs"), /col === "shutter_type"\) value = normalizeShutterType\(value\)/);
});

test("the enrichment draft takes shutter types from the closed vocabulary", () => {
  const src = read("enrich-lensdb-gaps.mjs");
  assert.doesNotMatch(src, /const SHUTTER_TYPES\s*=/);
  assert.match(src, /import \{[^}]*SHUTTER_TYPES[^}]*\} from "\.\.\/src\/lib\/shutter\.ts"/);
});

test("third-party slug and url are checked before a row is planned", () => {
  const src = read("import-lensdb-gaps.mjs");
  assert.match(src, /isCatalogueSlug\(slug\)/);
  assert.match(src, /isLensDbUrl\(rec\.url\)/);
});

test("a camera with no mount is held back instead of imported without its lens", () => {
  assert.match(read("import-lensdb-gaps.mjs"), /if \(!built\.system && isCamera\) \{[\s\S]{0,200}skipped\.fixedLens\.push/);
});

test("camera-wiki figures do not replace values that are already agreed", () => {
  assert.match(read("enrich-lensdb-gaps.mjs"), /if \(rec\.fields\[k\]\?\.state === "agreed"\) continue;/);
});
