/**
 * Ask a model, from its own knowledge only, when each lens and camera body
 * was announced and when it was discontinued. Writes candidates to a JSONL;
 * nothing touches the database. Apply the answers with
 * apply-production-dates.mjs, which gates and records them.
 *
 * Cost is the design constraint. The answer per item is three short fields
 * with one-letter keys and, only when the name is ambiguous, a few words of
 * note; there is no reasoning and no confidence field. The note IS the
 * confidence signal: an answer that needed one goes to review instead of
 * being written. Roughly 20 output tokens an item, so the whole catalogue
 * (about 12,300 rows) is a couple of dollars on a flash-class model.
 *
 * Nothing about the stored year or status is sent, so the model's answer is
 * an independent reading that the apply step can compare against.
 *
 * Thinking is off by default. Measured on 2026-09-07 with gemini-3.8-flash:
 * the default setting spent about 5,500 hidden reasoning tokens a batch of
 * 30, eight times the answer, ten times slower, for the same answers. It is
 * a recall task; --thinking turns it back on if a later model needs it.
 *
 * Usage (from frontend/):
 *   node scripts/judge-production-dates.mjs                       # all live lenses + cameras
 *   node scripts/judge-production-dates.mjs --table cameras
 *   node scripts/judge-production-dates.mjs --limit 60            # a taste
 *   node scripts/judge-production-dates.mjs --only 1234,5678      # specific ids (with --table)
 *   node scripts/judge-production-dates.mjs --model google/gemini-3.8-flash --batch 30 --concurrency 4
 *   node scripts/judge-production-dates.mjs --out scripts/production-dates.2026-09-07.jsonl
 *   node scripts/judge-production-dates.mjs --thinking                # let the model reason (8x the cost)
 *
 * Resumable: every batch is appended as it lands, keyed table:id, and ids
 * already in the output file are skipped on rerun. --force re-asks them.
 *
 * Requires DATABASE_URL and AI_GATEWAY_API_KEY (both in .env.local).
 */

import { generateText, Output } from "ai";
import { z } from "zod";
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
const TABLE = argVal("--table", "all");
const LIMIT = parseInt(argVal("--limit", "0"), 10);
const ONLY = argVal("--only", "")
  .split(",")
  .map((s) => parseInt(s, 10))
  .filter(Number.isInteger);
const MODEL = argVal("--model", "google/gemini-3.8-flash");
const BATCH = parseInt(argVal("--batch", "30"), 10);
const CONCURRENCY = parseInt(argVal("--concurrency", "4"), 10);
const FORCE = args.includes("--force");
const THINKING = args.includes("--thinking");
const today = new Date().toISOString().slice(0, 10);
const OUT = resolve(argVal("--out", `scripts/production-dates.${today}.jsonl`));

if (!["all", "lenses", "cameras"].includes(TABLE)) {
  console.error("--table must be all, lenses or cameras");
  process.exit(1);
}
if (ONLY.length && TABLE === "all") {
  console.error("--only needs --table lenses or --table cameras");
  process.exit(1);
}

// One-letter keys on purpose: the schema is echoed in every answer.
const AnswerSchema = z.object({
  r: z.array(
    z.object({
      i: z.number().describe("id, exactly as given"),
      a: z.number().nullable().describe("year announced, or null if unknown"),
      d: z.number().nullable().describe("year discontinued, or null if unknown or still made"),
      s: z.enum(["c", "d", "u"]).describe("c = still in production, d = discontinued, u = product unknown to you"),
      n: z.string().optional().describe("only if the name is ambiguous or you are unsure: a few words, otherwise omit"),
    }),
  ),
});

const KIND = { lenses: "lens", cameras: "camera body" };

function prompt(table, batch) {
  const lines = batch
    .map((r) => `${r.id} | ${[r.brand, r.name].filter(Boolean).join(" ")}${r.mount ? ` | ${r.mount}` : ""}`)
    .join("\n");
  return `For each photographic ${KIND[table]} below (id | name | mount), from your own knowledge: the year it was announced (a), the year it was discontinued (d), and s = "c" if it is still in production, "d" if discontinued, "u" if you do not know the product. null for a year you do not know. Add n (a few words) only when the name matches several versions or you are unsure; otherwise omit n. Return every id exactly once, nothing else.

${lines}`;
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

const done = new Set();
if (existsSync(OUT) && !FORCE) {
  for (const line of readFileSync(OUT, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      done.add(`${j.table}:${j.id}`);
    } catch {}
  }
}

const sql = createSql();
const usage = { input: 0, output: 0, calls: 0, failed: 0 };

async function loadRows(table) {
  const onlyClause = ONLY.length ? sql`and t.id = any(${ONLY}::int[])` : sql``;
  const rows =
    table === "lenses"
      ? await sql`
          select t.id, t.name, t.brand, s.name as mount
          from lenses t left join systems s on s.id = t.system_id
          where t.merged_into_id is null ${onlyClause}
          order by t.id`
      : await sql`
          select t.id, t.name, null as brand, s.name as mount
          from cameras t left join systems s on s.id = t.system_id
          where t.merged_into_id is null ${onlyClause}
          order by t.id`;
  const todo = rows.filter((r) => !done.has(`${table}:${r.id}`));
  return LIMIT ? todo.slice(0, LIMIT) : todo;
}

async function judgeBatch(table, batch) {
  const { output, usage: u } = await generateText({
    model: MODEL,
    output: Output.object({ schema: AnswerSchema }),
    prompt: prompt(table, batch),
    temperature: 0,
    timeout: 120_000,
    ...(THINKING ? {} : { providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } } }),
  });
  usage.input += u?.inputTokens ?? 0;
  usage.output += u?.outputTokens ?? 0;
  usage.calls += 1;
  return new Map((output?.r ?? []).map((x) => [x.i, x]));
}

try {
  const tables = TABLE === "all" ? ["lenses", "cameras"] : [TABLE];
  for (const table of tables) {
    const rows = await loadRows(table);
    console.log(`${table}: ${rows.length} to ask (${done.size} already in ${OUT})`);
    const batches = [];
    for (let i = 0; i < rows.length; i += BATCH) batches.push(rows.slice(i, i + BATCH));
    let n = 0;
    const tally = { c: 0, d: 0, u: 0, noted: 0, missing: 0 };
    await mapLimit(batches, CONCURRENCY, async (batch) => {
      let byId;
      try {
        byId = await judgeBatch(table, batch);
      } catch (err) {
        usage.failed += 1;
        console.error(`\n  batch failed (${batch[0].id}..${batch.at(-1).id}): ${err?.message ?? err}`);
        return;
      }
      const lines = [];
      for (const r of batch) {
        const a = byId.get(r.id);
        if (!a) {
          tally.missing += 1;
          continue;
        }
        tally[a.s] += 1;
        if (a.n) tally.noted += 1;
        lines.push(
          JSON.stringify({
            table,
            id: r.id,
            name: r.name,
            a: a.a,
            d: a.d,
            s: a.s,
            ...(a.n ? { n: a.n } : {}),
            model: MODEL,
          }),
        );
      }
      if (lines.length) appendFileSync(OUT, lines.join("\n") + "\n");
      n += batch.length;
      process.stdout.write(`  ${n}/${rows.length}  ${JSON.stringify(tally)}  tokens in ${usage.input} out ${usage.output}\r`);
    });
    console.log(`\n  ${table} done: ${JSON.stringify(tally)}`);
  }
  const cost = (usage.input * 0.75 + usage.output * 3.75) / 1e6;
  console.log(
    `\n${usage.calls} calls (${usage.failed} failed), ${usage.input} input + ${usage.output} output tokens, about $${cost.toFixed(2)} at list price. Wrote ${OUT}`,
  );
} finally {
  await sql.end();
}
