import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readProvenance, applyProvenance } from "./image-provenance.ts";

describe("readProvenance", () => {
  it("keeps only the four attribution fields, trimmed", () => {
    const r = readProvenance({
      credit: "  Jane Doe ",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
      alt: "not yours",
      src: "https://evil/x.webp",
    });
    assert.ok(r.ok);
    assert.deepEqual(r.value, {
      credit: "Jane Doe",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
    });
  });

  it("fills the deed for a preset licence", () => {
    const r = readProvenance({ license: "CC BY-SA 4.0" });
    assert.ok(r.ok);
    assert.equal(r.value.licenseUrl, "https://creativecommons.org/licenses/by-sa/4.0/");
  });

  it("leaves a given deed alone, and a non-preset licence without one", () => {
    const given = readProvenance({ license: "CC BY-SA 4.0", licenseUrl: "https://example.org/deed" });
    assert.ok(given.ok);
    assert.equal(given.value.licenseUrl, "https://example.org/deed");

    const custom = readProvenance({ license: "Some house licence" });
    assert.ok(custom.ok);
    assert.equal(custom.value.licenseUrl, undefined);
  });

  it("rejects a URL that is not http(s)", () => {
    const r = readProvenance({ sourceUrl: "javascript:alert(1)" });
    assert.ok(!r.ok);
    const r2 = readProvenance({ licenseUrl: "not a url" });
    assert.ok(!r2.ok);
  });

  it("rejects non-string values and non-object bodies", () => {
    assert.ok(!readProvenance({ credit: 42 }).ok);
    assert.ok(!readProvenance("credit").ok);
    assert.ok(!readProvenance(null).ok);
  });

  it("passes an empty string through so it can clear a field", () => {
    const r = readProvenance({ credit: "", license: "" });
    assert.ok(r.ok);
    assert.deepEqual(r.value, { credit: "", license: "" });
  });
});

describe("applyProvenance", () => {
  const image = {
    src: "https://pub.r2.dev/lenses/x.webp",
    alt: "Lens",
    credit: "Old Author",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    background: "white" as const,
  };

  it("sets the fields it is given and leaves the rest", () => {
    const next = applyProvenance(image, { credit: "New Author" });
    assert.equal(next.credit, "New Author");
    assert.equal(next.license, "CC BY 4.0");
    assert.equal(next.background, "white");
    assert.equal(image.credit, "Old Author", "does not mutate the input");
  });

  it("removes a field set to empty rather than storing an empty string", () => {
    const next = applyProvenance(image, { credit: "", license: "", licenseUrl: "" });
    assert.ok(!("credit" in next));
    assert.ok(!("license" in next));
    assert.ok(!("licenseUrl" in next));
    assert.equal(next.src, image.src);
  });
});
