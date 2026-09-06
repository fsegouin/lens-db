/**
 * Ask a model whether two lens rows are the same lens.
 *
 * The cosmetic dedupe (dedupe-lenses.mjs) merges rows whose names are equal
 * once punctuation is ignored. What it cannot see is the deeper backlog:
 * lens-db.com's two index conventions wrote "Fujifilm Super EBC Fujinon XF
 * 23mm F/2 Aspherical R WR" beside "Fujifilm Fujinon XF 23mm F/2 R WR", and
 * "Tokina AT-X Pro 116 AF SD 11-16mm" beside "Tokina AT-X Pro AF SD 11-16mm",
 * while "Nikon GN Auto Nikkor·C 45mm" beside "Nikon GN Auto Nikkor(·C) 45mm"
 * is a version and its family row. Names alone cannot settle these; the whole
 * record can, and a person reading both rows does it in seconds. This does
 * that reading at scale.
 *
 * Candidates: two live rows of the same maker family with the same focal
 * range and maximum aperture whose name tokens overlap. Each pair is shown to
 * the model with everything both rows hold (years, optics, weight, size,
 * close focus, filter, mount, source URL, spec sheet, description opening),
 * and it returns a verdict with its reasoning:
 *
 *   duplicate  the same lens recorded twice
 *   version    the same design in a later or earlier version (AI vs AI-S)
 *   variant    a distinct edition of the same lens (coating, finish, mount)
 *   family     one row is a family or "with or without" record covering the other
 *   different  not the same lens
 *
 * Nothing is merged here. Verdicts go to a JSONL and a Markdown report, and
 * `dedupe-lenses.mjs --pairs <file>` applies the duplicates a person accepts.
 *
 * Calibration: `--calibrate` runs the model on pairs whose answer is known,
 * the 59 pairs merged on 2026-09-06 (duplicate) and the groups the guards
 * held back (mostly version or family), and prints the agreement, so the
 * threshold for trusting it on the unknown pairs is measured, not guessed.
 *
 * Usage (from frontend/):
 *   node scripts/judge-lens-duplicates.mjs --count              # how many candidate pairs
 *   node scripts/judge-lens-duplicates.mjs --calibrate          # agreement with known answers
 *   node scripts/judge-lens-duplicates.mjs --limit 50           # judge the first 50 unknown pairs
 *   node scripts/judge-lens-duplicates.mjs --brand fuji         # one maker family
 *   node scripts/judge-lens-duplicates.mjs --out ../scraper/lens-duplicate-verdicts.jsonl
 */

import { generateText, Output } from "ai";
import { z } from "zod";
import { createSql } from "./lib/db.mjs";
import { readFileSync, existsSync, writeFileSync, appendFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf("=");
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep).trim();
    const value = trimmed.slice(sep + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

const args = process.argv.slice(2);
const argVal = (flag, dflt) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : dflt);
const COUNT = args.includes("--count");
const CALIBRATE = args.includes("--calibrate");
const LIMIT = parseInt(argVal("--limit", "100000"), 10);
const BRAND = argVal("--brand", null);
const MODEL = argVal("--model", "google/gemini-3.1-flash-lite");
const OUT = argVal("--out", "../scraper/lens-duplicate-verdicts.jsonl");
const CONCURRENCY = parseInt(argVal("--concurrency", "4"), 10);

// ---------------------------------------------------------------------------
// Candidate pairs
// ---------------------------------------------------------------------------

/** Makers that appear under more than one brand string. */
function family(brand) {
  const b = (brand ?? "").toLowerCase();
  if (/fuji/.test(b)) return "fuji";
  if (/leica|leitz/.test(b)) return "leica";
  if (/voigt|cosina/.test(b)) return "voigtlander";
  if (/zeiss|contax/.test(b)) return "zeiss";
  if (/nikon|nippon kogaku/.test(b)) return "nikon";
  if (/minolta/.test(b)) return "minolta";
  if (/sigma/.test(b)) return "sigma";
  if (/samyang|rokinon/.test(b)) return "samyang";
  if (/pentax|asahi/.test(b)) return "pentax";
  if (/schneider/.test(b)) return "schneider";
  if (/olympus|zuiko/.test(b)) return "olympus";
  if (/angenieux/.test(b)) return "angenieux";
  if (/meyer/.test(b)) return "meyer";
  return b.replace(/[^a-z0-9]/g, "");
}

const NOISE = new Set(["lens", "the", "for", "with", "and", "mm", "f", "t", "of", "carl", "cosina", "nippon", "kogaku", "wetzlar", "canada", "fujinon", "fujifilm", "fuji", "nikon", "nikkor", "leica", "leitz", "zeiss", "voigtlander", "voigtländer", "minolta", "sigma", "pentax", "smc", "hd", "asahi", "olympus", "canon", "sony", "tokina", "tamron", "samyang", "rokinon", "schneider", "kreuznach", "meyer", "optik", "gorlitz", "angenieux", "paris"]);

function nameTokens(name) {
  return new Set(
    (name ?? "")
      .toLowerCase()
      .replace(/[–—‑]/g, "-")
      .replace(/f\/\s*/g, "f")
      .replace(/\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?mm|\d+(?:\.\d+)?mm/g, " ")
      .replace(/\bf\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?\b/g, " ")
      .replace(/1:\d+(?:\.\d+)?/g, " ")
      .replace(/[^a-z0-9·]+/g, " ")
      .split(" ")
      .filter((t) => t && !NOISE.has(t)),
  );
}

function overlap(a, b) {
  if (!a.size && !b.size) return 1;
  let common = 0;
  for (const t of a) if (b.has(t)) common += 1;
  const subset = common === a.size || common === b.size;
  const jaccard = common / (a.size + b.size - common || 1);
  return subset ? 1 : jaccard;
}

function candidatePairs(rows) {
  const groups = new Map();
  for (const l of rows) {
    const key = [family(l.brand), Number(l.focal_length_min), Number(l.focal_length_max ?? l.focal_length_min), Math.round(Number(l.aperture_min) * 10)].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  const pairs = [];
  for (const group of groups.values()) {
    if (group.length < 2 || group.length > 12) continue; // a dozen 50mm f/1.4 Nikkors is a family tree, not a duplicate list
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (overlap(nameTokens(a.name), nameTokens(b.name)) >= 0.5) pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// The question
// ---------------------------------------------------------------------------

const Verdict = z.object({
  relationship: z.enum(["duplicate", "version", "variant", "family", "different"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  keeper: z.enum(["A", "B", "either"]).describe("For a duplicate: which row's record is the better one to keep"),
  suspectValues: z.array(z.string()).describe('Values in either row that look wrong, as "A.weight_g" or "B.year_introduced"'),
});

function describe(l, label) {
  const specs = l.specs && typeof l.specs === "object" ? Object.entries(l.specs).slice(0, 30).map(([k, v]) => `    ${k}: ${String(v).slice(0, 120)}`).join("\n") : "    (none)";
  return [
    `ROW ${label} (id ${l.id})`,
    `  name: ${l.name}`,
    `  slug: ${l.slug}`,
    `  brand: ${l.brand}`,
    `  source url: ${l.url ?? "(none)"}`,
    `  mount / system: ${l.system_name ?? "(none)"}`,
    `  years: ${l.year_introduced ?? "?"} to ${l.year_discontinued ?? "?"}`,
    `  focal length: ${l.focal_length_min}${l.focal_length_max && l.focal_length_max !== l.focal_length_min ? `-${l.focal_length_max}` : ""}mm, maximum aperture f/${l.aperture_min}`,
    `  optics: ${l.lens_elements ?? "?"} elements in ${l.lens_groups ?? "?"} groups, ${l.diaphragm_blades ?? "?"} blades`,
    `  weight: ${l.weight_g ?? "?"} g, filter ${l.filter_size_mm ?? "?"} mm, close focus ${l.min_focus_distance_m ?? "?"} m, magnification ${l.max_magnification ?? "?"}`,
    `  coverage: ${l.coverage ?? "?"}, type: ${l.lens_type ?? "?"}, era: ${l.era ?? "?"}`,
    `  images: ${(l.images ?? []).length}, description: ${(l.description ?? "").replace(/\s+/g, " ").slice(0, 350) || "(none)"}`,
    `  spec sheet:`,
    specs,
  ].join("\n");
}

const SYSTEM = `You are the editor of a camera lens catalogue deciding whether two records describe the same lens.

The catalogue was assembled from several sources. One source indexed the same lens under two naming conventions, so a true duplicate can differ in brackets, in a model code ("116", "SEL15F14G"), in the maker's engraved name ("Super EBC Fujinon ... Aspherical" against "Fujinon"), in a company prefix ("Cosina Voigtlander" against "Voigtlander"), in year (one copy may carry the wrong year) or in a spec that one copy got wrong. A true duplicate can also share every measured value with a different lens: a version (AI against AI-S), a variant (a coating, finish or mount edition, a "C" multicoated version, an anniversary edition) or a family record whose name uses brackets to mean "with or without" ("Nikkor[·C]" covers both Nikkor and Nikkor·C, "Rokkor[-HG]" both).

Weigh the whole record. Decisive signs of a duplicate: the same model code; the same source URL apart from a cosmetic token; identical measured values with names that differ only by convention; one copy's odd value explained by a parsing slip (weight 400 for 2400, elements swapped with groups); a line badge present in one name only ("| C" for Sigma Contemporary, "| A" for Art) when the specs match. Decisive signs of a version or variant: a version marker in only one name (II, AI-S, N, D, G, ASPH, "T*", an edition name); a years gap with a matching change in weight, elements or close focus.

Two rules that override the specs:
1. Brackets in a name mean "with or without". "Nikkor[·C]", "Rokkor[-HG]", "Nikkor-S(·C)" and "HEXANON [ARM]" are family records that cover both forms. Against a row for one specific form (the "·C" multicoated version, the "-HG" engraving) the answer is "family", never "duplicate", even when every number matches. A coating letter such as Nikon's "·C" or Kilfitt's "C" marks a real later version.
2. The mount decides. A lens made for the Mamiya RB67 and one for the Mamiya C twin-lens reflex, or a Xenar for a Reflex-Korelle and one on a Rolleicord, are different products even with the same name and focal length. The same optical lens sold in several mounts of one system family (Exakta, M42 and Praktina; Nikon F and an adapted copy) is one lens.

Be strict: "duplicate" only when you would merge the records yourself. Put in suspectValues any figure that looks wrong in either row.`;

/**
 * A bracketed suffix ("Nikkor[·C]", "Rokkor[-HG]", "HEXANON [ARM]") is
 * lens-db.com's family record covering both forms. The model is told so but
 * still merges these with 0.9 confidence about a third of the time, so the
 * rule is enforced here: against the specific form the answer is "family".
 */
function bracketFamily(a, b) {
  const suffix = (n) => n.match(/[[(]\s*([-·]?\s*[A-Za-z]{1,4})\s*[\])]/)?.[1]?.replace(/[\s·-]/g, "").toLowerCase();
  const sa = suffix(a.name);
  const sb = suffix(b.name);
  if (!sa && !sb) return false;
  if (sa && sb) return false; // both family rows: let the model decide
  const bare = (n) => n.replace(/[[(][^\])]*[\])]/g, " ").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return bare(a.name) === bare(b.name) || bare(a.name).replace(sa ?? sb, "") === bare(b.name).replace(sa ?? sb, "");
}

async function judge(a, b) {
  const prompt = `${describe(a, "A")}\n\n${describe(b, "B")}\n\nAre A and B the same lens?`;
  const { output } = await generateText({ model: MODEL, system: SYSTEM, prompt, output: Output.object({ schema: Verdict }), temperature: 0, timeout: 60_000 });
  if (output.relationship === "duplicate" && bracketFamily(a, b)) {
    return { ...output, relationship: "family", overridden: "bracketed family name against its specific form" };
  }
  return output;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------

const sql = createSql();
try {
  const rows = await sql`
    select l.*, s.name as system_name
    from lenses l left join systems s on s.id = l.system_id
    where l.merged_into_id is null ${BRAND ? sql`and l.brand ilike ${"%" + BRAND + "%"}` : sql``}`;
  const byId = new Map(rows.map((r) => [r.id, r]));

  if (CALIBRATE) {
    // Known duplicates: what dedupe-lenses.mjs merged today; known non-duplicates: what it held back.
    const merged = await sql`select l.*, s.name as system_name, k.id as keep_id from lenses l
      join lenses k on k.id = l.merged_into_id left join systems s on s.id = l.system_id
      where l.merged_into_id is not null and exists (select 1 from revisions r where r.entity_id = l.id and r.entity_type = 'lens' and r.summary like '%same lens written twice%')`;
    const keepers = await sql`select l.*, s.name as system_name from lenses l left join systems s on s.id = l.system_id where l.id = any(${merged.map((m) => m.keep_id)}::int[])`;
    const keeperById = new Map(keepers.map((k) => [k.id, k]));
    const known = merged.map((m) => ({ a: keeperById.get(m.keep_id), b: m, expected: "duplicate" }));
    // The held-back groups are the loose candidates whose names are equal under the cosmetic rule but whose facts disagree.
    const held = candidatePairs(rows).filter(([a, b]) => {
      const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, "");
      return norm(a.name) === norm(b.name) || norm(a.name).replace(/c/g, "") === norm(b.name).replace(/c/g, "");
    }).map(([a, b]) => ({ a, b, expected: "not duplicate" }));
    const set = [...known, ...held].slice(0, LIMIT);
    console.log(`calibrating on ${known.length} known duplicates and ${held.length} held-back pairs with ${MODEL}`);
    const verdicts = await mapLimit(set, CONCURRENCY, async (p) => ({ ...p, verdict: await judge(p.a, p.b).catch((e) => ({ relationship: "error", confidence: 0, reasoning: String(e) })) }));
    let agree = 0;
    for (const v of verdicts) {
      const saidDup = v.verdict.relationship === "duplicate";
      const ok = (v.expected === "duplicate") === saidDup;
      agree += ok ? 1 : 0;
      if (!ok) console.log(`  DISAGREE expected ${v.expected}: #${v.a.id} ${v.a.name}  <>  #${v.b.id} ${v.b.name}\n      → ${v.verdict.relationship} (${v.verdict.confidence}): ${v.verdict.reasoning.slice(0, 220)}`);
    }
    console.log(`\nagreement ${agree}/${verdicts.length}`);
    const dupConf = verdicts.filter((v) => v.expected === "duplicate").map((v) => v.verdict.confidence);
    console.log(`confidence on true duplicates: min ${Math.min(...dupConf)}, median ${dupConf.sort()[Math.floor(dupConf.length / 2)]}`);
    process.exit(0);
  }

  const pairs = candidatePairs(rows);
  console.log(`${rows.length} live lenses, ${pairs.length} candidate pairs${BRAND ? ` in ${BRAND}` : ""}`);
  if (COUNT) {
    const byFam = new Map();
    for (const [a] of pairs) byFam.set(family(a.brand), (byFam.get(family(a.brand)) ?? 0) + 1);
    console.log([...byFam.entries()].sort((x, y) => y[1] - x[1]).map(([f, n]) => `${f} ${n}`).join(", "));
    process.exit(0);
  }

  const done = new Set(existsSync(resolve(OUT)) ? readFileSync(resolve(OUT), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).key) : []);
  const todo = pairs.filter(([a, b]) => !done.has(`${a.id}-${b.id}`)).slice(0, LIMIT);
  console.log(`${done.size} already judged, judging ${todo.length} with ${MODEL}`);
  let n = 0;
  const tally = {};
  await mapLimit(todo, CONCURRENCY, async ([a, b]) => {
    const verdict = await judge(a, b).catch((e) => ({ relationship: "error", confidence: 0, reasoning: String(e).slice(0, 200), keeper: "either", suspectValues: [] }));
    appendFileSync(resolve(OUT), JSON.stringify({ key: `${a.id}-${b.id}`, a: { id: a.id, name: a.name, slug: a.slug }, b: { id: b.id, name: b.name, slug: b.slug }, ...verdict }) + "\n");
    tally[verdict.relationship] = (tally[verdict.relationship] ?? 0) + 1;
    n += 1;
    if (n % 25 === 0) console.log(`  ${n}/${todo.length} ${JSON.stringify(tally)}`);
  });
  console.log(`done: ${JSON.stringify(tally)}`);

  // Markdown report of everything judged so far, duplicates first.
  const all = readFileSync(resolve(OUT), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const md = ["# Lens duplicate verdicts", "", `Model: ${MODEL}. ${all.length} pairs judged.`, ""];
  for (const rel of ["duplicate", "version", "variant", "family", "different", "error"]) {
    const rows = all.filter((v) => v.relationship === rel).sort((x, y) => y.confidence - x.confidence);
    if (!rows.length) continue;
    md.push(`## ${rel}: ${rows.length}`, "");
    for (const v of rows) {
      md.push(`- **${v.confidence.toFixed(2)}** #${v.a.id} ${v.a.name} [${v.a.slug}]  <>  #${v.b.id} ${v.b.name} [${v.b.slug}]${v.keeper && v.keeper !== "either" ? ` (keep ${v.keeper})` : ""}`);
      md.push(`  - ${v.reasoning.replace(/\s+/g, " ")}${v.suspectValues?.length ? ` Suspect: ${v.suspectValues.join(", ")}` : ""}`);
    }
    md.push("");
  }
  writeFileSync(resolve(OUT.replace(/\.jsonl$/, ".md")), md.join("\n"));
  console.log(`wrote ${OUT} and ${OUT.replace(/\.jsonl$/, ".md")}`);
} finally {
  await sql.end();
}
