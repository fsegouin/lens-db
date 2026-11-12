import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The route needs the app and a database to load, so this pins the source:
// the stopped-down aperture must be read like the suggestion it is compared
// with, not by stripping every non-digit ("F/22 (F/32)" would become 2232).
test("the stopped-down aperture uses the suggestion parser", () => {
  const src = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  const start = src.indexOf("const stoppedDown");
  assert.ok(start !== -1);
  const expr = src.slice(start, src.indexOf(";", start));
  assert.match(expr, /parseSuggestedNumber\(\s*"apertureMax"/);
  assert.doesNotMatch(expr, /\.replace\(/);
});
