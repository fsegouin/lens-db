import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// storeClassifiedSales needs a database, so this pins the source: a sale
// stored without a date must be read back for the duplicate check, and
// `sale_date IN (...)` alone never returns one.
test("undated sales without a url are deduplicated by IS NULL", () => {
  const src = readFileSync(new URL("./price-pipeline.ts", import.meta.url), "utf8");
  const start = src.indexOf("if (withoutUrl.length > 0)");
  assert.ok(start !== -1);
  const body = src.slice(start, src.indexOf("const fresh", start));
  assert.match(body, /or\(\s*isNull\(priceHistory\.saleDate\)/);
});
