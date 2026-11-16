import { test } from "node:test";
import assert from "node:assert/strict";
import {
  brandWrites,
  buildVocabulary,
  canonicalBrand,
  flagLoneBrands,
  foldBrand,
  inferBrand,
  leadWord,
  prefixBrand,
  resolveBrand,
} from "./camera-brand.ts";

const vocabulary = buildVocabulary([
  { brand: "Fuji", n: 176 },
  { brand: "Voigtländer", n: 33 },
  { brand: "Minolta", n: 395 },
  { brand: "Kowa", n: 19 },
  { brand: "Kowa/SIX", n: 1 },
  { brand: "Revuenon", n: 1 },
  { brand: "REVUENON", n: 4 },
  { brand: "Phase One", n: 1 },
]);

test("foldBrand ignores case and accents", () => {
  assert.equal(foldBrand(" Voigtländer "), "voigtlander");
  assert.equal(foldBrand("CONTAX"), "contax");
});

test("buildVocabulary keeps the spelling on more lenses", () => {
  assert.equal(vocabulary.get("revuenon"), "REVUENON");
});

test("canonicalBrand snaps to the vocabulary and keeps a new brand as given", () => {
  assert.equal(canonicalBrand("voigtlander", vocabulary), "Voigtländer");
  assert.equal(canonicalBrand(" Argus ", vocabulary), "Argus");
});

test("prefixBrand returns the vocabulary spelling of a leading brand", () => {
  assert.equal(prefixBrand("Voigtlander Bessa R2", vocabulary), "Voigtländer");
  assert.equal(prefixBrand("Phase One XF", vocabulary), "Phase One");
  assert.equal(prefixBrand("Minolta", vocabulary), "Minolta");
});

test("prefixBrand ends on a word boundary", () => {
  assert.equal(prefixBrand("Fujifilm X-T4", vocabulary), null);
  assert.equal(prefixBrand("Minolta-35 Model II", vocabulary), "Minolta");
  assert.equal(prefixBrand("Minoltaflex (I)", vocabulary), null);
});

test("prefixBrand prefers the longest brand", () => {
  assert.equal(prefixBrand("Kowa/SIX MM", vocabulary), "Kowa/SIX");
  assert.equal(prefixBrand("Kowa SE", vocabulary), "Kowa");
});

test("leadWord groups a family whose names differ after a hyphen", () => {
  assert.equal(leadWord("Zenit-E"), "zenit");
  assert.equal(leadWord("Zenit 122"), "zenit");
  assert.equal(leadWord("No. 2 Folding Pocket Kodak"), "no.");
  assert.equal(leadWord("OM-1"), "om-1");
});

test("resolveBrand accepts agreement and a sure model on an unknown prefix", () => {
  const high = (brand: string) => ({ brand, confidence: "high" as const });
  assert.deepEqual(resolveBrand({ prefix: "Minolta", answer: high("minolta") }, vocabulary), {
    brand: "Minolta",
    status: "agreed",
  });
  assert.deepEqual(resolveBrand({ prefix: null, answer: high("Argus") }, vocabulary), {
    brand: "Argus",
    status: "model",
  });
});

test("resolveBrand sends every doubt to review with the best guess", () => {
  assert.deepEqual(
    resolveBrand({ prefix: "Kowa/SIX", answer: { brand: "Kowa", confidence: "high" } }, vocabulary),
    { brand: "Kowa", status: "review", reason: "name and model differ" },
  );
  assert.deepEqual(
    resolveBrand({ prefix: null, answer: { brand: "Tougodo", confidence: "medium" } }, vocabulary),
    { brand: "Tougodo", status: "review", reason: "model medium" },
  );
  assert.deepEqual(resolveBrand({ prefix: "Fuji", answer: undefined }, vocabulary), {
    brand: "Fuji",
    status: "review",
    reason: "no model answer",
  });
});

test("resolveBrand lets a person's choice win, in the vocabulary's spelling", () => {
  assert.deepEqual(
    resolveBrand(
      { prefix: "Kowa/SIX", answer: { brand: "Kowa", confidence: "high" }, manual: "kowa" },
      vocabulary,
    ),
    { brand: "Kowa", status: "manual" },
  );
});

test("flagLoneBrands sends a one-camera brand the vocabulary lacks to review", () => {
  const flagged = flagLoneBrands(
    [
      { id: 1, brand: "Argus", status: "model" },
      { id: 2, brand: "Argus", status: "model" },
      { id: 3, brand: "Detrola", status: "model" },
      { id: 4, brand: "Phase One", status: "model" },
      { id: 5, brand: "Reid", status: "manual" },
      { id: 6, brand: "Detrola", status: "review", reason: "model medium" },
    ],
    vocabulary,
  );
  assert.deepEqual(
    flagged.map((d) => d.status),
    ["model", "model", "review", "model", "manual", "review"],
  );
  assert.equal(flagged[2].reason, "brand used once");
  assert.equal(flagged[5].reason, "model medium");
});

test("inferBrand reads a new camera's brand from the cameras already branded", () => {
  const catalogue = [
    { name: "Nikon F5", brand: "Nikon" },
    { name: "Fujifilm X-T4", brand: "Fuji" },
    { name: "Fujifilm X-T5", brand: "Fuji" },
    { name: "Fujifilm GFX 100S", brand: "Fuji" },
    { name: "Cosina CT-1", brand: "Cosina" },
    { name: "Cosina Vivitar V2000", brand: "Vivitar" },
    { name: "Cosina Petri GX-2", brand: "Petri" },
    { name: "Digital Classic Camera Leica M3", brand: "Minox" },
  ];
  assert.equal(inferBrand("Nikon Z9 II", catalogue), "Nikon");
  // No brand is spelled "Fujifilm", but every camera leading with it is Fuji.
  assert.equal(inferBrand("Fujifilm X-T6", catalogue), "Fuji");
  // The visible prefix wins before siblings are asked.
  assert.equal(inferBrand("Cosina CX-2", catalogue), "Cosina");
  // One sibling is not enough to vouch for a brand.
  assert.equal(inferBrand("Digital Harinezumi", catalogue), null);
  assert.equal(inferBrand("Argus C3", catalogue), null);
});

test("inferBrand stays silent when a leading word's cameras disagree", () => {
  const catalogue = [
    { name: "Baby Rolleiflex (1931)", brand: "Rollei" },
    { name: "Baby Rolleiflex (1957)", brand: "Rollei" },
    { name: "Baby Minolta", brand: "Minolta" },
  ];
  assert.equal(inferBrand("Baby Pearl", catalogue), null);
});

test("inferBrand follows a factory name to the brand its siblings were sold under", () => {
  const catalogue = [
    { name: "Cosina CT-1", brand: "Cosina" },
    { name: "Cosina CX-2", brand: "Cosina" },
    { name: "Cosina Voigtlander BESSA-L", brand: "Voigtländer" },
    { name: "Cosina Voigtlander BESSA-R", brand: "Voigtländer" },
    { name: "Cosina Voigtlander BESSA-T", brand: "Voigtländer" },
  ];
  assert.equal(inferBrand("Cosina Voigtlander BESSA-R5", catalogue), "Voigtländer");
  assert.equal(inferBrand("Cosina CT-20", catalogue), "Cosina");
});

test("inferBrand stays silent when the name names a second brand no family vouches for", () => {
  const catalogue = [
    { name: "Cosina CT-1", brand: "Cosina" },
    { name: "Cosina Vivitar V2000", brand: "Vivitar" },
    { name: "Vivitar V3800N", brand: "Vivitar" },
    { name: "Baby Rolleiflex (1931)", brand: "Rollei" },
    { name: "Baby Rolleiflex (1957)", brand: "Rollei" },
    { name: "Baby Rolleiflex (1963)", brand: "Rollei" },
    { name: "Minolta XD-7", brand: "Minolta" },
  ];
  // A factory name before the brand the camera was sold under.
  assert.equal(inferBrand("Cosina Vivitar V3000", catalogue), null);
  // Siblings that all carry one brand, and a name that names another.
  assert.equal(inferBrand("Baby Minolta", catalogue), null);
  assert.equal(inferBrand("Cosina CX-2", catalogue), "Cosina");
  assert.equal(inferBrand("Baby Rolleiflex (1970)", catalogue), "Rollei");
});

test("brandWrites fills empty brands and replaces one only when a person or a re-ask says so", () => {
  const writes = brandWrites(
    [
      { id: 1, name: "Nikon F", brand: "Nikon", status: "agreed", current: null },
      { id: 2, name: "Nikon F2", brand: "Nikon", status: "agreed", current: "Nikon" },
      // Set on the admin form after the first run: a rerun must not undo it.
      { id: 3, name: "Rolleiflex 2.8F", brand: "Rollei", status: "model", current: "Franke & Heidecke" },
      { id: 4, name: "Kowa SE", brand: "Kowa", status: "manual", current: "Kowa/SIX" },
      { id: 5, name: "Argus C3", brand: "Argus", status: "model", current: "Argas" },
      { id: 6, name: "Detrola A", brand: "Detrola", status: "review", reason: "brand used once", current: null },
    ],
    new Set([5]),
  );
  assert.deepEqual(writes, [
    { id: 1, name: "Nikon F", brand: "Nikon", before: null },
    { id: 4, name: "Kowa SE", brand: "Kowa", before: "Kowa/SIX" },
    { id: 5, name: "Argus C3", brand: "Argus", before: "Argas" },
  ]);
});
