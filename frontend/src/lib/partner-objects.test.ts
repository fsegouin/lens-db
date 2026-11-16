import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_KIT_CHANGES,
  etagMatches,
  etagOf,
  modelName,
  parseKitChanges,
  parseSearchRequest,
  partnerCamera,
  partnerLens,
} from "./partner-objects.ts";

const lensRow = {
  id: 4821,
  name: "Canon EF 70-300mm f/4-5.6 IS USM",
  slug: "canon-ef-70-300mm-f-4-5-6-is-usm",
  brand: "Canon",
  yearIntroduced: 2005,
  focalLengthMin: 70,
  focalLengthMax: 300,
  apertureMin: 4,
  apertureMax: 5.6,
};

describe("the model name", () => {
  test("is the name without the brand it opens with", () => {
    assert.equal(modelName("Canon AE-1 Program", "Canon"), "AE-1 Program");
    assert.equal(modelName("Voigtländer Bessa R2", "Voigtlander"), "Bessa R2");
    assert.equal(modelName("CARL ZEISS Planar T* 50mm f/1.4", "Carl Zeiss"), "Planar T* 50mm f/1.4");
  });

  test("is the whole name when the brand is not a leading word of its own", () => {
    assert.equal(modelName("Rolleiflex 2.8F", "Rollei"), "Rolleiflex 2.8F");
    assert.equal(modelName("Minolta-35", "Minolta"), "Minolta-35");
    assert.equal(modelName("Cosina Voigtlander Bessa R", "Voigtlander"), "Cosina Voigtlander Bessa R");
    assert.equal(modelName("Zenit", "Zenit"), "Zenit");
    assert.equal(modelName("Helios-44-2", null), "Helios-44-2");
  });
});

describe("a lens object", () => {
  test("carries what a photo's metadata needs", () => {
    assert.deepEqual(partnerLens(lensRow, ["Canon EF"]), {
      type: "lens",
      id: 4821,
      name: "Canon EF 70-300mm f/4-5.6 IS USM",
      brand: "Canon",
      model: "EF 70-300mm f/4-5.6 IS USM",
      url: "https://thelensdb.com/lenses/canon-ef-70-300mm-f-4-5-6-is-usm",
      mounts: ["Canon EF"],
      yearIntroduced: 2005,
      focalLengthMm: { min: 70, max: 300 },
      maxAperture: { atMinFocal: 4, atMaxFocal: 5.6 },
    });
  });

  test("repeats the one figure of a prime or a constant aperture", () => {
    const prime = partnerLens({ ...lensRow, focalLengthMin: 50, focalLengthMax: null, apertureMin: 1.4, apertureMax: null }, []);
    assert.deepEqual(prime.focalLengthMm, { min: 50, max: 50 });
    assert.deepEqual(prime.maxAperture, { atMinFocal: 1.4, atMaxFocal: 1.4 });
  });

  test("says null where the catalogue has a gap", () => {
    const bare = partnerLens({ ...lensRow, focalLengthMin: null, focalLengthMax: null, apertureMin: null, apertureMax: null }, []);
    assert.equal(bare.focalLengthMm, null);
    assert.equal(bare.maxAperture, null);
  });
});

describe("a camera object", () => {
  const row = { id: 1532, name: "Canon AE-1 Program", slug: "canon-ae-1-program", brand: "Canon", yearIntroduced: 1981 };

  test("has its mount and no lens of its own when lenses come off", () => {
    assert.deepEqual(partnerCamera(row, "Canon FD", null), {
      type: "camera",
      id: 1532,
      name: "Canon AE-1 Program",
      brand: "Canon",
      model: "AE-1 Program",
      url: "https://thelensdb.com/cameras/canon-ae-1-program",
      mount: "Canon FD",
      yearIntroduced: 1981,
      builtInLens: null,
    });
  });

  test("carries the lens of a fixed-lens body", () => {
    const lens = partnerLens(lensRow, []);
    assert.equal(partnerCamera(row, null, lens).builtInLens, lens);
  });

  test("has no field for what the owner recorded about their copy", () => {
    const fields = Object.keys(partnerCamera(row, null, partnerLens(lensRow, [])));
    for (const kept of ["condition", "serialNumber", "acquiredPrice", "acquiredYear", "notes", "quantity"]) {
      assert.ok(!fields.includes(kept), kept);
    }
  });
});

describe("a kit change", () => {
  test("reads add and remove, either of which may be absent", () => {
    assert.deepEqual(parseKitChanges({ add: [{ type: "camera", id: 1532 }] }), {
      add: [{ type: "camera", id: 1532 }],
      remove: [],
    });
    assert.deepEqual(parseKitChanges({}), { add: [], remove: [] });
  });

  test("folds an entry sent twice, and keeps a lens and a camera sharing an id apart", () => {
    const changes = parseKitChanges({
      add: [{ type: "lens", id: 7 }, { type: "lens", id: 7 }, { type: "camera", id: 7 }],
    });
    assert.deepEqual(changes, { add: [{ type: "lens", id: 7 }, { type: "camera", id: 7 }], remove: [] });
  });

  test("drops what an entry carries beyond type and id", () => {
    const changes = parseKitChanges({ add: [{ type: "lens", id: 7, notes: "mine", userId: 1 }] });
    assert.deepEqual(changes, { add: [{ type: "lens", id: 7 }], remove: [] });
  });

  test("is refused when malformed", () => {
    for (const bad of [
      null,
      [],
      "add",
      { add: {} },
      { remove: "all" },
      { add: [{ type: "system", id: 1 }] },
      { add: [{ type: "lens", id: "1" }] },
      { add: [{ type: "lens", id: 0 }] },
      { add: [{ type: "lens", id: 1.5 }] },
      { add: [null] },
      { remove: [{ id: 3 }] },
    ]) {
      assert.equal(typeof parseKitChanges(bad), "string", JSON.stringify(bad));
    }
  });

  test("carries at most the agreed number of entries, counted across both lists", () => {
    const refs = (n: number) => Array.from({ length: n }, (_, i) => ({ type: "lens", id: i + 1 }));
    assert.equal(typeof parseKitChanges({ add: refs(MAX_KIT_CHANGES) }), "object");
    assert.equal(typeof parseKitChanges({ add: refs(MAX_KIT_CHANGES), remove: refs(1) }), "string");
  });
});

describe("a search request", () => {
  const parse = (query: string) => parseSearchRequest(new URLSearchParams(query));

  test("needs only q", () => {
    assert.deepEqual(parse("q=canon+ae"), { q: "canon ae", type: null, brand: null, limit: 20 });
  });

  test("takes a type, a brand and a limit", () => {
    assert.deepEqual(parse("q=ae&type=camera&brand=Canon&limit=50"), {
      q: "ae",
      type: "camera",
      brand: "Canon",
      limit: 50,
    });
  });

  test("is refused outside the agreed bounds", () => {
    for (const bad of ["", "q=a", `q=${"a".repeat(201)}`, "q=ae&type=brand", "q=ae&limit=0", "q=ae&limit=51", "q=ae&limit=ten", "q=ae&limit=2.5"]) {
      assert.equal(typeof parse(bad), "string", bad);
    }
  });
});

describe("the kit ETag", () => {
  test("is the same for the same body and differs when it changes", () => {
    assert.equal(etagOf('{"items":[]}'), etagOf('{"items":[]}'));
    assert.notEqual(etagOf('{"items":[]}'), etagOf('{"items":[1]}'));
    assert.match(etagOf("x"), /^"[A-Za-z0-9_-]{43}"$/);
  });

  test("matches If-None-Match as sent back, weakened, or in a list", () => {
    const etag = etagOf("body");
    assert.ok(etagMatches(etag, etag));
    assert.ok(etagMatches(`W/${etag}`, etag));
    assert.ok(etagMatches(`"other", ${etag}`, etag));
    assert.ok(etagMatches("*", etag));
    assert.equal(etagMatches('"other"', etag), false);
    assert.equal(etagMatches(null, etag), false);
  });
});
