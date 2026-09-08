import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDescription } from "./format-description.ts";

/** A sentence of a known length, so a test can place the 400-char break exactly. */
function filler(chars: number): string {
  return "x".repeat(chars - 1) + ".";
}

describe("splits long text at sentence ends only", () => {
  it("never breaks inside a decimal, an aperture or a ratio", () => {
    // Each sentence carries a figure with a dot, and the first is long enough
    // that the old sentence regex cut it at "0." and pushed "45m" into the
    // next paragraph.
    const text = [
      `${filler(380)} It focuses to 0.45m and is sharpest by f/5.6 at 1:6.6 magnification.`,
      `${filler(380)} The plastic one only reaches 0.6m.`,
    ].join(" ");
    const paragraphs = formatDescription(text);
    assert.ok(paragraphs.length >= 2, "long text is still split");
    for (const p of paragraphs) {
      assert.doesNotMatch(p, /\d\.$/, `paragraph ends inside a number: …${p.slice(-20)}`);
      assert.doesNotMatch(p, /^\d/, `paragraph starts inside a number: ${p.slice(0, 20)}…`);
    }
    assert.equal(paragraphs.join(" "), text, "no text is lost or reordered");
  });

  it("leaves short text as one paragraph", () => {
    assert.deepEqual(formatDescription("Close focus is 0.45m. Weight is 170g."), [
      "Close focus is 0.45m. Weight is 170g.",
    ]);
  });
});

describe("paragraph breaks written by an author", () => {
  it("keeps a blank line as a paragraph break", () => {
    const text = "First paragraph about the lens.\n\nBuyer beware: the second paragraph.";
    assert.deepEqual(formatDescription(text), [
      "First paragraph about the lens.",
      "Buyer beware: the second paragraph.",
    ]);
  });

  it("does not chop an authored paragraph that is merely long", () => {
    const long = `${filler(300)} ${filler(300)} ${filler(300)}`;
    const text = `${long}\n\nA short closing paragraph.`;
    assert.deepEqual(formatDescription(text), [long, "A short closing paragraph."]);
  });

  it("splits an authored block past a thousand characters", () => {
    // A list repaired by scripts/apply-runon-lists.mjs makes the whole
    // description count as authored, and at the old ceiling of 1500 that
    // turned the prose above the list into a single wall.
    const wall = `${filler(400)} ${filler(400)} ${filler(400)}`;
    const paragraphs = formatDescription(`${wall}\n\nA repaired list item.`);
    assert.ok(paragraphs.length > 2, `expected the 1200-char block to split, got ${paragraphs.length}`);
    assert.equal(paragraphs.at(-1), "A repaired list item.");
    assert.equal(paragraphs.slice(0, -1).join(" "), wall);
  });

  it("still splits a block nobody would write as one paragraph", () => {
    // A scraped row with one blank line followed by thousands of characters.
    const wall = Array.from({ length: 6 }, () => filler(300)).join(" ");
    const paragraphs = formatDescription(`Lead sentence.\n\n${wall}`);
    assert.equal(paragraphs[0], "Lead sentence.");
    assert.ok(paragraphs.length > 2, "the wall is split into paragraphs");
    assert.equal(paragraphs.slice(1).join(" "), wall);
  });

  it("joins a single newline, which is a scraped line wrap", () => {
    const text = "Very small, light\nand easy to focus, the 50mm f/1.8 offers outstanding cost performance.";
    assert.deepEqual(formatDescription(text), [
      "Very small, light and easy to focus, the 50mm f/1.8 offers outstanding cost performance.",
    ]);
  });
});

describe("removes footnote markers without eating the text around them", () => {
  it("leaves a space where the marker joined two words", () => {
    // The import deleted the space around the marker too, so removing the
    // marker outright printed "(brightest)in Nikon history".
    assert.deepEqual(
      formatDescription("an f/0.95 maximum aperture, the fastest (brightest)*2in Nikon history."),
      ["an f/0.95 maximum aperture, the fastest (brightest) in Nikon history."]
    );
  });

  it("removes a marker that already stands next to punctuation", () => {
    assert.deepEqual(formatDescription("for still life, etc.*1 An image sensor that measures"), [
      "for still life, etc. An image sensor that measures",
    ]);
  });

  it("keeps the Zeiss T* coating mark, whose digits are a lens spec", () => {
    // A bare /\*\d+/ read the "*1" of "T*1,4/50" as a footnote and printed the
    // lens as "T,4/50".
    for (const text of [
      "Carl Zeiss is complementing the Planar T*1,4/50 and T*1,4/85 lenses",
      "The Carl Zeiss Vario-Sonnar T*3.5-4.5/28-70 lens is a compact zoom",
      "photographers consider the Distagon T*4/50 CFi lens ideal",
    ]) {
      assert.deepEqual(formatDescription(text), [text]);
    }
  });

  it("keeps a focal length behind a *** separator", () => {
    // /\*\d+/ matched the "*300" of "***300mm" and printed "**mm".
    assert.deepEqual(
      formatDescription("the rigors of location shooting.***300mm, f/3.2 Century Tele"),
      ["the rigors of location shooting.***300mm, f/3.2 Century Tele"]
    );
  });
});

describe("section headers", () => {
  it("does not cut a header in half", () => {
    // The zero-width lookahead matched twice on "Primary features:" — once on
    // the whole header and again on the bare "Features:" alternative — leaving
    // a paragraph reading "Primary" and another beginning "features:".
    assert.deepEqual(
      formatDescription(
        "This case has been designed for flexible use. Primary features: The symbol of the Nikon Z mount system."
      ),
      [
        "This case has been designed for flexible use.",
        "Primary features: The symbol of the Nikon Z mount system.",
      ]
    );
  });

  it("still breaks before an unqualified header", () => {
    assert.deepEqual(formatDescription("A closing sentence. Features: sharp and light."), [
      "A closing sentence.",
      "Features: sharp and light.",
    ]);
  });
});
