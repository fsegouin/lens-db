import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildSearchPatterns } from "../../../mcp-server/src/search.ts";
import { lenses } from "../db/schema.ts";
import { buildNameMatchers, buildNameSearch, matchesNormalizedName, normalizeName } from "./search.ts";

/**
 * What the search bar is expected to do, expressed as queries photographers
 * actually type against names that really exist in the database.
 *
 * Every name below is a verbatim row from production. When a case here fails,
 * the search regressed for a real search someone makes, so fix the matcher
 * rather than the expectation.
 */

function matches(query: string, name: string): boolean {
  return matchesNormalizedName(name, buildNameMatchers(query));
}

/** [query, name, should the name come back] */
type Case = [string, string, boolean];

function run(cases: Case[]) {
  for (const [query, name, expected] of cases) {
    it(`"${query}" ${expected ? "finds" : "does not find"} ${name}`, () => {
      assert.equal(matches(query, name), expected);
    });
  }
}

describe("a number inside a model designation", () => {
  // The bug this suite started from: "Fuji 617" returned nothing, because a
  // digit-leading token was anchored to a word start and 617 follows "GX".
  run([
    ["Fuji 617", "Fuji GX617 Professional", true],
    ["617", "Fuji GX617 Professional", true],
    ["fuji 617", "Fuji EBC Fujinon SWD 90mm F/5.6 (GX617)", true],
    ["617", "Fujica Panorama G617 Professional", true],
    ["gw690", "Fuji GW690III Professional", true],
    ["d850", "Nikon D850", true],
  ]);
});

describe("a number must not continue a longer number", () => {
  // The rule the anchor above exists for: a focal length is not a substring
  // match, or every 135mm lens answers a search for 35mm.
  run([
    ["35", "Canon EF 135mm F/2L USM", false],
    ["35mm", "Canon EF 135mm F/2L USM", false],
    ["200", "Canon RF 1200mm F/8L IS USM", false],
    ["8", "smc Pentax-A* 1200mm F/8 ED [IF]", true],
  ]);
});

describe("focal length and aperture", () => {
  run([
    ["50mm 1.8", "Canon RF 50mm F/1.8 STM", true],
    ["85 1.4", "Samyang AF 85mm F1.4 FE / Rokinon AF 85mm F1.4 FE", true],
    ["24-70 2.8", "Canon EF 24-70mm F/2.8L II USM", true],
    ["24–70", "Canon EF 24-70mm F/2.8L II USM", true], // en dash
    ["f/1.4", "smc Pentax-FA 50mm F/1.4 Classic", true],
    ["f2.8", "Viltrox AF 20mm F2.8", true],
    ["100mm macro", "Panasonic Lumix S 100mm F/2.8 Macro", true],
    ["EF-S 18-55", "Canon EF-S 18-55mm F/3.5-5.6 IS STM", true],
    // A prime search must not drag in every zoom whose range starts there.
    ["50mm", "Canon EF 50-200mm F/3.5-4.5", false],
  ]);
});

describe("model designations, punctuated however the maker likes", () => {
  run([
    ["xt5", "Fujifilm X-T5", true],
    ["a7iv", "Sony a7 IV", true],
    ["z9", "Nikon Z 9", true],
    ["rz67", "Mamiya RZ67 Professional", true],
    ["eos r5", "Canon EOS R5 C", true],
    // Only whitespace may sit between the characters, so this stays tight.
    ["xt5", "Canon EOS 1D X Mark III", false],
  ]);
});

describe("brands, families and mounts", () => {
  run([
    ["sigma art", "Sigma 85mm F1.2 DG Art", true],
    ["summicron", "Leica Summicron-M 28mm F/2 ASPH. [III]", true],
    ["helios 44-2", "Helios-44-2 58mm F/2", true],
    ["nikkor ai-s", "Nikon AI-S Nikkor 50mm F/1.4", true],
    ["voigtlander nokton", "Cosina Voigtlander Nokton 50mm F/1.2 Aspherical SE", true],
    ["tilt shift", "Laowa 55mm F2.8 Tilt-Shift 1X Macro", true],
    // Every word has to match, or the query means nothing.
    ["nikon 50mm", "Canon RF 50mm F/1.8 STM", false],
  ]);
});

describe("case, spacing and stray punctuation are ignored", () => {
  run([
    ["SUMMICRON", "Leica Summicron-M 28mm F/2 ASPH. [III]", true],
    ["summicron", "Leica SUMMICRON-M 35mm F/2 ASPH. \"Ara Güler\"", true],
    ["  50mm  ", "Canon RF 50mm F/1.8 STM", true],
    ["50mm.", "Canon RF 50mm F/1.8 STM", true],
  ]);
});

describe("accented names are reachable from an ASCII keyboard", () => {
  run([
    ["hermes", "Leica Summilux-M 50mm F/1.4 ASPH. \"Edition Hermès\"", true],
    ["hermès", "Leica Summilux-M 50mm F/1.4 ASPH. \"Edition Hermès\"", true],
    ["guler", "Leica M (Typ 240) \"Ara Güler\"", true],
    ["güler", "Leica M (Typ 240) \"Ara Güler\"", true],
  ]);

  it("folds accents out of stored names", () => {
    assert.equal(normalizeName("Edition Hermès"), "Edition Hermes");
    assert.equal(normalizeName("Ara Güler"), "Ara Guler");
  });
});

describe("queries that legitimately match nothing", () => {
  it("returns no matchers when every character is stripped", () => {
    // Callers must read an empty array as "no matches", never as "no filter".
    assert.deepEqual(buildNameMatchers("ニコン"), []);
    assert.deepEqual(buildNameMatchers("!!!"), []);
  });

  it("treats a missing value as no match", () => {
    // Camera search also matches on alias, which is null for most rows.
    const matchers = buildNameMatchers("nikon");
    assert.equal(matchesNormalizedName(null, matchers), false);
    assert.equal(matchesNormalizedName(undefined, matchers), false);
    assert.equal(matchesNormalizedName("", matchers), false);
  });
});

describe("known gaps", () => {
  // Real searches that come back empty today. Left as todo rather than
  // asserted, so the suite records the intent without freezing the miss.
  // Both need arabic/roman folding, which touches the 1,238 names carrying a
  // roman numeral, so it wants deciding on its own rather than in passing.
  it("'5d3' finds the 5D mark III", { todo: true }, () => {
    assert.ok(matches("5d3", "Canon EOS 5D mark III"));
  });

  it("'mark 2' finds a Mark II", { todo: true }, () => {
    assert.ok(matches("5d mark 2", "Canon EOS 5D mark II"));
  });
});

describe("the SQL and in-process matchers stay in step", () => {
  // The typeahead matches in Node against a cached index while the list pages
  // match in Postgres. They must agree, so the only permitted difference is
  // the word-guard: Postgres has no lookbehind.
  const dialect = new PgDialect();
  const QUERIES = [
    "Fuji 617", "50mm 1.8", "24-70 2.8", "xt5", "a7iv", "helios 44-2",
    "EF-S 18-55", "hermes", "f/1.4", "35mm", "sigma art", "eos r5",
  ];

  for (const query of QUERIES) {
    it(`emits the same pattern for "${query}"`, () => {
      const jsPatterns = buildNameMatchers(query).map((m) => m.source);
      const sqlPatterns = buildNameSearch(lenses.name, query).map((s) => {
        const { params } = dialect.sqlToQuery(s);
        return params[params.length - 1] as string;
      });

      assert.equal(jsPatterns.length, sqlPatterns.length);
      for (const [i, sqlPattern] of sqlPatterns.entries()) {
        assert.equal(
          jsPatterns[i],
          sqlPattern.replace("(^|[^0-9])", "(?<![0-9])"),
        );
      }
    });
  }

  it("folds accents in SQL as well as in Node", () => {
    const { sql: text } = dialect.sqlToQuery(buildNameSearch(lenses.name, "hermes")[0]);
    assert.match(text, /translate\(/);
  });
});

describe("the MCP server's copy of the matcher stays in sync", () => {
  // mcp-server/src/search.ts is a deliberate duplicate so the package stays
  // standalone. Nothing but a test stops the two drifting apart.
  const QUERIES = [
    "Fuji 617", "50mm 1.8", "24-70 2.8", "xt5", "a7iv", "helios 44-2",
    "EF-S 18-55", "hermes", "hermès", "f/1.4", "35mm", "300 f4", "ニコン",
  ];

  for (const query of QUERIES) {
    it(`agrees on "${query}"`, () => {
      const frontend = buildNameMatchers(query).map((m) =>
        m.source.replace("(?<![0-9])", "(^|[^0-9])"),
      );
      assert.deepEqual(buildSearchPatterns(query), frontend);
    });
  }
});
