/**
 * Draft catalogue records for the lens-db.com entries we are missing.
 *
 * Input is missing.json from lensdb-sitemap-gaps.mjs: a display name rebuilt
 * from a sitemap slug, the kind (lens or camera) and, for a variant, the id of
 * the catalogue row it is a version or edition of. lens-db.com's pages are
 * behind a registration wall, so every value here comes from a model's own
 * knowledge. A single model's recall is not a source, so each record is drafted
 * twice, by two models that do not see each other's answer, and a field is kept
 * only where both agree:
 *
 *   1. primary   (--model, default google/gemini-3.1-flash-lite) drafts every
 *                field with a confidence for each.
 *   2. second    (--second-model, default google/gemini-3.8-flash) drafts the
 *                same fields independently.
 *   3. reconcile compares them field by field. Agreement keeps the value;
 *                disagreement, or a value only one model gave, flags the field.
 *   4. mounts    both models list every mount the item was sold in; the
 *                overlap is the agreed set and its first entry the system.
 *   5. describe  the primary model writes the description from the agreed
 *                fields alone, so the prose cannot state a disputed number.
 *
 * A record is "ready" when every field a page must carry (see MIN_BAR) is
 * agreed, "review" when one is disputed or missing, and "unknown" when either
 * model could not identify the item at all. Nothing is written to the
 * database; enriched.json and enrich-report.md are for a person to check.
 *
 * Usage (from frontend/):
 *   node scripts/enrich-lensdb-gaps.mjs --limit 20     # first 20 records, all passes
 *   node scripts/enrich-lensdb-gaps.mjs                # everything (resumable)
 *   node scripts/enrich-lensdb-gaps.mjs --report       # rebuild enriched.json from the pass files
 */

import { generateText, Output } from "ai";
import { z } from "zod";
import { createSql } from "./lib/db.mjs";
import { readFileSync, existsSync, writeFileSync, appendFileSync } from "fs";
import { resolve, join } from "path";
import { SENSOR_SIZES } from "../src/lib/sensor-size.ts";
import { BODY_TYPES } from "../src/lib/body-type.ts";
import { SHUTTER_TYPES } from "../src/lib/shutter.ts";
import { COVERAGE, ERA, PRODUCTION_STATUS } from "../src/lib/vocabularies.ts";

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
const argVal = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const DIR = resolve(argVal("--dir", "../scraper/lensdb-sitemap"));
const MODEL = argVal("--model", "google/gemini-3.1-flash-lite");
const SECOND_MODEL = argVal("--second-model", "google/gemini-3.8-flash");
const LIMIT = Number(argVal("--limit", "0"));
const CONCURRENCY = Number(argVal("--concurrency", "8"));
const REPORT_ONLY = args.includes("--report");

const FILES = {
  primary: resolve(DIR, "enrich-primary.jsonl"),
  second: resolve(DIR, "enrich-second.jsonl"),
  describe: resolve(DIR, "enrich-describe.jsonl"),
  mountsPrimary: resolve(DIR, "enrich-mounts-primary.jsonl"),
  mountsSecond: resolve(DIR, "enrich-mounts-second.jsonl"),
  tiebreak: resolve(DIR, "enrich-system-tiebreak.jsonl"),
};

const LENS_TYPES = [
  "Prime lens", "Wide-angle prime lens", "Ultra-wide angle prime lens", "Standard prime lens",
  "Short telephoto prime lens", "Medium telephoto prime lens", "Telephoto prime lens", "Super telephoto prime lens",
  "Standard zoom lens", "Wide-angle zoom lens", "Telephoto zoom lens", "Zoom lens", "Macro lens", "Fisheye lens",
  "Mirror lens", "Tilt-shift lens",
];

/** The fields a page cannot be published without. */
const MIN_BAR = {
  lens: ["system", "year_introduced", "focal_length_min", "aperture_min", "weight_g", "coverage"],
  camera: ["system", "year_introduced", "body_type", "sensor_size", "shutter_type", "weight_g"],
};

// ---------------------------------------------------------------------------
// Schemas

const f = (schema, what) => z.object({
  value: schema.nullable(),
  confidence: z.number().describe("0-1: how sure you are of this value"),
}).describe(what);

function lensSchema(systems) {
  return z.object({
    identified: z.boolean().describe("false if you do not recognise this exact lens"),
    identity_note: z.string().describe("One sentence: what this lens is, or why you cannot place it"),
    fields: z.object({
      brand: f(z.string(), "Maker as printed on the lens"),
      system: f(z.string(), `The primary mount, exactly one of: ${systems.join(" | ")}`),
      mount_as_written: f(z.string(), "The mount as the maker names it, even if not in the list"),
      lens_type: f(z.enum(LENS_TYPES), "Class of lens"),
      era: f(z.enum(ERA), "Film era or Digital era"),
      production_status: f(z.enum(PRODUCTION_STATUS), "Current production status"),
      year_introduced: f(z.number(), "Year announced or first sold"),
      year_discontinued: f(z.number(), "Year production ended, null if still made or unknown"),
      focal_length_min: f(z.number(), "Shortest focal length in mm"),
      focal_length_max: f(z.number(), "Longest focal length in mm (same as min for a prime)"),
      aperture_min: f(z.number(), "Maximum aperture f-number at the wide end, e.g. 4 for an f/4-5.6 zoom"),
      aperture_max: f(z.number(), "Maximum aperture f-number at the long end, e.g. 5.6 for an f/4-5.6 zoom; same as aperture_min for a prime"),
      weight_g: f(z.number(), "Weight in grams"),
      filter_size_mm: f(z.number(), "Front filter thread in mm"),
      min_focus_distance_m: f(z.number(), "Closest focusing distance in metres"),
      max_magnification: f(z.number(), "Maximum magnification as a ratio, e.g. 0.15"),
      lens_elements: f(z.number(), "Number of elements"),
      lens_groups: f(z.number(), "Number of groups"),
      diaphragm_blades: f(z.number(), "Number of aperture blades"),
      coverage: f(z.enum(COVERAGE), "Image circle the lens covers"),
      has_autofocus: f(z.boolean(), "Autofocus"),
      has_stabilization: f(z.boolean(), "Optical stabilisation"),
      is_macro: f(z.boolean(), "Sold as a macro lens"),
    }),
  });
}

function cameraSchema(systems) {
  return z.object({
    identified: z.boolean().describe("false if you do not recognise this exact camera"),
    identity_note: z.string().describe("One sentence: what this camera is, or why you cannot place it"),
    fields: z.object({
      brand: f(z.string(), "Maker"),
      system: f(z.string(), `The lens mount, exactly one of: ${systems.join(" | ")}. Null for a fixed-lens camera`),
      mount_as_written: f(z.string(), "The mount as the maker names it"),
      built_in_lens: f(z.string(), "The fixed lens, e.g. 'Biogon 38mm F/4.5', only for a fixed-lens camera"),
      body_type: f(z.enum([...new Set([...BODY_TYPES.digital, ...BODY_TYPES.film])]), "Body type"),
      sensor_size: f(z.enum([...new Set([...SENSOR_SIZES.digital, ...SENSOR_SIZES.film])]), "Film format or sensor size"),
      sensor_type: f(z.string(), "Digital only: CMOS, BSI-CMOS, Stacked CMOS or CCD"),
      megapixels: f(z.number(), "Digital only"),
      shutter_type: f(z.enum(SHUTTER_TYPES), "Shutter mechanism"),
      shutter_speeds: f(z.string(), "Speed range as '1 - 1/1000 + B'"),
      metering: f(z.string(), "Metering, e.g. 'TTL centre-weighted', or 'None'"),
      production_status: f(z.enum(PRODUCTION_STATUS), "Current production status"),
      year_introduced: f(z.number(), "Year announced or first sold"),
      year_discontinued: f(z.number(), "Year production ended, null if still made or unknown"),
      weight_g: f(z.number(), "Body weight in grams"),
    }),
  });
}

const Description = z.object({ description: z.string() });

/**
 * The drafts asked for "the primary mount", which has no answer for a
 * third-party lens made in several fixed mounts (a Vivitar Series 1 came in
 * FD, AI, K, OM...): one model answered "Interchangeable mount", which in this
 * catalogue is the T-mount-style interchangeable designs, the other gave up.
 * The catalogue records such a lens under every mount it was sold in
 * (lens_systems) with the first of them as system_id, so ask for the list.
 */
function mountsSchema(systems) {
  return z.object({
    mounts: z.array(z.enum(systems)).describe("Every mount this exact item was sold in, from the list"),
    confidence: z.number().describe("0-1: how sure you are the list is right"),
  });
}

function tiebreakSchema(systems) {
  return z.object({
    system: z.enum(systems).nullable().describe("The mount this exact item was made for, or null if you cannot tell"),
    confidence: z.number().describe("0-1"),
    reason: z.string().describe("One sentence"),
  });
}

const TIEBREAK_SYSTEM = `Two models disagreed on which camera mount a photographic lens or camera was made for. Decide from what you know about this exact item, using the catalogue rows given as evidence of how related items from the same maker and line are filed. Prefer one of the models' answers or a system the evidence rows use; answer null when you cannot tell. Be strict about sibling systems that are easy to confuse: Mamiya RB67 / RZ67 / M645 / 7, Hasselblad V / Rolleiflex SL66, Pentax 67 / 645, Bronica ETR / SQ / GS-1.`;

const MOUNTS_SYSTEM = `List the camera mounts a photographic lens or camera was sold in, using only names from the allowed list. A third-party lens made in several fixed mounts (Vivitar, Soligor, Tokina, Sigma, Samyang and the like) lists each of them. Use "Interchangeable mount", "T-mount (T2)", "T-4 (Vivitar / Soligor)" or a Tamron Adaptall entry only for a lens built on that interchangeable-mount system. A camera lists the mount of its lenses; a fixed-lens camera lists nothing. Return an empty list rather than guess.`;

// ---------------------------------------------------------------------------
// Prompts

const DRAFT_SYSTEM = `You are filling in a record for a photographic equipment reference. Give only values you actually know for this exact item. Null is always better than a guess: a wrong number published as fact is the worst outcome. Confidence is how likely the value is exactly right (0.9+ only when you are certain).

The item comes from lens-db.com, whose names use "F/" apertures, roman numerals for versions ("[I]", "II"), bracketed optional words ("[MC]" means with or without MC), serial-range suffixes for Vivitar ("SN 37xxxxxx": the first digits of the serial name the maker), and edition names for special runs. A special edition shares its optics and most specs with the base model; its weight and finish may differ.

When a base model row from our catalogue is given, it is a closely related item (an earlier version, or the standard edition of this special edition). Use it as context, not as an answer: copy a value only if you know it is the same for this item.`;

const DESCRIBE_SYSTEM = `Write the description for a catalogue page of a photographic lens or camera, from the facts given and nothing else. Two to four sentences of plain reference prose: what it is, who made it and when, its mount or format, and what sets it apart where the facts show it (a special edition, a version change, an unusual specification). No prices, no marketing language, no superlatives you cannot back with a given fact, no reviewer or website names, no em dashes, no lists. If the facts are thin, write less.`;

function describeRow(r) {
  if (!r) return null;
  const out = {};
  for (const [k, v] of Object.entries(r)) if (v !== null && v !== "" && k !== "specs") out[k] = v;
  if (r.specs && Object.keys(r.specs).length) out.specs = r.specs;
  return out;
}

async function call(model, system, prompt, schema) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { output } = await generateText({ model, system, prompt, output: Output.object({ schema }), temperature: 0, timeout: 90_000 });
      return output;
    } catch (e) {
      if (attempt === 2 || /budget/i.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
}

// ---------------------------------------------------------------------------
// Reconcile

const TOLERANCE = { weight_g: 0.08, min_focus_distance_m: 0.05, max_magnification: 0.1, megapixels: 0.03 };

function agrees(field, a, b) {
  if (a == null || b == null) return false;
  if (typeof a === "number" && typeof b === "number") {
    const tol = TOLERANCE[field];
    if (tol) return Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b));
    return a === b;
  }
  if (typeof a === "string" && typeof b === "string") {
    const n = (s) => s.toLowerCase().replace(/[^a-z0-9/]/g, "");
    return n(a) === n(b);
  }
  return a === b;
}

/**
 * The catalogue keeps the historical maker in `name` ("Nippon Kogaku Nikkor-H
 * Auto", "Asahi Auto-Takumar", "Cosina Voigtlander APO-Lanthar") and the
 * house in `brand` (Nikon, Pentax, Cosina), after a consolidation pass
 * (consolidate-brands.mjs) and years of edits. Rather than restate those rules,
 * learn them from the rows: the longest name prefix the catalogue files under
 * one brand decides the brand of a new row. Deterministic, so it never goes to
 * review; a maker the catalogue has never seen keeps the brand the models gave.
 */
function brandIndex(rows) {
  const idx = new Map();
  for (const { name, brand } of rows) {
    const words = String(name).toLowerCase().split(/\s+/);
    for (let k = 1; k <= Math.min(4, words.length - 1); k++) {
      const key = words.slice(0, k).join(" ");
      const counts = idx.get(key) ?? idx.set(key, new Map()).get(key);
      counts.set(brand, (counts.get(brand) ?? 0) + 1);
    }
  }
  return (name, fallback) => {
    const words = String(name).toLowerCase().split(/\s+/);
    for (let k = Math.min(4, words.length - 1); k >= 1; k--) {
      const counts = idx.get(words.slice(0, k).join(" "));
      if (!counts) continue;
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      const [brand, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (total >= 2 && n / total >= 0.8) return brand;
    }
    return fallback;
  };
}

/**
 * The same idea for the mount. A lens line ("Miranda Auto", "Mamiya Sekor C",
 * "Olympus OM Zuiko") is the name up to the focal length, and the catalogue
 * files most lines under one system. Measured leave-one-out on the live
 * lenses (2026-09-24): where at least three rows share the longest line
 * prefix and 90% of them agree, the prediction was right for 97.8% of 3,719
 * rows; where the longest informative prefix is mixed, it makes no call.
 */
function systemIndex(rows) {
  const line = (name) => {
    const out = [];
    for (const w of String(name).toLowerCase().split(/\s+/)) {
      if (/^\d+(\.\d+)?(-\d+(\.\d+)?)?mm$/.test(w)) break;
      out.push(w);
    }
    return out;
  };
  const idx = new Map();
  for (const { name, system: raw } of rows) {
    const system = canonicalSystem(raw);
    const ws = line(name);
    for (let k = 1; k <= ws.length; k++) {
      const key = ws.slice(0, k).join(" ");
      const counts = idx.get(key) ?? idx.set(key, new Map()).get(key);
      counts.set(system, (counts.get(system) ?? 0) + 1);
    }
  }
  return (name) => {
    const ws = line(name);
    for (let k = ws.length; k >= 1; k--) {
      const counts = idx.get(ws.slice(0, k).join(" "));
      if (!counts) continue;
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      if (total < 3) continue;
      const [system, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return n / total >= 0.9 ? system : null;
    }
    return null;
  };
}

/**
 * Systems that are one physical mount under two names. Topcon's R, RE and
 * Super D bodies use the Exakta bayonet (44.7 mm register, same as the
 * "Exakta" row); Topcon is the maker, Exakta the mount. The catalogue still
 * has a separate "Topcon" system row until it is folded into Exakta.
 */
const SYSTEM_ALIASES = new Map([["Topcon", "Exakta"]]);
const canonicalSystem = (name) => SYSTEM_ALIASES.get(name) ?? name;

/**
 * lens-db names the mount of a mount-specific entry in its slug: "...-for-
 * rectaflex-1948", "...-for-sensorex-ii". That is the source's own fact, so it
 * outranks everything else. The phrase is resolved the catalogue's way: the
 * system most rows named "... for <phrase>" are filed under, else a system
 * whose name is the phrase.
 */
function slugMountIndex(rows, systemNames) {
  const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const bySystemName = new Map([...systemNames].map((n) => [norm(n), n]));
  return (slug) => {
    const core = slug.replace(/-((?:18|19|20)\d\d)(?:-\d)?$/, "");
    const m = core.match(/-for-([a-z0-9-]+)$/);
    if (!m) return null;
    const phrase = m[1].replace(/-/g, " ");
    const counts = new Map();
    for (const { name, system } of rows) {
      const n = norm(name);
      if (n.endsWith(` for ${phrase}`) || n.includes(` for ${phrase} `)) counts.set(system, (counts.get(system) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    let system = null;
    if (total) {
      const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (n / total >= 0.8) system = canonicalSystem(top);
    }
    system ??= bySystemName.get(phrase) ?? null;
    return { phrase, system };
  };
}

/** lens-db's "for <mount>" put back on a name the models dropped it from. */
function nameWithMount(name, slugMount) {
  if (!slugMount || /\bfor\b/i.test(name)) return name;
  const words = slugMount.phrase.split(" ").map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)));
  return `${name} for ${words.join(" ")}`;
}

/**
 * Settle the system without a person: the related catalogue row, then the
 * models' agreed mounts (primary chosen by the line convention when it is one
 * of them), then the line convention alone.
 */
function settleSystem(entry, fields, related, lineSystem, tiebreak, makerSystems, slugMount) {
  const f = fields.system ?? {};
  const listed = new Set([...(fields.mounts?.primary ?? []), ...(fields.mounts?.second ?? [])]);
  const agreed = fields.mounts?.value ?? [];
  const byLine = lineSystem(entry.display_name);
  const relatedSystem = related?.system ? canonicalSystem(related.system) : null;
  const set = (value, source) => {
    fields.system = { ...f, value, state: "agreed", confidence: 1, source };
    if (fields.mounts && !agreed.includes(value)) fields.mounts = { ...fields.mounts, value: [value, ...agreed], state: "agreed", source };
  };
  if (slugMount?.system) {
    fields.system = { ...f, value: slugMount.system, state: "agreed", confidence: 1, source: "lens-db slug" };
    if (fields.mounts) fields.mounts = { ...fields.mounts, value: [slugMount.system], state: "agreed", source: "lens-db slug" };
    return;
  }
  if (relatedSystem && (entry.is_edition || listed.has(relatedSystem))) return set(relatedSystem, "related catalogue row");
  if (agreed.length) {
    if (byLine && agreed.includes(byLine)) return set(byLine, "models agree, primary by catalogue line");
    return;
  }
  if (byLine) return set(byLine, "catalogue line convention");
  // A third-party design sold in many fixed mounts (Soligor, Tokina, Samyang,
  // Cosina zooms): only one model lists the mounts, the other says nothing.
  // The catalogue files such a lens under the first mount of lens-db's
  // alphabetical list (Canon FD for nearly every Soligor and Vivitar row) and
  // keeps the full list in specs, so do the same, provided the maker already
  // has lenses on that system in the catalogue.
  const lists = [fields.mounts?.primary ?? [], fields.mounts?.second ?? []];
  const only = lists.filter((l) => l.length);
  const known = makerSystems?.get(fields.brand?.value);
  if (only.length === 1 && only[0].length >= 3) {
    const sorted = [...only[0]].sort((a, b) => a.localeCompare(b));
    if (known?.has(sorted[0])) {
      const source = "one model's mount list, filed under its first mount like the maker's other rows";
      fields.mounts = { ...fields.mounts, value: sorted, state: "agreed", source };
      return set(sorted[0], source);
    }
  }
  const options = new Set([...listed, ...(tiebreak?.evidence ?? [])]);
  if (tiebreak?.system && tiebreak.confidence >= 0.8 && options.has(tiebreak.system)) return set(tiebreak.system, "tie-break with catalogue evidence");
}

/** Fields shown to the reviewer but never counted as a dispute. */
const INFORMATIONAL = new Set(["mount_as_written"]);

function reconcile(entry, p, s, systems, mp, ms) {
  const fields = {};
  const disputed = [];
  const names = new Set([...Object.keys(p?.fields ?? {}), ...Object.keys(s?.fields ?? {})]);
  for (const name of names) {
    const a = p?.fields?.[name];
    const b = s?.fields?.[name];
    let va = a?.value ?? null;
    let vb = b?.value ?? null;
    // A mount we do not have is no answer for the system column; it survives in mount_as_written.
    if (name === "system") {
      if (!systems.has(va)) va = null;
      if (!systems.has(vb)) vb = null;
    }
    let value = null;
    let state;
    if (va == null && vb == null) state = "unknown";
    else if (agrees(name, va, vb)) {
      state = "agreed";
      // Within tolerance, prefer the stronger model's figure.
      value = vb;
    } else if (va == null || vb == null) state = "single";
    else state = "disputed";
    // "Still made" and "unknown" both come back as a null end year; that is not a dispute.
    if (name === "year_discontinued" && state !== "agreed" && (va == null || vb == null)) state = va == null && vb == null ? "unknown" : "single";
    const confidence = state === "agreed" ? Math.min(a?.confidence ?? 0, b?.confidence ?? 0) : null;
    fields[name] = { value, state, confidence, primary: va, second: vb };
    if ((state === "disputed" || state === "single") && !INFORMATIONAL.has(name)) disputed.push(name);
  }
  // lens-db.com ends most slugs with the year introduced ("-1973", or
  // "-1973-2" for a WordPress duplicate). That is the source's own figure, so
  // it outranks either model's recall.
  const slugYear = Number(entry.slug.match(/-((?:18|19|20)\d\d)(?:-\d)?$/)?.[1]) || null;
  if (slugYear && slugYear >= 1839 && slugYear <= new Date().getFullYear() + 1) {
    const y = fields.year_introduced ?? {};
    fields.year_introduced = { value: slugYear, state: "agreed", confidence: 1, primary: y.primary ?? null, second: y.second ?? null, source: "lens-db slug" };
    disputed.splice(0, disputed.length, ...disputed.filter((n) => n !== "year_introduced"));
  }
  if (mp && ms) {
    const a = [...new Set((mp.mounts ?? []).map(canonicalSystem))];
    const b = [...new Set((ms.mounts ?? []).map(canonicalSystem))];
    const both = a.filter((m) => b.includes(m));
    const all = [...new Set([...a, ...b])];
    // The first agreed mount is the row's system; the rest go to lens_systems.
    fields.mounts = { value: both.length ? both : null, state: both.length ? "agreed" : all.length ? "disputed" : "unknown", confidence: both.length ? Math.min(mp.confidence, ms.confidence) : null, primary: a, second: b };
    fields.system = { ...fields.mounts, value: both[0] ?? null, primary: a[0] ?? null, second: b[0] ?? null };
    disputed.splice(0, disputed.length, ...disputed.filter((n) => n !== "system"));
    if (fields.mounts.state === "disputed") disputed.push("system");
  }
  const bar = MIN_BAR[entry.kind === "camera" ? "camera" : "lens"].filter((n) => {
    // An obscure lens may carry no weight: nobody recorded it, and an
    // unrecorded weight is fine to leave blank. Two different figures still
    // need a person, and a figure only one model gave is not published.
    if (n === "weight_g" && entry.kind !== "camera" && fields.weight_g?.state !== "disputed") return false;
    // Without a year in the slug there is no source year; leave it blank rather than hold the record.
    if (n === "year_introduced" && !slugYear) return false;
    // A fixed-lens camera has no mount; its built-in lens stands in for it.
    if (n === "system" && entry.kind === "camera" && fields.built_in_lens?.state === "agreed") return false;
    return fields[n]?.state !== "agreed";
  });
  let status = "ready";
  if (!p?.identified || !s?.identified) status = "unknown";
  else if (bar.length) status = "review";
  return { fields, disputed, missing_bar: bar, status };
}

// ---------------------------------------------------------------------------

function readJsonl(file) {
  const map = new Map();
  if (!existsSync(file)) return map;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const v = JSON.parse(line);
    map.set(v.url, v);
  }
  return map;
}

async function pool(items, fn) {
  const queue = [...items];
  let done = 0;
  let failed = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        await fn(item);
      } catch (e) {
        failed++;
        console.error(`fail ${item.slug}: ${e.message.slice(0, 140)}`);
        if (/budget/i.test(e.message)) queue.length = 0;
      }
      if (++done % 25 === 0) console.log(`  ${done}/${items.length}`);
    }
  }));
  return { done, failed };
}

async function main() {
  const missing = JSON.parse(readFileSync(resolve(DIR, "missing.json"), "utf8")).filter((e) => e.status === "missing");
  const sql = createSql();
  const systems = (await sql`SELECT name FROM systems ORDER BY name`).map((r) => r.name);
  const systemSet = new Set(systems);
  const systemRows = await sql`SELECT l.name, s.name AS system FROM lenses l JOIN systems s ON s.id = l.system_id WHERE l.merged_into_id IS NULL`;
  const cameraSystemRows = await sql`SELECT c.name, s.name AS system FROM cameras c JOIN systems s ON s.id = c.system_id WHERE c.merged_into_id IS NULL`;
  const lineSystem = systemIndex(systemRows);
  const slugMountOf = slugMountIndex(systemRows, systemSet);
  // Every mount the catalogue records for each lens maker, through lens_systems.
  const makerSystems = new Map();
  for (const { brand, system } of await sql`SELECT DISTINCT l.brand, s.name AS system FROM lens_systems ls JOIN lenses l ON l.id = ls.lens_id JOIN systems s ON s.id = ls.system_id WHERE l.merged_into_id IS NULL AND l.brand IS NOT NULL`) {
    (makerSystems.get(brand) ?? makerSystems.set(brand, new Set()).get(brand)).add(canonicalSystem(system));
  }
  /** Catalogue rows sharing the longest name prefix with this item, as evidence for the tie-break. */
  const evidenceFor = (e) => {
    const pool = e.kind === "camera" ? cameraSystemRows : systemRows;
    const words = String(e.display_name).toLowerCase().split(/\s+/);
    for (let k = Math.min(3, words.length - 1); k >= 1; k--) {
      const prefix = words.slice(0, k).join(" ") + " ";
      const hits = pool.filter((r) => r.name.toLowerCase().startsWith(prefix));
      if (hits.length) return hits.slice(0, 15).map((r) => ({ name: r.name, system: canonicalSystem(r.system) }));
    }
    return [];
  };
  const brandOf = brandIndex(await sql`SELECT name, brand FROM lenses WHERE merged_into_id IS NULL AND brand IS NOT NULL AND brand <> ''`);
  const refIds = { lens: missing.filter((e) => e.kind !== "camera" && e.ref_id).map((e) => e.ref_id), camera: missing.filter((e) => e.kind === "camera" && e.ref_id).map((e) => e.ref_id) };
  const lensRefs = refIds.lens.length ? await sql`
    SELECT l.id, l.name, l.brand, s.name AS system, l.lens_type, l.year_introduced, l.year_discontinued, l.focal_length_min, l.focal_length_max,
           l.aperture_min, l.aperture_max, l.weight_g, l.filter_size_mm, l.min_focus_distance_m, l.lens_elements, l.lens_groups,
           l.diaphragm_blades, l.coverage, l.specs
    FROM lenses l LEFT JOIN systems s ON s.id = l.system_id WHERE l.id = ANY(${refIds.lens})` : [];
  const cameraRefs = refIds.camera.length ? await sql`
    SELECT c.id, c.name, s.name AS system, c.body_type, c.sensor_size, c.shutter_type, c.year_introduced, c.weight_g, c.specs
    FROM cameras c LEFT JOIN systems s ON s.id = c.system_id WHERE c.id = ANY(${refIds.camera})` : [];
  await sql.end?.();
  const refs = new Map([...lensRefs.map((r) => [`lens:${r.id}`, r]), ...cameraRefs.map((r) => [`camera:${r.id}`, r])]);
  const refOf = (e) => (e.ref_id ? refs.get(`${e.kind === "camera" ? "camera" : "lens"}:${e.ref_id}`) : null);

  let todo = missing;
  if (LIMIT) todo = todo.slice(0, LIMIT);
  const schemaFor = (e) => (e.kind === "camera" ? cameraSchema(systems) : lensSchema(systems));
  const draftPrompt = (e) => JSON.stringify({
    item: { kind: e.kind === "tc" ? "teleconverter" : e.kind, name: e.display_name, brand: e.brand, lens_db_slug: e.slug, is_special_edition: !!e.is_edition },
    base_model_row: describeRow(refOf(e)),
  }, null, 1);

  const primary = readJsonl(FILES.primary);
  const second = readJsonl(FILES.second);
  const described = readJsonl(FILES.describe);
  const mountsP = readJsonl(FILES.mountsPrimary);
  const mountsS = readJsonl(FILES.mountsSecond);
  const tiebreaks = readJsonl(FILES.tiebreak);
  const cameraWiki = readJsonl(join(DIR, "camerawiki-lookup.jsonl"));

  /** Reconcile the two drafts, then settle brand and system without a person. */
  const finalRecord = (e) => {
    const rec = reconcile(e, primary.get(e.url), second.get(e.url), systemSet, mountsP.get(e.url), mountsS.get(e.url));
    if (e.kind !== "camera") {
      const b = rec.fields.brand ?? {};
      const brand = brandOf(e.display_name, b.value ?? b.second ?? b.primary ?? null);
      rec.fields.brand = { ...b, value: brand, state: "agreed", confidence: 1, source: "catalogue brand convention" };
      rec.disputed = rec.disputed.filter((n) => n !== "brand");
    }
    // camera-wiki is a published source: a figure its article states for this
    // lens (camera-wiki-gap-lookup.mjs) replaces what the models disagreed on
    // or did not know. A mount list settles the system only when nothing else did.
    const cw = cameraWiki.get(e.url);
    if (cw?.title && cw.confidence >= 0.8 && cw.fields) {
      for (const [k, v] of Object.entries(cw.fields)) {
        if (k === "mounts" || v === null || v === undefined) continue;
        // What is already agreed stands (two models, or the slug's own
        // figures): the description was written from those values before
        // this lookup ran, so replacing one would contradict it.
        if (rec.fields[k]?.state === "agreed") continue;
        rec.fields[k] = { ...(rec.fields[k] ?? {}), value: v, state: "agreed", confidence: 1, source: "camera-wiki", source_url: cw.article };
      }
    }
    settleSystem(e, rec.fields, refOf(e), lineSystem, tiebreaks.get(e.url), makerSystems, slugMountOf(e.slug));
    if (rec.fields.system?.state !== "agreed" && cw?.title && cw.confidence >= 0.8 && cw.fields?.mounts?.length) {
      const [first] = cw.fields.mounts.map(canonicalSystem);
      rec.fields.system = { ...(rec.fields.system ?? {}), value: first, state: "agreed", confidence: 1, source: "camera-wiki", source_url: cw.article };
      rec.fields.mounts = { ...(rec.fields.mounts ?? {}), value: cw.fields.mounts.map(canonicalSystem), state: "agreed", source: "camera-wiki", source_url: cw.article };
    }
    const settled = (n) => rec.fields[n]?.state === "agreed";
    rec.disputed = rec.disputed.filter((n) => !settled(n));
    rec.missing_bar = rec.missing_bar.filter((n) => !settled(n));
    if (rec.status === "review" && !rec.missing_bar.length) rec.status = "ready";
    return rec;
  };

  if (!REPORT_ONLY) {
    for (const [label, file, model, map] of [["primary", FILES.primary, MODEL, primary], ["second", FILES.second, SECOND_MODEL, second]]) {
      const items = todo.filter((e) => !map.has(e.url));
      console.log(`${label}: drafting ${items.length} with ${model}`);
      const r = await pool(items, async (e) => {
        const out = await call(model, DRAFT_SYSTEM, draftPrompt(e), schemaFor(e));
        const rec = { url: e.url, model, ...out };
        appendFileSync(file, JSON.stringify(rec) + "\n");
        map.set(e.url, rec);
      });
      console.log(`${label}: done ${r.done - r.failed}, failed ${r.failed}`);
    }

    for (const [label, file, model, map] of [["mounts-primary", FILES.mountsPrimary, MODEL, mountsP], ["mounts-second", FILES.mountsSecond, SECOND_MODEL, mountsS]]) {
      const items = todo.filter((e) => !map.has(e.url));
      console.log(`${label}: listing ${items.length} with ${model}`);
      const r = await pool(items, async (e) => {
        const out = await call(model, MOUNTS_SYSTEM, JSON.stringify({ item: { kind: e.kind, name: e.display_name, brand: e.brand }, allowed: systems }), mountsSchema(systems));
        const rec = { url: e.url, model, ...out };
        appendFileSync(file, JSON.stringify(rec) + "\n");
        map.set(e.url, rec);
      });
      console.log(`${label}: done ${r.done - r.failed}, failed ${r.failed}`);
    }

    // System tie-break, only for items the deterministic steps leave unsettled.
    const unsettled = todo.filter((e) => {
      if (tiebreaks.has(e.url) || !primary.has(e.url) || !second.has(e.url)) return false;
      const rec = reconcile(e, primary.get(e.url), second.get(e.url), systemSet, mountsP.get(e.url), mountsS.get(e.url));
      if (rec.status === "unknown") return false;
      settleSystem(e, rec.fields, refOf(e), lineSystem, null, makerSystems, slugMountOf(e.slug));
      return rec.fields.system?.state !== "agreed" && !(e.kind === "camera" && rec.fields.built_in_lens?.state === "agreed");
    });
    console.log(`tiebreak: judging ${unsettled.length} with ${SECOND_MODEL}`);
    const tb = await pool(unsettled, async (e) => {
      const evidence = evidenceFor(e);
      const prompt = JSON.stringify({
        item: { kind: e.kind, name: e.display_name, lens_db_slug: e.slug },
        answers: { first_model: (mountsP.get(e.url)?.mounts ?? []).map(canonicalSystem), second_model: (mountsS.get(e.url)?.mounts ?? []).map(canonicalSystem) },
        catalogue_rows_from_same_line: evidence,
      }, null, 1);
      const out = await call(SECOND_MODEL, TIEBREAK_SYSTEM, prompt, tiebreakSchema(systems));
      const rec = { url: e.url, model: SECOND_MODEL, ...out, system: out.system ? canonicalSystem(out.system) : null, evidence: [...new Set(evidence.map((r) => r.system))] };
      appendFileSync(FILES.tiebreak, JSON.stringify(rec) + "\n");
      tiebreaks.set(e.url, rec);
    });
    console.log(`tiebreak: done ${tb.done - tb.failed}, failed ${tb.failed}`);

    const toDescribe = todo.filter((e) => !described.has(e.url) && primary.has(e.url) && second.has(e.url));
    console.log(`describe: writing ${toDescribe.length} with ${MODEL}`);
    const r = await pool(toDescribe, async (e) => {
      const rec = finalRecord(e);
      if (rec.status === "unknown") return;
      const facts = Object.fromEntries(Object.entries(rec.fields).filter(([, v]) => v.state === "agreed").map(([k, v]) => [k, v.value]));
      const out = await call(MODEL, DESCRIBE_SYSTEM, JSON.stringify({ name: nameWithMount(e.display_name, slugMountOf(e.slug)), special_edition: !!e.is_edition, facts }, null, 1), Description);
      const description = out.description.replace(/\s*\u2014\s*/g, ", ").trim();
      appendFileSync(FILES.describe, JSON.stringify({ url: e.url, model: MODEL, description }) + "\n");
      described.set(e.url, { description });
    });
    console.log(`describe: done ${r.done - r.failed}, failed ${r.failed}`);
  }

  // Outputs
  const out = [];
  for (const e of missing) {
    const p = primary.get(e.url);
    const s = second.get(e.url);
    if (!p || !s) continue;
    const rec = finalRecord(e);
    out.push({
      url: e.url, kind: e.kind, name: nameWithMount(e.display_name, slugMountOf(e.slug)), slug: e.slug, is_edition: !!e.is_edition,
      related: e.ref_id ? { id: e.ref_id, name: e.ref_name, verdict: e.verdict } : null,
      status: rec.status, missing_bar: rec.missing_bar, disputed: rec.disputed,
      identity: { primary: p.identity_note, second: s.identity_note },
      description: described.get(e.url)?.description ?? null,
      fields: rec.fields,
    });
  }
  writeFileSync(resolve(DIR, "enriched.json"), JSON.stringify(out, null, 1));
  const count = {};
  for (const r of out) count[`${r.kind}:${r.status}`] = (count[`${r.kind}:${r.status}`] ?? 0) + 1;
  const agreement = {};
  for (const r of out) for (const [k, v] of Object.entries(r.fields)) {
    agreement[k] ??= { agreed: 0, disputed: 0, single: 0, unknown: 0 };
    agreement[k][v.state]++;
  }
  const row = (r) => `| ${r.kind} | ${r.name} | ${r.status} | ${r.missing_bar.join(", ")} | ${r.disputed.join(", ")} |`;
  const md = [
    `# Enriched lens-db.com gaps`, ``,
    `Drafted by ${MODEL} and ${SECOND_MODEL} independently; a value is kept only where both agree.`, ``,
    "```", JSON.stringify(count, null, 2), "```", ``,
    `## Field agreement`, ``, `| field | agreed | disputed | one model only | neither |`, `|---|---|---|---|---|`,
    ...Object.entries(agreement).map(([k, v]) => `| ${k} | ${v.agreed} | ${v.disputed} | ${v.single} | ${v.unknown} |`), ``,
    `## Needs review`, ``, `| kind | name | status | minimum-bar gaps | disputed |`, `|---|---|---|---|---|`,
    ...out.filter((r) => r.status !== "ready").map(row), ``,
    `## Ready`, ``, `| kind | name | status | minimum-bar gaps | disputed |`, `|---|---|---|---|---|`,
    ...out.filter((r) => r.status === "ready").map(row),
  ].join("\n");
  writeFileSync(resolve(DIR, "enrich-report.md"), md);
  console.log(JSON.stringify(count, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
