/**
 * Correct bogus release years with an LLM.
 *
 * Several import batches (a March 2026 DPReview scrape and the DPReview
 * watcher) stamped lenses with the year they were *seen* rather than the
 * year they were *announced*: "Carl Zeiss Biogon T* 2/35 ZM" (2008) is
 * tagged 2026, and so are ~120 others. This script asks the model for the
 * real announcement year and applies confident answers.
 *
 * Usage (from frontend/):
 *   node scripts/fix-lens-years.mjs                    # dry run: year >= 2026
 *   node scripts/fix-lens-years.mjs --min-year 2025    # widen the net
 *   node scripts/fix-lens-years.mjs --apply            # write high-confidence fixes
 *   node scripts/fix-lens-years.mjs --apply --include-medium
 *   node scripts/fix-lens-years.mjs --model google/gemini-3.1-pro
 *
 * Rules:
 *   - A lens whose specs.Announced already names the same year is trusted
 *     and skipped (those came from lens-db.com pages, not from a guess).
 *   - Only "high" confidence answers are written (medium with the flag);
 *     the rest are printed for manual review.
 *   - A proposed year must be 1900..current year and differ from the stored one.
 *   - Every write gets a patrolled revision so it shows in history and can
 *     be reverted from the admin UI.
 *
 * Requires DATABASE_URL and AI_GATEWAY_API_KEY (both in .env.local).
 */

import { generateText, Output } from "ai";
import { z } from "zod";
import { createSql } from "./lib/db.mjs";
import { readFileSync, existsSync } from "fs";
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
if (!process.env.AI_GATEWAY_API_KEY) {
  console.error("AI_GATEWAY_API_KEY is not set");
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const includeMedium = args.includes("--include-medium");
const argVal = (flag, dflt) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : dflt);
const minYear = parseInt(argVal("--min-year", "2026"), 10);
const model = argVal("--model", "google/gemini-3.1-flash-lite");
// Proposed years >= HORIZON are never auto-applied (see `writable` below).
const HORIZON = parseInt(argVal("--horizon", "2024"), 10);
const BATCH = 15;
const THIS_YEAR = new Date().getUTCFullYear();

const ResultSchema = z.object({
  lenses: z.array(
    z.object({
      id: z.number().describe("The lens id exactly as given"),
      year: z.number().nullable().describe(
        "Four-digit year the lens was ANNOUNCED (first public announcement, not shipping, not a later re-release). null if you do not know.",
      ),
      confidence: z.enum(["high", "medium", "low"]).describe(
        "high: you are certain of the announcement year for this exact model. medium: fairly sure within a year. low: guessing or the model is ambiguous.",
      ),
      reasoning: z.string().describe("One short sentence: what the lens is and how you know the year"),
    }),
  ),
});

const sql = createSql();

try {
  const rows = await sql`
    select id, name, brand, year_introduced, specs->>'Announced' as announced,
           left(coalesce(description, ''), 200) as description, url,
           (select s.name from systems s where s.id = lenses.system_id) as system
    from lenses
    where merged_into_id is null and year_introduced >= ${minYear}
    order by name`;

  // Trusted: the stored year is corroborated by the announcement spec, the
  // lens name, or the source URL (lens-db.com slugs carry the year).
  const trusted = [];
  const targets = [];
  for (const r of rows) {
    const y = String(r.year_introduced);
    const announcedYear = (r.announced || "").match(/\b(19|20)\d{2}\b/)?.[0];
    if (announcedYear === y || r.name.includes(y) || (r.url || "").includes(`-${y}`)) trusted.push(r);
    else targets.push(r);
  }

  console.log(`${apply ? "APPLY" : "DRY RUN"} — model ${model} — ${rows.length} lenses with year >= ${minYear}`);
  console.log(`  ${trusted.length} trusted (specs.Announced matches), ${targets.length} to check\n`);

  const findings = [];
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    const lines = batch
      .map((r) => {
        const bits = [`id=${r.id}`, `name="${r.name}"`];
        if (r.brand) bits.push(`brand=${r.brand}`);
        if (r.system) bits.push(`mount=${r.system}`);
        if (r.description) bits.push(`description="${r.description.replace(/\s+/g, " ")}"`);
        return "- " + bits.join(" | ");
      })
      .join("\n");
    const prompt = `You are a photographic lens historian. For each lens below, give the year it was first ANNOUNCED by its manufacturer.

Context: these records were imported with the year they were added to a database (${minYear}+), which is often wrong. Many are older products — e.g. the Zeiss ZM rangefinder line dates from 2005–2008, Voigtländer Color-Skopar SL II from 2007–2008. Some really are ${THIS_YEAR} announcements. Do not assume either way; use what you actually know about the specific model, its generation ("II", "ASPH", "SL II"), and its mount.

Return every id exactly once. Use null with low confidence when you do not know.

Lenses:
${lines}`;

    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: ResultSchema }),
        prompt,
        timeout: 90_000,
      });
      const byId = new Map((output?.lenses ?? []).map((l) => [l.id, l]));
      for (const r of batch) {
        const a = byId.get(r.id);
        findings.push({
          row: r,
          proposed: a?.year ?? null,
          confidence: a?.confidence ?? "low",
          reasoning: a?.reasoning ?? "(no answer)",
        });
      }
    } catch (err) {
      console.error(`LLM batch ${Math.floor(i / BATCH) + 1} failed:`, err?.message ?? err);
      for (const r of batch) findings.push({ row: r, proposed: null, confidence: "low", reasoning: "(batch failed)" });
    }
    process.stdout.write(`  checked ${Math.min(i + BATCH, targets.length)}/${targets.length}\r`);
  }
  console.log("\n");

  const valid = (f) =>
    f.proposed != null && Number.isInteger(f.proposed) && f.proposed >= 1900 && f.proposed <= THIS_YEAR && f.proposed !== f.row.year_introduced;
  // The model's knowledge stops somewhere in the recent past: in testing it
  // called several real 2025/2026 products "non-existent" and dated others
  // "2024" with high confidence. Proposals at or past the horizon are
  // therefore never auto-applied — they go to the review list.
  const writable = (f) =>
    valid(f) && f.proposed < HORIZON && (f.confidence === "high" || (includeMedium && f.confidence === "medium"));

  const groups = {
    "WILL CHANGE": findings.filter(writable),
    "REVIEW (medium/low, or unknown)": findings.filter((f) => !writable(f) && !(f.proposed === f.row.year_introduced && f.confidence !== "low")),
    "CONFIRMED CURRENT YEAR": findings.filter((f) => f.proposed === f.row.year_introduced && f.confidence !== "low"),
  };
  for (const [title, list] of Object.entries(groups)) {
    console.log(`── ${title} (${list.length})`);
    for (const f of list) {
      console.log(`  #${f.row.id}  ${f.row.name}\n      ${f.row.year_introduced} → ${f.proposed ?? "?"}  [${f.confidence}]  ${f.reasoning}`);
    }
    console.log();
  }

  if (!apply) {
    console.log(`Dry run. ${groups["WILL CHANGE"].length} would change; re-run with --apply to write.`);
  } else {
    let written = 0;
    for (const f of groups["WILL CHANGE"]) {
      const id = f.row.id;
      await sql`update lenses set year_introduced = ${f.proposed} where id = ${id}`;
      // Patrolled revision mirroring lib/revisions.ts (camelCase snapshot
      // minus engagement fields) so the change is visible and revertable.
      const [row] = await sql`select * from lenses where id = ${id}`;
      const snapshot = {};
      for (const [k, v] of Object.entries(row)) {
        const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (!["viewCount", "averageRating", "ratingCount", "submittedByIp"].includes(camel)) snapshot[camel] = v;
      }
      const [{ next }] = await sql`select coalesce(max(revision_number), 0) + 1 as next from revisions where entity_type = 'lens' and entity_id = ${id}`;
      await sql`insert into revisions (entity_type, entity_id, revision_number, data, summary, changed_fields, is_patrolled)
                values ('lens', ${id}, ${next}, ${JSON.stringify(snapshot)}::jsonb,
                        ${`Release year ${f.row.year_introduced} → ${f.proposed} (LLM ${f.confidence} confidence: ${f.reasoning})`},
                        ${JSON.stringify(["yearIntroduced"])}::jsonb, true)`;
      written += 1;
    }
    console.log(`Wrote ${written} corrections with revisions. Lens list cache refreshes within the hour; detail pages within 7 days.`);
  }
} finally {
  await sql.end();
}
