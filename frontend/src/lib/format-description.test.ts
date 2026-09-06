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
