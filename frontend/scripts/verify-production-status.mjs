/**
 * Second opinion, with a web search, on the production-status answers that
 * were least safe to trust from memory alone:
 *
 *   held     lenses stored "Discontinued" (from the lens-db.com import) where
 *            the unaided model said "still in production"; the apply step
 *            refused to flip them on the model's word.
 *   flipped  lenses the apply step moved from "In production" to
 *            "Discontinued" on the unaided model's word.
 *
 * Each lens gets one grounded call (Gemini with Google Search) that must
 * name a source URL. Answers are appended to a JSONL as they land and the
 * script is resumable. Dry run prints a crosstab; --apply writes only where
 * the searched answer disagrees with what is stored now, with the source in
 * the revision summary. Nothing is revalidated.
 *
 * Usage (from frontend/):
 *   node scripts/verify-production-status.mjs --answers scripts/production-dates.2026-09-07.jsonl
 *   node scripts/verify-production-status.mjs --answers ... --group held
 *   node scripts/verify-production-status.mjs --answers ... --limit 10
 *   node scripts/verify-production-status.mjs --answers ... --apply
 *
 * Cost: Google grounding is billed per grounded request (about $14 per
 * 1,000 on gemini-3.8-flash), so the two groups together are a few dollars.
 *
 * Requires DATABASE_URL and AI_GATEWAY_API_KEY (both in .env.local).
 */

import { generateText } from "ai";
import { createSql } from "./lib/db.mjs";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
const argVal = (flag, dflt) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : dflt);
const APPLY = args.includes("--apply");
const GROUP = argVal("--group", "all");
const LIMIT = parseInt(argVal("--limit", "0"), 10);
const CONCURRENCY = parseInt(argVal("--concurrency", "3"), 10);
const MODEL = argVal("--model", "google/gemini-3.8-flash");
const ANSWERS = argVal("--answers", "");
const today = new Date().toISOString().slice(0, 10);
const OUT = resolve(argVal("--out", `scripts/production-status-verified.${today}.jsonl`));
const STATUS_LABEL = { c: "In production", d: "Discontinued" };

if (!ANSWERS || !existsSync(ANSWERS)) {
  console.error("--answers <jsonl from judge-production-dates.mjs> is required");
  process.exit(1);
}
const unaided = new Map();
for (const line of readFileSync(ANSWERS, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const j = JSON.parse(line);
  if (j.table === "lenses") unaided.set(j.id, j);
}

const done = new Map();
if (existsSync(OUT)) {
  for (const line of readFileSync(OUT, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      done.set(j.id, j);
    } catch {}
  }
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

function prompt(r) {
  const full = [r.brand, r.name].filter(Boolean).join(" ");
  return `Today is ${today}. Is the photographic lens "${full}"${r.mount ? ` (${r.mount} mount)` : ""} still in production, or has its manufacturer discontinued it? Search the manufacturer's own product pages first, then major retailers (B&H, Adorama, Map Camera). "Discontinued" means the maker no longer produces it, even if stock remains; a newer version replacing it counts. Reply with one line of JSON only:
{"s":"c"|"d"|"u","d":<four-digit year discontinued, or null>,"why":"<one sentence naming the evidence>","url":"<the single best source URL>"}`;
}

async function search(r) {
  const res = await generateText({
    model: MODEL,
    prompt: prompt(r),
    temperature: 0,
    tools: { google_search: { type: "provider", id: "google.google_search", name: "google_search", args: {} } },
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    timeout: 120_000,
  });
  const text = res.text.replace(/```json|```/g, "").trim();
  const m = text.match(/\{[\s\S]*\}/);
  const j = m ? JSON.parse(m[0]) : { s: "u", d: null, why: "(unparseable answer)", url: null };
  const queries = res.providerMetadata?.vertex?.groundingMetadata?.webSearchQueries ?? res.providerMetadata?.google?.groundingMetadata?.webSearchQueries ?? [];
  return { s: ["c", "d", "u"].includes(j.s) ? j.s : "u", d: Number.isInteger(j.d) ? j.d : null, why: String(j.why ?? "").slice(0, 300), url: j.url ?? null, queries: queries.length };
}

const sql = createSql();
try {
  // held: stored Discontinued, unaided said current, no note.
  const heldRows = await sql`
    select l.id, l.name, l.brand, l.production_status, l.year_discontinued, s.name as mount
    from lenses l left join systems s on s.id = l.system_id
    where l.merged_into_id is null and l.production_status = 'Discontinued'`;
  const held = heldRows.filter((r) => unaided.get(r.id)?.s === "c" && !unaided.get(r.id)?.n).map((r) => ({ ...r, group: "held" }));

  // flipped: today's apply moved In production -> Discontinued.
  const flippedRows = await sql`
    select l.id, l.name, l.brand, l.production_status, l.year_discontinued, s.name as mount
    from lenses l left join systems s on s.id = l.system_id
    where l.merged_into_id is null and l.id in (
      select entity_id from revisions
      where entity_type = 'lens' and created_at::date = ${today}::date
        and summary like 'Production status In production → Discontinued%')`;
  const flipped = flippedRows.map((r) => ({ ...r, group: "flipped" }));

  let targets = [...(GROUP === "flipped" ? [] : held), ...(GROUP === "held" ? [] : flipped)];
  const todo = targets.filter((r) => !done.has(r.id));
  const asking = LIMIT ? todo.slice(0, LIMIT) : todo;
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — held ${held.length}, flipped ${flipped.length}; ${done.size} already answered, asking ${asking.length}\n`);

  let n = 0;
  await mapLimit(asking, CONCURRENCY, async (r) => {
    let a;
    try {
      a = await search(r);
    } catch (err) {
      a = { s: "u", d: null, why: `(error: ${String(err?.message ?? err).slice(0, 120)})`, url: null, queries: 0 };
    }
    const rec = { id: r.id, name: r.name, group: r.group, stored: r.production_status, unaided: unaided.get(r.id)?.s ?? null, ...a, model: MODEL };
    appendFileSync(OUT, JSON.stringify(rec) + "\n");
    done.set(r.id, rec);
    n += 1;
    process.stdout.write(`  ${n}/${asking.length}\r`);
  });
  console.log();

  // Crosstab and the disagreements.
  const tally = {};
  const changes = [];
  for (const r of targets) {
    const v = done.get(r.id);
    if (!v) continue;
    const key = `${r.group}: stored ${r.production_status} → searched ${v.s}`;
    tally[key] = (tally[key] ?? 0) + 1;
    if (v.s === "c" && r.production_status === "Discontinued") changes.push({ r, v, to: "In production" });
    else if (v.s === "d" && v.d && r.year_discontinued == null) changes.push({ r, v, to: null, year: v.d });
  }
  for (const [k, c] of Object.entries(tally).sort()) console.log(`  ${k}: ${c}`);
  console.log(`\n── would change (${changes.length})`);
  for (const c of changes) {
    console.log(`  #${c.r.id} ${c.r.name} [${c.r.group}]: ${c.to ? `→ ${c.to}` : `year discontinued ${c.year}`}\n      ${c.v.why}\n      ${c.v.url ?? "(no url)"}`);
  }

  if (!APPLY) {
    console.log(`\nDry run. Re-run with --apply to write ${changes.length} rows. Answers in ${OUT}`);
  } else {
    let written = 0;
    for (const c of changes) {
      const id = c.r.id;
      const fields = [];
      if (c.to) {
        // A lens that is still made has no discontinued year; the unaided
        // pass may have filled one alongside the status being undone here.
        await sql`update lenses set production_status = ${c.to}, year_discontinued = null where id = ${id} and name = ${c.r.name}`;
        fields.push("productionStatus");
        if (c.r.year_discontinued != null) fields.push("yearDiscontinued");
      } else {
        await sql`update lenses set year_discontinued = ${c.year} where id = ${id} and name = ${c.r.name}`;
        fields.push("yearDiscontinued");
      }
      const [row] = await sql`select * from lenses where id = ${id}`;
      const snapshot = {};
      for (const [k, v] of Object.entries(row)) {
        const camel = k.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
        if (!["viewCount", "averageRating", "ratingCount", "submittedByIp"].includes(camel)) snapshot[camel] = v;
      }
      const [{ next }] = await sql`select coalesce(max(revision_number), 0) + 1 as next from revisions where entity_type = 'lens' and entity_id = ${id}`;
      const summary = c.to
        ? `Production status ${c.r.production_status} → ${c.to}${c.r.year_discontinued != null ? `, year discontinued ${c.r.year_discontinued} cleared` : ""} (${MODEL} with web search, ${today}: ${c.v.why} ${c.v.url ?? ""})`
        : `Year discontinued ${c.year} (${MODEL} with web search, ${today}: ${c.v.why} ${c.v.url ?? ""})`;
      await sql`insert into revisions (entity_type, entity_id, revision_number, data, summary, changed_fields, is_patrolled, patrolled_at)
                values ('lens', ${id}, ${next}, ${JSON.stringify(snapshot)}::jsonb, ${summary.slice(0, 500)}, ${JSON.stringify(fields)}::jsonb, true, now())`;
      written += 1;
    }
    console.log(`\nWrote ${written} rows with revisions. Not revalidated on purpose.`);
  }
} finally {
  await sql.end();
}
