import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, lookup, normalize } from "./catalogue-match.mjs";

/**
 * What the catalogue gap scanners are expected to treat as the same camera.
 *
 * Every name below is written the way one of the three catalogues really writes
 * it: LibRaw reports the EXIF model code, camera-wiki uses the article title,
 * and the left-hand column of `catalogue` is verbatim from our `cameras` table.
 *
 * The two failure modes cost different things, so both are asserted. A missed
 * match puts a camera we already have on the gap list, which wastes review time.
 * A false match hides a camera we are missing, which is the one that quietly
 * defeats the point of scanning — hence the collision suite at the bottom,
 * built from the model pairs that differ by a single character.
 */

/** Verbatim production rows, including the parenthetical-alias convention. */
const catalogue = [
  "Canon EOS 5D",
  "Canon EOS 5DS",
  "Canon EOS 5D Mark IV",
  "Canon EOS 800D",
  "Nikon D3",
  "Nikon D300",
  "Nikon D3X",
  "Sony a7 III",
  "Sony a7R III",
  "Sony a9",
  "Sony Alpha DSLR-A100",
  "Sony Alpha a5000 (ILCE 5000)",
  "Olympus OM-D E-M1 Mark II",
  "Olympus OM-D E-M10 II",
  "Panasonic Lumix DC-GH5",
  "Panasonic Lumix DC-GH5S",
  "Panasonic Lumix DC-G90 (Lumix DC-G91 / Lumix DC-G95D)",
  "Panasonic Lumix DMC-G7",
  "Hasselblad 500C/M",
  "Nikkormat FT2",
  "Nikon D2H",
  "Nikon D2X",
  "Nikon F3/T",
  "Leica M6",
  "Fujifilm X-T3",
  "Fujifilm X-T30",
  "Pentax K-1",
  "Pentax K-1 Mark II",
  "Voigtländer Bessa R",
];

const index = buildIndex(catalogue.map((name) => ({ name })));

function found(probe) {
  const hit = lookup(index, probe);
  return hit ? hit.map((row) => row.name) : [];
}

/** [name as the external catalogue writes it, the row it should find] */
function run(cases) {
  for (const [probe, expected] of cases) {
    it(`${probe} -> ${expected}`, () => {
      assert.deepEqual(found(probe), [expected]);
    });
  }
}

describe("names that already agree", () => {
  run([
    ["Canon EOS 5D", "Canon EOS 5D"],
    ["Canon EOS 5DS", "Canon EOS 5DS"],
    ["Nikon D300", "Nikon D300"],
    ["Hasselblad 500C/M", "Hasselblad 500C/M"],
  ]);
});

describe("Sony EXIF codes against marketing names", () => {
  // ILCE-7M3 is the a7 III. Sony ships several bodies a year, so the mapping is
  // derived from the code rather than tabulated.
  run([
    ["Sony ILCE-7M3", "Sony a7 III"],
    ["Sony ILCE-7RM3", "Sony a7R III"],
    ["Sony ILCE-9", "Sony a9"],
    ["Sony DSLR-A100", "Sony Alpha DSLR-A100"],
    ["Sony ILCE-5000", "Sony Alpha a5000 (ILCE 5000)"],
  ]);
});

describe("range prefixes and generation spellings", () => {
  // LibRaw drops "OM-D" and spells out "Mark"; we do the opposite.
  run([
    ["Olympus E-M1MarkII", "Olympus OM-D E-M1 Mark II"],
    ["Olympus E-M10 Mark II", "Olympus OM-D E-M10 II"],
    ["Panasonic DC-GH5", "Panasonic Lumix DC-GH5"],
    ["Panasonic DC-GH5S", "Panasonic Lumix DC-GH5S"],
  ]);
});

describe("regional alternatives packed into one name", () => {
  // A spaced slash separates the names one body is sold under in each market.
  run([
    ["Panasonic DMC-G7 / G70", "Panasonic Lumix DMC-G7"],
    ["Panasonic DC-G90 / G95 / G91 / G99", "Panasonic Lumix DC-G90 (Lumix DC-G91 / Lumix DC-G95D)"],
    // Canon's regional names differ by number, not just label, so the match has
    // to come from the number LibRaw supplies rather than from a derived rule.
    ["Canon EOS 800D / Rebel T7i / Kiss X9i", "Canon EOS 800D"],
  ]);
});

describe("diacritics", () => {
  run([["Voigtlander Bessa R", "Voigtländer Bessa R"]]);
});

describe("camera-wiki's unspaced alternatives", () => {
  // camera-wiki titles a body with both names it shipped under, unspaced, and
  // puts the shared model number on the last one only.
  run([
    ["Nikomat/Nikkormat FT2", "Nikkormat FT2"],
    ["Nikon D2H/D2X", "Nikon D2H"],
  ]);

  it("does not split a slash inside one model designation", () => {
    // The Hasselblad 500C/M and Nikon F3/T are single cameras. Splitting them
    // would invent a "Hasselblad 500C" and a "Nikon F3" that are different
    // bodies, and in the F3's case a real one — the worst kind of false match.
    assert.deepEqual(found("Hasselblad 500C/M"), ["Hasselblad 500C/M"]);
    assert.deepEqual(found("Nikon F3/T"), ["Nikon F3/T"]);
  });
});

describe("bodies that differ by one character must not be confused", () => {
  // These are the pairs a substring or token-overlap matcher gets wrong, and
  // each wrong pairing would hide a genuinely missing camera.
  const collisions = [
    ["Canon EOS 5D", "Canon EOS 5DS"],
    ["Canon EOS 5DS", "Canon EOS 5D"],
    ["Nikon D3", "Nikon D300"],
    ["Nikon D300", "Nikon D3"],
    ["Nikon D3", "Nikon D3X"],
    ["Sony ILCE-7M3", "Sony a7R III"],
    ["Fujifilm X-T3", "Fujifilm X-T30"],
    ["Fujifilm X-T30", "Fujifilm X-T3"],
    ["Pentax K-1", "Pentax K-1 Mark II"],
    ["Panasonic DC-GH5", "Panasonic Lumix DC-GH5S"],
  ];
  for (const [probe, forbidden] of collisions) {
    it(`${probe} does not match ${forbidden}`, () => {
      assert.ok(!found(probe).includes(forbidden), `${probe} wrongly matched ${forbidden}`);
    });
  }
});

describe("normalize", () => {
  it("drops filler that no maker uses to distinguish two bodies", () => {
    assert.equal(normalize("Panasonic Lumix DC-GH5"), normalize("Panasonic DC-GH5"));
  });

  it("treats Mark II and II as the same generation", () => {
    assert.equal(normalize("E-M10 Mark II"), normalize("E-M10 II"));
  });

  it("keeps a generation numeral that follows no Mark", () => {
    assert.notEqual(normalize("Pentax K-1"), normalize("Pentax K-1 II"));
  });
});
