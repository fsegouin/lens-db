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

describe("splits a digit from a capitalised word", () => {
  // Press releases join the dateline to the headline more often than they make
  // any other join, and no earlier rule keyed on a digit meeting a capital.
  const damage: Array<[string, string]> = [
    ["for the Nikon Z mount system October 10, 2019The pinnacle of the S-Line", "2019 The"],
    ["only with a maximum aperture of f/0.95Outstanding resolution", "f/0.95 Outstanding"],
    ["October 1996Elmsford, NY - Mamiya announces", "1996 Elmsford"],
    ["OBERKOCHEN, GERMANY - 27 October 2011Carl Zeiss presents", "2011 Carl"],
    ["June 01, 1999Next Generation Canon L-series Lenses", "1999 Next"],
  ];
  for (const [input, expected] of damage) {
    it(`splits ${JSON.stringify(expected)}`, () => {
      assert.ok(repairDescription(input).includes(expected), repairDescription(input));
    });
  }

  // A capital carrying fewer than two lowercase letters is a model suffix, not
  // a word, and that alone is what keeps these bodies spelled correctly.
  const names = [
    "replacing both the EOS-1Ds Mark III",
    "The Nikon D2Xs is an APS-C body",
    "The Canon EOS 5Ds is a 35mm DSLR",
    "The Canon EOS 60Da is an APS-C body",
    "the non-removable lens of the Nikon 35Ti.",
    "the lens of the Fujifilm GA645Zi Professional",
    "supports 4K video recording at up to 100Mbps.",
  ];
  for (const input of names) {
    it(`leaves ${JSON.stringify(input.slice(0, 34))} alone`, () => {
      assert.equal(repairDescription(input), input);
    });
  }
});

describe("splits off only a unit that occurs glued in the corpus", () => {
  // A longest-prefix search over every unit read the front of an ordinary word
  // as a measurement, inventing a word break in the middle of it.
  const wasMangled: Array<[string, string]> = [
    ["a special edition of the Sonnar T* 1.5/50standard lens", "1.5/50 standard"],
    ["superior dust-proof and drip-proof*2performance. The large", "*2 performance"],
    ["the large-format sensor*1measuring approximately", "*1 measuring"],
    ["a combined weight of only 735grams / 25.9oz", "735 grams"],
    ["the angle of view varies from 20.4degree to 8.2", "20.4 degree"],
    ["it measures a mere 41millimeters in length", "41 millimeters"],
    ["Hasselblad News Autumn 1997this lens was", "1997 this"],
  ];
  for (const [input, expected] of wasMangled) {
    it(`splits before ${JSON.stringify(expected)} rather than inside it`, () => {
      assert.ok(repairDescription(input).includes(expected), repairDescription(input));
    });
  }

  const stillSplits: Array<[string, string]> = [
    ["the 35mmlens is a classic", "35mm lens"],
    ["a 400mmf/4.5-5.6 zoom", "400mm f/4.5"],
    ["a 300mmand a 500mm", "300mm and"],
    ["the 28mmoptical design", "28mm optical"],
  ];
  for (const [input, expected] of stillSplits) {
    it(`still splits ${JSON.stringify(expected)}`, () => {
      assert.ok(repairDescription(input).includes(expected), repairDescription(input));
    });
  }
});

describe("keeps trademarked internal capitals", () => {
  for (const input of [
    "two CompactFlash card slots",
    "the WriteView LCD panel",
    "with AstroTracer enabled",
  ]) {
    it(`leaves ${JSON.stringify(input)} alone`, () => {
      assert.equal(repairDescription(input), input);
    });
  }
});
