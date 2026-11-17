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

// A filter the first page honours has to ride along on every later page and
// be read by the route that serves them, or scrolling quietly drops it.
test("every camera filter reaches the load-more request and the route behind it", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const list = read("./CameraList.tsx");
  const route = read("../app/api/cameras/route.ts");
  const page = read("../app/cameras/page.tsx");
  const query = read("../lib/camera-list.ts");

  const declared = list.indexOf("type FilterOverrides");
  const overrides = list.slice(declared, list.indexOf("};", declared));
  const filters = [...overrides.matchAll(/^\s+(\w+)\?: string;/gm)].map((m) => m[1]);
  assert.ok(filters.includes("brand") && filters.includes("system"));

  const start = list.indexOf("const buildApiUrl");
  const buildApiUrl = list.slice(start, list.indexOf("const loadMore", start));
  for (const filter of filters) {
    assert.ok(buildApiUrl.includes(`params.set("${filter}"`), `load more sends ${filter}`);
    assert.ok(route.includes(`searchParams.get("${filter}")`), `the route reads ${filter}`);
    assert.ok(page.includes(`${filter}: params.${filter}`), `the page applies ${filter}`);
    assert.ok(new RegExp(`\\bp\\.${filter}\\b`).test(query), `the query reads ${filter}`);
  }

  // Clear all has to take off every filter, not just the ones it knew of.
  const clearStart = list.indexOf("const clearAll");
  const clearAll = list.slice(clearStart, list.indexOf("};", clearStart));
  for (const filter of filters.filter((f) => f !== "sort" && f !== "order")) {
    assert.ok(clearAll.includes(`${filter}: ""`), `clear all clears ${filter}`);
  }
});
