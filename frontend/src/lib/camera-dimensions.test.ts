import { test, describe } from "node:test";
import assert from "node:assert";
import {
  cameraDimensionsFromSpecs,
  isCameraFrontView,
  parseCameraDimensions,
} from "./camera-dimensions.ts";

describe("parseCameraDimensions", () => {
  test("reads the formats the catalogue holds", () => {
    const expected = { widthMm: 146, heightMm: 124, depthMm: 78.5 };
    assert.deepEqual(parseCameraDimensions("146x124x78.5mm"), expected);
    assert.deepEqual(parseCameraDimensions("146 x 124 x 78.5 mm"), expected);
    assert.deepEqual(parseCameraDimensions("146mm x 124mm x 78.5mm"), expected);
    assert.deepEqual(parseCameraDimensions("146 mm X 124 mm X 78.5 mm"), expected);
    assert.deepEqual(parseCameraDimensions("approx 146 &times; 124 &times; 78.5mm"), expected);
    assert.deepEqual(parseCameraDimensions("146 × 124 × 78.5mm ; weight 900g"), expected);
    assert.deepEqual(
      parseCameraDimensions("146 mm (W) x 124 mm (H) x 78.5 mm (D), excluding projecting parts"),
      expected,
    );
  });

  test("keeps the millimetre triple when inches follow it", () => {
    assert.deepEqual(parseCameraDimensions("138 x 98 x 88 mm (5.43 x 3.86 x 3.46″)"), {
      widthMm: 138,
      heightMm: 98,
      depthMm: 88,
    });
  });

  test("converts centimetres", () => {
    assert.deepEqual(parseCameraDimensions("14&times;9&times;4 cm"), {
      widthMm: 140,
      heightMm: 90,
      depthMm: 40,
    });
  });

  test("reads a decimal comma", () => {
    assert.deepEqual(parseCameraDimensions("136x88,5x60mm")?.heightMm, 88.5);
  });

  test("refuses what it cannot read or what cannot be a camera", () => {
    assert.equal(parseCameraDimensions("<No data>"), null);
    assert.equal(parseCameraDimensions(""), null);
    assert.equal(parseCameraDimensions(null), null);
    assert.equal(parseCameraDimensions("5.43 x 3.86 x 3.46 in"), null);
    assert.equal(parseCameraDimensions("1380 x 98 x 88 mm"), null);
  });
});

describe("cameraDimensionsFromSpecs", () => {
  test("falls through to the alternative keys", () => {
    assert.deepEqual(cameraDimensionsFromSpecs({ Dimensions: "<No data>", "Size, mm": "120x80x40" }), {
      widthMm: 120,
      heightMm: 80,
      depthMm: 40,
    });
    assert.equal(cameraDimensionsFromSpecs(null), null);
    assert.equal(cameraDimensionsFromSpecs({}), null);
  });
});

describe("isCameraFrontView", () => {
  test("accepts a complete record and rejects a partial one", () => {
    const view = { src: "https://x/1.webp", width: 500, height: 400, crop: { x: 1, y: 2, w: 300, h: 200 } };
    assert.equal(isCameraFrontView(view), true);
    assert.equal(isCameraFrontView({ ...view, crop: { x: 0, y: 0, w: 0, h: 200 } }), false);
    assert.equal(isCameraFrontView({ src: "https://x/1.webp" }), false);
    assert.equal(isCameraFrontView(null), false);
  });
});
