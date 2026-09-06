import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { repairDescription, findGluedRuns } from "./description-whitespace.ts";

/**
 * Every string below is verbatim from the lenses table, so the suite is a
 * record of what the import actually did rather than of what it might do.
 *
 * The two mistakes cost very different amounts. A join left unfixed is a
 * cosmetic blemish on one page; a product name split in the wrong place is
 * wrong data on the page a reader came for. The "must not change" suite is
 * therefore the one that matters most, and it leads.
 */

describe("leaves correct text alone", () => {
  const untouched = [
    // Fujifilm and Hasselblad write their names with no space before the aperture.
    "The XF23mmF1.4 R LM WR is a fast prime.",
    "FUJINON XF50-140mmF2.8 R LM OIS WR",
    "The GF80mmF1.7 R WR covers the 44x33 sensor.",
    // Coating and marketing names carrying an internal capital.
    "Nano-structure eBAND coating suppresses reflections.",
    "Optical SteadyShot compensates for shake.",
    "Pairs with SnapBridge over Bluetooth.",
    "Tokina FiRIN 20mm F2 FE MF",
    "Carl Zeiss AG, formerly Carl Zeiss GmbH, Oberkochen",
    // Units and measurements that legitimately touch their number.
    "A 35mm lens weighing 245g and measuring 43.5mm in length.",
    "Close focus of 1.5m, a 4x zoom ratio and 1/1000s shutter.",
    "Popular through the 1980s, at 24p and 4k.",
    "Shoots at 30fps with a 12MP sensor.",
    "Maximum aperture of f2.8, minimum f22.",
    "The 8th element is cemented.",
    // Initials and abbreviations must not gain a space.
    "MELVILLE, N.Y., April 25 - Nikon announced the lens.",
    "Designed by J.R. Smith in the U.S.A.",
    "See No. 5 in the table.",
    // Decimals and ratios.
    "A magnification ratio of 1:1 at f/2.8 across 24-70mm.",
    "Marked 1:2.8 on the front ring.",
    "See http://www.nikonusa.com for details.",
  ];
  for (const text of untouched) {
    it(JSON.stringify(text.slice(0, 52)), () => {
      assert.equal(repairDescription(text), text);
    });
  }
});

describe("keeps names whose capital sits mid-token", () => {
  // Each of these was split by an earlier draft of the rules and caught by the
  // full-corpus audit, so they are the regression suite for that audit.
  const untouched = [
    "A CdS meter cell powers the readout.",     // not "Cd S"
    "The rear group uses LaK9 glass.",          // Schott code, not "La K9"
    "eXtreme-torque motor drive",               // not "e Xtreme-torque"
    "eXtra-silent focusing",                    // not "e Xtra-silent"
    "Released alongside the X-Pro1 body.",      // Fujifilm writes it closed up
    "Also fits the X-Pro2 and X-Pro3.",
    "Photographed by Cecil B. DeMille.",        // not "De Mille"
  ];
  for (const text of untouched) {
    it(JSON.stringify(text.slice(0, 52)), () => {
      assert.equal(repairDescription(text), text);
    });
  }

  it("leaves OCR damage alone rather than splitting it further", () => {
    // "coIor" is a scan of "color" with a capital I for the l. Splitting it
    // into "co Ior" would turn one wrong word into two.
    assert.equal(repairDescription("rich coIor rendition"), "rich coIor rendition");
    assert.equal(repairDescription("uses fIlters"), "uses fIlters");
  });
});

describe("restores spaces the tag stripping deleted", () => {
  const cases = [
    // The report that started this: an <a> around "85mm f1.4" ate both spaces.
    [
      "Like the85mm f1.4it is ideal for available light photography.",
      "Like the 85mm f1.4 it is ideal for available light photography.",
    ],
    // Block boundary: a heading or paragraph ran into the next sentence.
    [
      "designed for the Topcon R 35mm SLR camera with the Topcon bayonet mount.Robust, all-metal design",
      "designed for the Topcon R 35mm SLR camera with the Topcon bayonet mount. Robust, all-metal design",
    ],
    [
      "with a focal length of 90mm or more.A compact, lightweight macro lens",
      "with a focal length of 90mm or more. A compact, lightweight macro lens",
    ],
    // Inline link around a brand or model name.
    ["Like theRokkor-TD 45/2.8, this model", "Like the Rokkor-TD 45/2.8, this model"],
    ["announced by theSIGMA Corporation", "announced by the SIGMA Corporation"],
    ["a limitedLEICA edition", "a limited LEICA edition"],
    ["compared with theNikon original", "compared with the Nikon original"],
    // Heading glued to the paragraph that followed it.
    ["Major Features1. 1.4-times extension", "Major Features 1. 1.4-times extension"],
    ["easy-to-use standard lensWhen mounted", "easy-to-use standard lens When mounted"],
    ["Optical DesignThe front group", "Optical Design The front group"],
    // A colon or semicolon that lost the space after it.
    ["two types of fisheye lenses:a circular fisheye", "two types of fisheye lenses: a circular fisheye"],
    ["Note:the hood is included;it ships separately", "Note: the hood is included; it ships separately"],
    // A unit followed straight by the next word.
    ["a 35mmlens for the system", "a 35mm lens for the system"],
    ["at 90mmand beyond", "at 90mm and beyond"],
    ["focus to 1.5mWith the adapter", "focus to 1.5m With the adapter"],
    // A word running into the number that follows it.
    ["the Minolta Maxxum7000 body", "the Minolta Maxxum 7000 body"],
    ["14 sealing points0.06 seconds autofocus", "14 sealing points 0.06 seconds autofocus"],
  ];
  for (const [input, expected] of cases) {
    it(JSON.stringify(input.slice(0, 52)), () => {
      assert.equal(repairDescription(input), expected);
    });
  }
});

describe("normalises whitespace", () => {
  it("collapses double spaces", () => {
    assert.equal(repairDescription("Ricoh Imaging  (Ricoh) is pleased"), "Ricoh Imaging (Ricoh) is pleased");
  });
  it("replaces a non-breaking space", () => {
    assert.equal(repairDescription("a 50mm lens"), "a 50mm lens");
  });
  it("trims", () => {
    assert.equal(repairDescription("  a 50mm lens  "), "a 50mm lens");
  });
  it("passes null and empty through", () => {
    assert.equal(repairDescription(""), "");
    assert.equal(repairDescription(null), null);
  });
});

describe("leaves fully glued runs for a separate pass", () => {
  it("does not guess word boundaries with no case or digit transition", () => {
    const input = "The coating minimizeghostingandflarewhile shooting.";
    assert.equal(repairDescription(input), input);
  });
  it("reports them so they can be found", () => {
    assert.deepEqual(findGluedRuns("minimizeghostingandflarewhile shooting"), [
      "minimizeghostingandflarewhile",
    ]);
    assert.deepEqual(findGluedRuns("a normal sentence about lenses"), []);
  });
});

describe("is idempotent", () => {
  it("a second pass changes nothing", () => {
    const once = repairDescription("Like the85mm f1.4it is ideal.The next sentence.");
    assert.equal(repairDescription(once), once);
  });
});
