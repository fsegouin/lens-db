import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createTypedFilterTracker } from "./typed-filter.ts";

describe("createTypedFilterTracker", () => {
  test("a typed value is sent once, trimmed, when the field is left", () => {
    const t = createTypedFilterTracker();
    t.focus("year", "");
    assert.equal(t.blur("year", " 1996 "), "1996");
  });

  test("leaving a filled field without changing it sends nothing", () => {
    const t = createTypedFilterTracker();
    t.focus("year", "");
    t.blur("year", "1996");
    t.focus("year", "1996");
    assert.equal(t.blur("year", "1996"), null);
  });

  test("a field filled from the URL and only tabbed through sends nothing", () => {
    const t = createTypedFilterTracker();
    t.focus("minFocal", "50");
    assert.equal(t.blur("minFocal", "50"), null);
  });

  test("an empty field sends nothing", () => {
    const t = createTypedFilterTracker();
    t.focus("priceMin", "");
    assert.equal(t.blur("priceMin", "   "), null);
  });

  test("a changed value is sent", () => {
    const t = createTypedFilterTracker();
    t.focus("minFocal", "50");
    assert.equal(t.blur("minFocal", "85"), "85");
  });

  test("a cleared filter typed again counts again", () => {
    const t = createTypedFilterTracker();
    t.focus("year", "1996");
    assert.equal(t.blur("year", ""), null);
    t.focus("year", "");
    assert.equal(t.blur("year", "1996"), "1996");
  });

  test("filters are tracked independently", () => {
    const t = createTypedFilterTracker();
    t.focus("minFocal", "50");
    t.focus("maxFocal", "");
    assert.equal(t.blur("maxFocal", "50"), "50");
    assert.equal(t.blur("minFocal", "50"), null);
  });
});
