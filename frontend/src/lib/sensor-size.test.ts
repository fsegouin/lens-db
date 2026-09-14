import { test, describe } from "node:test";
import assert from "node:assert";
import { normalizeSensorSize } from "./sensor-size.ts";

describe("normalizeSensorSize", () => {
  test("a body with megapixels is Full frame whatever the form said", () => {
    assert.equal(normalizeSensorSize("35mm full frame", 24), "Full frame");
    assert.equal(normalizeSensorSize("full-frame", "45.7"), "Full frame");
    assert.equal(normalizeSensorSize("Full Frame", 12), "Full frame");
    assert.equal(normalizeSensorSize("35mm", 24), "Full frame");
  });

  test("a body without megapixels is 35mm", () => {
    assert.equal(normalizeSensorSize("35mm full frame", null), "35mm");
    assert.equal(normalizeSensorSize("Full frame", undefined), "35mm");
    assert.equal(normalizeSensorSize("35 mm film", ""), "35mm");
  });

  test("other formats pass through, trimmed", () => {
    assert.equal(normalizeSensorSize(" APS-C ", 24), "APS-C");
    assert.equal(normalizeSensorSize("Medium format 6x6", null), "Medium format 6x6");
    assert.equal(normalizeSensorSize("Half frame", null), "Half frame");
    assert.equal(normalizeSensorSize("35mm panoramic", null), "35mm panoramic");
  });

  test("empty and non-string values are null", () => {
    assert.equal(normalizeSensorSize("", 24), null);
    assert.equal(normalizeSensorSize("   ", null), null);
    assert.equal(normalizeSensorSize(undefined, 24), null);
    assert.equal(normalizeSensorSize(42, 24), null);
  });
});
