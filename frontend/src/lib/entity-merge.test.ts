import { test, describe } from "node:test";
import assert from "node:assert";
import {
  applyTake,
  defaultTake,
  isEmptyValue,
  mergeSummary,
  mergeableKeys,
  newImages,
  takeValue,
} from "./entity-merge.ts";

// The Contax 139 pair that prompted this: a camera-wiki import with the body
// type, shutter, photo and source URL, and a lens-db.com import with the
// weight and the full spec block.
const keeper = {
  id: 258,
  name: "Contax 139 Quartz",
  slug: "contax-139-quartz-1979",
  url: "https://lens-db.com/camera/contax-139-quartz-1979/",
  systemId: 89,
  description: "The Contax 139 Quartz is a 35mm camera, introduced in 1979.",
  sensorSize: "35mm full frame",
  yearIntroduced: 1979,
  weightG: 500,
  bodyType: null,
  shutterType: null,
  alias: null,
  specs: { Type: "Focal-plane", Weight: "500g", "Maximum format": "35mm full frame" },
  images: [],
};

const loser = {
  id: 4689,
  name: "Contax 139",
  slug: "contax-139",
  url: "https://camera-wiki.org/wiki/Contax_139",
  systemId: 89,
  description: "The Contax 139 is a 35mm SLR camera from Japan, introduced in 1979.",
  sensorSize: "35mm full frame",
  yearIntroduced: 1979,
  weightG: null,
  bodyType: "SLR",
  shutterType: "Electronic",
  alias: null,
  specs: { Film: "35mm film", Origin: "Japan", "Maximum format": "35mm full frame" },
  images: [{ src: "https://r2/cameras/contax-139/1.webp", alt: "Contax 139" }],
};

describe("isEmptyValue", () => {
  test("treats null, blank strings, empty arrays and empty objects as empty", () => {
    for (const v of [null, undefined, "", "  ", [], {}]) assert.equal(isEmptyValue(v), true, String(v));
  });
  test("keeps zero and false as values", () => {
    assert.equal(isEmptyValue(0), false);
    assert.equal(isEmptyValue(false), false);
  });
});

describe("mergeableKeys", () => {
  test("lists the columns, the union of spec keys, and images", () => {
    const keys = mergeableKeys("camera", keeper, loser);
    assert.ok(keys.includes("weightG"));
    assert.ok(keys.includes("specs.Type"));
    assert.ok(keys.includes("specs.Origin"));
    assert.equal(keys.filter((k) => k === "specs.Maximum format").length, 1);
    assert.equal(keys[keys.length - 1], "images");
    assert.ok(!keys.includes("slug"), "the keeper's URL never moves");
  });
});

describe("defaultTake", () => {
  test("backfills what the keeper lacks and touches nothing it has", () => {
    const take = defaultTake("camera", keeper, loser);
    assert.deepEqual(take, ["alias", "bodyType", "shutterType", "specs.Film", "specs.Origin", "images"]);
  });

  test("takes nothing when the keeper is already complete", () => {
    assert.deepEqual(defaultTake("camera", loser, loser), []);
  });
});

describe("newImages", () => {
  test("appends only photos the keeper does not already have, by URL", () => {
    const withPhoto = { ...keeper, images: [{ src: "https://r2/cameras/contax-139/1.webp" }] };
    assert.deepEqual(newImages(withPhoto, loser), []);
    assert.equal(newImages(keeper, loser).length, 1);
  });
});

describe("applyTake", () => {
  test("writes the chosen columns, spec keys and photos onto the keeper", () => {
    const { updates, taken } = applyTake("camera", keeper, loser, [
      "bodyType",
      "specs.Origin",
      "images",
    ]);
    assert.deepEqual(taken, ["bodyType", "specs.Origin", "images"]);
    assert.equal(updates.bodyType, "SLR");
    assert.deepEqual(updates.specs, {
      Type: "Focal-plane",
      Weight: "500g",
      "Maximum format": "35mm full frame",
      Origin: "Japan",
    });
    assert.deepEqual(updates.images, loser.images);
  });

  test("lets the reviewer overwrite a value the keeper already has", () => {
    const { updates } = applyTake("camera", keeper, loser, ["description", "url"]);
    assert.equal(updates.description, loser.description);
    assert.equal(updates.url, loser.url);
  });

  test("ignores keys outside the allowlist and values that would not change anything", () => {
    const { updates, taken } = applyTake("camera", keeper, loser, [
      "slug",
      "mergedIntoId",
      "verified",
      "sensorSize",
      "specs.Maximum format",
      "weightG",
    ]);
    assert.deepEqual(updates, {});
    assert.deepEqual(taken, []);
  });

  test("returns nothing to write when nothing is taken", () => {
    const { updates, taken } = applyTake("camera", keeper, loser, []);
    assert.deepEqual(updates, {});
    assert.deepEqual(taken, []);
  });

  test("handles the lens allowlist too", () => {
    const k = { id: 1, name: "A", weightG: null, specs: {}, images: [] };
    const l = { id: 2, name: "B", weightG: 300, isMacro: true, specs: {}, images: [] };
    const { updates } = applyTake("lens", k, l, ["weightG", "isMacro"]);
    assert.deepEqual(updates, { weightG: 300, isMacro: true });
  });
});

describe("takeValue", () => {
  test("offers the retired camera's name as the keeper's alias", () => {
    assert.equal(takeValue("camera", "alias", keeper, loser), "Contax 139");
    const { updates } = applyTake("camera", keeper, loser, ["alias"]);
    assert.equal(updates.alias, "Contax 139");
  });

  test("offers the keeper's old name as alias when its name is being replaced", () => {
    assert.equal(takeValue("camera", "alias", keeper, loser, ["name", "alias"]), "Contax 139 Quartz");
    const { updates } = applyTake("camera", keeper, loser, ["name", "alias"]);
    assert.deepEqual(updates, { name: "Contax 139", alias: "Contax 139 Quartz" });
  });

  test("prefers the loser's own alias when it has one", () => {
    assert.equal(takeValue("camera", "alias", keeper, { ...loser, alias: "RTS Junior" }), "RTS Junior");
  });

  test("offers nothing when the names already match", () => {
    assert.equal(takeValue("camera", "alias", keeper, { ...loser, name: keeper.name }), null);
    assert.equal(takeValue("camera", "alias", { ...keeper, alias: "Contax 139" }, loser), null);
  });

  test("is a plain copy for every other column and for lenses", () => {
    assert.equal(takeValue("camera", "bodyType", keeper, loser), "SLR");
    assert.equal(takeValue("lens", "name", keeper, loser), "Contax 139");
  });
});

describe("mergeSummary", () => {
  test("names the loser and what came across", () => {
    assert.equal(
      mergeSummary("Contax 139", 4689, ["bodyType", "images"]),
      'Merged duplicate "Contax 139" (#4689), took bodyType, images',
    );
  });
  test("says so when nothing came across", () => {
    assert.match(mergeSummary("X", 1, []), /kept every field/);
  });
});
