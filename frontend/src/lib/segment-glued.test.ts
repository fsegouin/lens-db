import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildVocabulary,
  isLikelyGerman,
  segmentRun,
  splitGluedRuns,
} from "../../scripts/lib/segment-glued.ts";

/**
 * The dictionary is normally counted from the whole corpus. Here it is counted
 * from a small stand-in whose word frequencies mirror the real ones, including
 * the damage: "andspherical" and "minimizeghostingandflare" appear because
 * they appear in the corpus too, and the point of buildVocabulary is that they
 * do not survive into the dictionary.
 */
function fixture(): Map<string, number> {
  const common = [
    ["the", 900], ["and", 900], ["of", 700], ["a", 600], ["lens", 500],
    ["flare", 330], ["ghosting", 179], ["minimize", 219], ["reduces", 200],
    ["spherical", 150], ["aberration", 200], ["distortion", 300],
    ["coating", 250], ["viewfinder", 784], ["view", 300], ["finder", 110],
    ["while", 400], ["throughout", 120], ["images", 200], ["ghost", 90],
    ["astigmatism", 60], ["transmittance", 32], ["letting", 40],
  ] as const;

  const corpus: string[] = [];
  for (const [word, n] of common) corpus.push(`${word} `.repeat(n));
  // The damage, present in the corpus exactly as it is in the database.
  corpus.push("andspherical ".repeat(21));
  corpus.push("minimizeghostingandflare ".repeat(14));
  corpus.push("reducesflareand ".repeat(20));
  return buildVocabulary(corpus);
}

describe("buildVocabulary", () => {
  const vocab = fixture();

  it("keeps ordinary words", () => {
    assert.ok(vocab.has("ghosting"));
    assert.ok(vocab.has("spherical"));
  });

  it("keeps a real compound that is common in its own right", () => {
    // 784 occurrences against "finder" at 110 is a word, not damage.
    assert.ok(vocab.has("viewfinder"));
  });

  it("drops a compound far rarer than its parts", () => {
    assert.equal(vocab.has("andspherical"), false);
  });

  it("drops entries too long to be a word", () => {
    assert.equal(vocab.has("minimizeghostingandflare"), false);
    assert.equal(vocab.has("reducesflareand"), false);
  });
});

describe("segmentRun", () => {
  const vocab = fixture();
  const run = (s: string) => segmentRun(s, vocab)?.join(" ");

  it("splits a run of common words", () => {
    assert.equal(run("minimizeghostingandflare"), "minimize ghosting and flare");
    assert.equal(run("coatingreducesflareandghosting"), "coating reduces flare and ghosting");
    assert.equal(run("theastigmatismandspherical"), "the astigmatism and spherical");
  });

  it("leaves a word that is already whole", () => {
    assert.deepEqual(segmentRun("viewfinder", vocab), ["viewfinder"]);
    assert.deepEqual(segmentRun("transmittance", vocab), ["transmittance"]);
  });

  it("prefers one common word to several rare ones", () => {
    // "view f in der" was the real failure this guards against.
    assert.equal(run("viewfinder"), "viewfinder");
  });

  it("returns null when the run cannot be spelled from the dictionary", () => {
    assert.equal(segmentRun("zzzqqqwwwvvv", vocab), null);
  });
});

describe("isLikelyGerman", () => {
  it("recognises a German description", () => {
    assert.ok(
      isLikelyGerman(
        "Das Objektiv ist für Kleinbildreflexkameras und wird mit einer Blende von 2,8 geliefert."
      )
    );
  });

  it("does not trip on English quoting a German name", () => {
    assert.equal(
      isLikelyGerman(
        "Built by Carl Zeiss Jena and sold as the Biotar, this lens covers the full 35mm frame " +
          "and remains a favourite for its rendering of out-of-focus highlights."
      ),
      false
    );
  });
});

describe("splitGluedRuns", () => {
  const vocab = fixture();

  it("only touches runs at or over the length threshold", () => {
    const short = "the lens and a flare";
    assert.equal(splitGluedRuns(short, vocab).text, short);
  });

  it("preserves the original casing of each piece", () => {
    const { text } = splitGluedRuns("Minimizeghostingandflarewhile shooting", vocab);
    assert.equal(text, "Minimize ghosting and flare while shooting");
  });

  it("leaves a run it cannot spell confidently", () => {
    const input = "a zzzqqqwwwvvvbbbnnnmmm run";
    assert.equal(splitGluedRuns(input, vocab).text, input);
  });
});
