import { test, describe } from "node:test";
import assert from "node:assert";
import { mapSensorSize, normalizeSensorSize } from "./sensor-size.ts";

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

  test("a boolean says whether the body is digital", () => {
    assert.equal(normalizeSensorSize("35mm", true), "Full frame");
    assert.equal(normalizeSensorSize("Full frame", false), "35mm");
  });

  test("other formats pass through, trimmed", () => {
    assert.equal(normalizeSensorSize(" APS-C ", 24), "APS-C");
    assert.equal(normalizeSensorSize("Medium format 6x6", null), "Medium format 6x6");
    assert.equal(normalizeSensorSize("Half frame", null), "Half frame");
    assert.equal(normalizeSensorSize("35mm panoramic", null), "35mm panoramic");
    assert.equal(normalizeSensorSize("127 film", null), "127 film");
  });

  test("fractional-inch classes get the double prime", () => {
    assert.equal(normalizeSensorSize('1/2.3"', 12), "1/2.3″");
    assert.equal(normalizeSensorSize('1/1.7"', 12), "1/1.7″");
    assert.equal(normalizeSensorSize("1 inch", 20), "1″");
    assert.equal(normalizeSensorSize("1″", 20), "1″");
  });

  test("a measured sensor becomes its class by the longer side", () => {
    assert.equal(normalizeSensorSize("27.4 x 18.1 mm", 6), "APS-H");
    assert.equal(normalizeSensorSize("22.5 x 15 mm", 2), "APS-C");
    assert.equal(normalizeSensorSize("13.7 x 9.1 mm", 1.5), "1″");
    assert.equal(normalizeSensorSize("33.1 x 44.2 mm", 31), "Medium format 44x33");
    assert.equal(normalizeSensorSize("43.2 x 32.9 mm", 50), "Medium format 44x33");
    assert.equal(normalizeSensorSize("36.8 x 49.0 mm", 39), "Medium format 49x37");
    assert.equal(normalizeSensorSize("53.4 x 40.0 mm", 100), "Medium format 54x40");
    assert.equal(normalizeSensorSize("45 x 30 mm", 37.5), "Medium format 45x30");
    assert.equal(normalizeSensorSize("36.7 x 36.7 mm", 16), "Medium format 37x37");
    assert.equal(normalizeSensorSize("36 x 24 mm", 14), "Full frame");
    assert.equal(normalizeSensorSize("24 x 36 mm", null), "35mm");
  });

  test("a 4:3 sensor a little over 17 mm wide is Four Thirds sized", () => {
    assert.equal(normalizeSensorSize("18.1 x 13.5 mm", 3), "Four Thirds");
  });

  test("a measurement outside every class is kept as written", () => {
    assert.equal(normalizeSensorSize("19 x 14 mm", 3), "19 x 14 mm");
  });

  test("a film frame is never measured into a sensor class", () => {
    assert.equal(normalizeSensorSize("18 x 24 mm", null), "18 x 24 mm");
    assert.equal(normalizeSensorSize("24 x 24 mm", false), "24 x 24 mm");
    assert.equal(normalizeSensorSize("56 x 56 mm", null), "56 x 56 mm");
    assert.equal(normalizeSensorSize("24 × 36 mm", null), "35mm");
    assert.equal(normalizeSensorSize("Medium format 6x6 (56 x 56 mm)", null), "Medium format 6x6 (56 x 56 mm)");
  });

  test("every fractional-inch class gets the double prime", () => {
    assert.equal(normalizeSensorSize('1/1.8"', 8), "1/1.8″");
    assert.equal(normalizeSensorSize("1/2.5 inch", 8), "1/2.5″");
    assert.equal(normalizeSensorSize("2/3", 5), "2/3″");
  });

  test("plate sizes are lower-cased whatever the input", () => {
    assert.equal(normalizeSensorSize("MEDIUM FORMAT 9X12", null), "Plate 9x12");
  });

  test("roll and plate film labels are folded into one family each", () => {
    assert.equal(normalizeSensorSize("Medium format 6.5x4", null), "Medium format 4x6.5");
    assert.equal(normalizeSensorSize("Medium format 9x12", null), "Plate 9x12");
    assert.equal(normalizeSensorSize("Medium format 6.5x9", null), "Plate 6.5x9");
    assert.equal(normalizeSensorSize("Medium format 120", null), "120 film");
    assert.equal(normalizeSensorSize("616 film", null), "Medium format 6.5x11");
  });

  test("empty and non-string values are null", () => {
    assert.equal(normalizeSensorSize("", 24), null);
    assert.equal(normalizeSensorSize("   ", null), null);
    assert.equal(normalizeSensorSize(undefined, 24), null);
    assert.equal(normalizeSensorSize(42, 24), null);
  });
});

describe("mapSensorSize (DPReview's Sensor size row)", () => {
  test("named formats win over the bracketed measurement", () => {
    assert.equal(mapSensorSize("APS-C (23.5 x 15.6 mm)"), "APS-C");
    assert.equal(mapSensorSize("Full frame (35.9 x 23.9 mm)"), "Full frame");
    assert.equal(mapSensorSize("Four Thirds (17.3 x 13 mm)"), "Four Thirds");
    assert.equal(mapSensorSize("APS-H (27.9 x 18.6 mm)"), "APS-H");
  });

  test("medium format is named by the measurement, not the word", () => {
    assert.equal(mapSensorSize("Medium format (43.8 x 32.9 mm)"), "Medium format 44x33");
    assert.equal(mapSensorSize("Medium format (53.4 x 40 mm)"), "Medium format 54x40");
    assert.equal(mapSensorSize("Medium format"), null);
  });

  test("small sensors use the double prime whatever DPReview typed", () => {
    assert.equal(mapSensorSize('1/2.3" (6.17 x 4.55 mm)'), "1/2.3″");
    assert.equal(mapSensorSize("1″ (13.2 x 8.8 mm)"), "1″");
    assert.equal(mapSensorSize('2/3" (8.8 x 6.6 mm)'), "2/3″");
    assert.equal(mapSensorSize('1/1.7"'), "1/1.7″");
  });

  test("nothing usable is null, not a guess", () => {
    assert.equal(mapSensorSize(undefined), null);
    assert.equal(mapSensorSize("Unknown"), null);
  });
});
