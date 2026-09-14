import { test, describe } from "node:test";
import assert from "node:assert";
import { bodyTypeForMount, normalizeBodyType } from "./body-type.ts";

describe("bodyTypeForMount", () => {
  test("a mirrorless-labelled Leica M body is a rangefinder, except the M EV1", () => {
    assert.equal(bodyTypeForMount("Mirrorless", "Leica M", "Leica M11"), "Rangefinder");
    assert.equal(bodyTypeForMount("Mirrorless", "Leica M", "Leica M EV1"), "Mirrorless");
    assert.equal(bodyTypeForMount("Mirrorless", "Sony E", "Sony a7C"), "Mirrorless");
  });
});

describe("normalizeBodyType", () => {
  test("DPReview's DSLR size classes are all DSLR", () => {
    assert.equal(normalizeBodyType("Compact SLR", 10), "DSLR");
    assert.equal(normalizeBodyType("Mid-size SLR", 24), "DSLR");
    assert.equal(normalizeBodyType("Large SLR", 20), "DSLR");
    assert.equal(normalizeBodyType("DSLR", 24), "DSLR");
  });

  test("DPReview's mirrorless stylings are all Mirrorless", () => {
    assert.equal(normalizeBodyType("SLR-style mirrorless", 24), "Mirrorless");
    assert.equal(normalizeBodyType("Rangefinder-style mirrorless", 24), "Mirrorless");
    assert.equal(normalizeBodyType("Mirrorless interchangeable lens", 24), "Mirrorless");
  });

  test("DPReview's compacts and bridges", () => {
    assert.equal(normalizeBodyType("Large sensor compact", 24), "Compact");
    assert.equal(normalizeBodyType("Ultracompact", 20), "Compact");
    assert.equal(normalizeBodyType("Compact", 20), "Compact");
    assert.equal(normalizeBodyType("SLR-like (bridge)", 20), "Bridge");
  });

  test("an SLR is a DSLR only when the body is digital", () => {
    assert.equal(normalizeBodyType("SLR", 6), "DSLR");
    assert.equal(normalizeBodyType("SLR", true), "DSLR");
    assert.equal(normalizeBodyType("SLR", null), "SLR");
    assert.equal(normalizeBodyType("Single lens reflex", ""), "SLR");
    assert.equal(normalizeBodyType("DSLR", null), "DSLR");
  });

  test("film categories keep camera-wiki's names", () => {
    assert.equal(normalizeBodyType("Pseudo TLR", null), "Pseudo TLR");
    assert.equal(normalizeBodyType("Twin lens reflex", null), "TLR");
    assert.equal(normalizeBodyType("rangefinder camera", null), "Rangefinder");
    assert.equal(normalizeBodyType("viewfinder folding camera", null), "Folding");
    assert.equal(normalizeBodyType("viewfinder camera", null), "Viewfinder");
    assert.equal(normalizeBodyType("35 mm SLR camera with TTL metering and aperture-priority AE", null), "SLR");
    assert.equal(normalizeBodyType("6x6 TLR camera", null), "TLR");
    assert.equal(normalizeBodyType("Folding", null), "Folding");
    assert.equal(normalizeBodyType("View camera", null), "View");
    assert.equal(normalizeBodyType("Instant", null), "Instant");
    assert.equal(normalizeBodyType("Digital back", 22), "Digital back");
  });

  test("an unknown label passes through trimmed, and blanks are null", () => {
    assert.equal(normalizeBodyType(" Box ", null), "Box");
    assert.equal(normalizeBodyType("", null), null);
    assert.equal(normalizeBodyType(undefined, null), null);
  });
});
