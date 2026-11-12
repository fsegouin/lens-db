import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// There is no DOM harness here, so this pins the source: an error response has
// no `items`, and spreading it inside the state update crashed the list.
test("CameraList loadMore checks res.ok before reading the body", () => {
  const src = readFileSync(new URL("./CameraList.tsx", import.meta.url), "utf8");
  const start = src.indexOf("const loadMore");
  const body = src.slice(start, src.indexOf("IntersectionObserver", start));
  assert.ok(start !== -1 && body.includes("if (!res.ok)"));
  assert.ok(body.indexOf("res.ok") < body.indexOf("res.json()"));
});

// The observer re-fires as soon as loading clears, so a failed page must wait
// before it is asked for again, or a 429 or an outage is retried at network speed.
for (const file of ["CameraList.tsx", "LensList.tsx"]) {
  test(`${file} loadMore waits before a failed page is retried`, () => {
    const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    const start = src.indexOf("const loadMore");
    const body = src.slice(start, src.indexOf("IntersectionObserver", start));
    const catchBlock = body.slice(body.indexOf("catch (err)"), body.indexOf("finally"));
    assert.match(catchBlock, /setTimeout\(\w+, LOAD_RETRY_DELAY_MS\)/);
  });
}
