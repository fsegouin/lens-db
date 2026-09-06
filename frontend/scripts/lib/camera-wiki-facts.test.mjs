import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractCountry,
  extractFormat,
  extractShutterType,
  extractFilm,
  extractLens,
  extractMount,
  extractSensor,
  extractShutter,
  extractWeight,
  extractYears,
  leadSection,
  toPlainText,
  composeDescription,
  indefiniteArticle,
} from "./camera-wiki-facts.mjs";

/**
 * What may be read out of a camera-wiki article, and what may not.
 *
 * The passages below are verbatim from the articles the importer works on. The
 * negative cases matter as much as the positive ones: these run over seventeen
 * hundred articles unattended, so a pattern that grabs a rival camera's launch
 * year or reads a catalogue number as an aperture is worse than one that
 * returns nothing.
 */

describe("years", () => {
  it("reads a launch stated after a comma", () => {
    // Kodak DCS 200.
    const t = "The Kodak DCS 200 was the second digital SLR released by Kodak, in 1992.";
    assert.deepEqual(extractYears(t), { start: 1992, end: null });
  });

  it("reads a production range", () => {
    // Smena 6.
    const t = "The Smena 6 is a 35mm viewfinder camera made by GOMZ and LOMO in the USSR, from 1961 to 1969.";
    assert.deepEqual(extractYears(t), { start: 1961, end: 1969 });
  });

  it("reads an introduction", () => {
    assert.deepEqual(extractYears("The Nikon F was introduced in 1959 with a range of lenses."), {
      start: 1959,
      end: null,
    });
  });

  it("ignores a year that is not about this camera being made", () => {
    // The trap: a date that belongs to the company, or to a rival.
    assert.deepEqual(extractYears("Wirgin was founded in 1920 by three brothers."), {
      start: null,
      end: null,
    });
    assert.deepEqual(extractYears("It competed with the Leica II, which had appeared earlier."), {
      start: null,
      end: null,
    });
  });

  it("drops a range that ends before it starts", () => {
    assert.equal(extractYears("produced from 1960 to 1955").end, null);
  });
});

describe("lens", () => {
  it("reads the plain form", () => {
    // Argus AA.
    assert.deepEqual(extractLens("but has a fixed-focus 50 mm f/6.3 lens, and a PC socket"), {
      focal: 50,
      aperture: 6.3,
    });
  });

  it("reads the continental form", () => {
    assert.deepEqual(extractLens("Subita 1:6.3/75mm Anastigmat"), { focal: 75, aperture: 6.3 });
  });

  it("converts centimetres", () => {
    // 1950s Japanese articles give focal length in cm.
    assert.deepEqual(extractLens("Riken Ricomat f 2.8 / 4.5cm"), { focal: 45, aperture: 2.8 });
  });

  it("refuses figures that cannot be a lens", () => {
    assert.equal(extractLens("catalogue number 1:2000/3 mm"), null);
    assert.equal(extractLens("no optical details are known"), null);
  });
});

describe("sensor", () => {
  it("reads resolution, megapixels and sensor size from one passage", () => {
    // Kodak DCS 200, which is the article that showed the labelled-list parser
    // was leaving most of the page on the floor.
    const t =
      "including a 1524 x 1012 pixel (1.5 megapixel) sensor and up to 80 Mb of storage. The sensor dimensions of 14x9.3 mm result in a severe crop factor";
    assert.deepEqual(extractSensor(t), {
      megapixels: 1.5,
      resolution: "1524 x 1012",
      sensorSize: "14 x 9.3 mm",
    });
  });

  it("returns nothing for a film camera", () => {
    assert.equal(extractSensor("a 35mm viewfinder camera with a coated lens"), null);
  });
});

describe("weight", () => {
  it("reads grams", () => {
    assert.equal(extractWeight("Weight: 135g (without battery)"), 135);
  });

  it("converts ounces", () => {
    assert.equal(extractWeight("weighs about 21 oz"), 595);
  });

  it("rejects a figure too small or large to be a camera", () => {
    assert.equal(extractWeight("the 12 g shutter blade"), null);
    assert.equal(extractWeight("the 9000 g tripod head"), null);
  });
});

describe("mount", () => {
  const systems = ["Nikon F", "Canon EF", "M42", "Leica M", "Minolta SR"];

  it("finds a mount the catalogue knows", () => {
    assert.equal(extractMount("fitted with the Nikon F mount", systems), "Nikon F");
    assert.equal(extractMount("an M42 screw mount body", systems), "M42");
  });

  it("does not invent one from a passing mention of the brand", () => {
    assert.equal(extractMount("similar in style to a Nikon rangefinder", systems), null);
  });
});

describe("shutter", () => {
  it("reads a range", () => {
    assert.equal(extractShutter("Seikosha MX, Speeds 1/10 - 1/500 sec + B"), "1/10 - 1/500");
  });

  it("reads a single speed", () => {
    assert.equal(extractShutter("mechanical shutter, 1/125 sec fixed speed"), "1/125");
  });
});

describe("categories", () => {
  it("reads the film format", () => {
    assert.equal(extractFilm(["German 6x9 viewfinder folding", "120 film"]), "120 film");
    assert.equal(extractFilm(["Japanese 35mm SLR"]), "35mm film");
  });

  it("reads the country, from its own category or the type", () => {
    assert.equal(extractCountry(["Argus", "USA", "35mm viewfinder"]), "USA");
    assert.equal(extractCountry(["Japanese 35mm SLR"]), "Japan");
    assert.equal(extractCountry(["B", "Flickr image"]), null);
  });
});

describe("format, in the catalogue's own vocabulary", () => {
  it("maps 35mm and medium format", () => {
    assert.equal(extractFormat(["Japanese 35mm SLR"]), "35mm full frame");
    assert.equal(extractFormat(["German 6x9 viewfinder folding", "120 film"]), "Medium format 6x9");
  });

  it("writes the larger dimension first, as the existing rows do", () => {
    // camera-wiki says "4.5x6"; the catalogue says "Medium format 6x4.5".
    assert.equal(extractFormat(["Japanese 4.5x6 folding"]), "Medium format 6x4.5");
  });

  it("recognises half frame and plain roll film", () => {
    assert.equal(extractFormat(["Japanese half-frame"]), "Half frame");
    assert.equal(extractFormat(["120 film"]), "Medium format 120");
  });

  it("returns nothing when no category says a format", () => {
    assert.equal(extractFormat(["Agfa", "B", "Flickr image"]), null);
  });
});

describe("shutter mechanism", () => {
  it("reads the mechanism, not the speeds", () => {
    assert.equal(extractShutterType("a focal-plane shutter running to 1/1000"), "Focal-plane");
    assert.equal(extractShutterType("Inter-lens, leaf-type shutter"), "Leaf");
    assert.equal(extractShutterType("fitted with a Synchro-Compur"), "Leaf");
  });

  it("does not guess from a bare speed", () => {
    assert.equal(extractShutterType("speeds 1/10 to 1/500 plus B"), null);
  });
});

describe("the description's wording", () => {
  // A year makes the description worth writing at all; without one and without
  // any other fact, composeDescription deliberately returns nothing.
  const base = { name: "X", maker: null, country: null, years: { start: 1960 }, lens: null, sensor: null, shutter: null, weight: null };

  it("agrees the article with the word that follows it, not the body type", () => {
    // The bug this pins: the article was chosen from the body type while the
    // format is what actually comes next, giving "an 35mm SLR camera".
    assert.match(composeDescription({ ...base, bodyType: "SLR", film: "35mm film" }), /^The X is a 35mm SLR camera/);
    assert.match(composeDescription({ ...base, bodyType: "SLR", film: null }), /^The X is an SLR camera/);
    assert.match(composeDescription({ ...base, bodyType: "Folding", film: null }), /^The X is a folding camera/);
    assert.match(composeDescription({ ...base, bodyType: "Instant", film: null }), /^The X is an instant camera/);
  });

  it("keeps acronyms upper case and everything else lower", () => {
    assert.match(composeDescription({ ...base, bodyType: "TLR", film: null }), /a TLR camera/);
    assert.ok(!composeDescription({ ...base, bodyType: "SLR", film: null }).includes("slr"));
  });

  it("says nothing when there is nothing beyond the name to say", () => {
    const bare = { ...base, years: {}, bodyType: "SLR", film: null };
    assert.equal(composeDescription(bare), null);
  });

  it("states the production range when both years are known", () => {
    const text = composeDescription({ ...base, bodyType: "Viewfinder", film: "35mm film", country: "USSR", years: { start: 1961, end: 1969 } });
    assert.match(text, /produced from 1961 to 1969/);
  });

  it("reads numbers the way they are said", () => {
    assert.equal(indefiniteArticle("35mm"), "a");
    assert.equal(indefiniteArticle("8x10"), "an");
    assert.equal(indefiniteArticle("SLR"), "an");
    assert.equal(indefiniteArticle("TLR"), "a");
    assert.equal(indefiniteArticle("folding"), "a");
    assert.equal(indefiniteArticle("instant"), "an");
  });
});

describe("markup", () => {
  it("keeps the link text and drops the plumbing", () => {
    assert.equal(
      toPlainText("The '''[[Kodak]] DCS 200''' was a [[digital SLR|DSLR]]<ref>note</ref>."),
      "The Kodak DCS 200 was a DSLR.",
    );
  });

  it("stops the lead at the first heading", () => {
    assert.equal(leadSection("Intro sentence.\n\n== Models ==\nA table follows."), "Intro sentence.");
  });
});
