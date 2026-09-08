/**
 * Ask a model where the word boundaries are in the runs that lost every space.
 *
 * scripts/split-glued-descriptions.mjs segments a run by counting how common
 * each candidate word is in the corpus. That works where the pieces are common
 * and the whole is not, and it has taken the runs it can prove. What it cannot
 * do is tell a long real word from a long joined one, because their statistics
 * are the same shape: "apochromatic" appears 88 times and "aberrationand" 66,
 * and a shortest-path over word frequencies happily splits both. It currently
 * refuses 1,075 runs, most of them ordinary words like "interchangeable", and
 * offers to split 576, of which a good half are words too.
 *
 * Nothing in the data separates them. Knowing that "apochromatic" is a word of
 * English and "aberrationand" is two is knowledge about the language, so this
 * asks something that has it.
 *
 * The answer is checked rather than trusted. A reply is accepted only when its
 * letters are exactly the letters it was given, so the model may insert spaces
 * and do nothing else: it cannot correct a spelling, expand an abbreviation or
 * invent a word, and a reply that tries is dropped. That bound is what makes an
 * unreviewed pass over 1,651 runs safe, and it is checked again per row before
 * anything is written.
 *
 * Distinct runs are asked about, not rows: "theflareandghoststhat" appears in
 * four descriptions and is one question. That is 1,651 questions rather than
 * the 1,900 rows holding them.
 *
 * Usage (from frontend/):
 *   node --env-file=.env.local scripts/judge-glued-runs.mjs                  # ask, write JSONL
 *   node --env-file=.env.local scripts/judge-glued-runs.mjs --limit 100      # a taste
 *   node --env-file=.env.local scripts/judge-glued-runs.mjs --min-length 14
 *
 * Resumable: every batch is appended as it lands, keyed by the run itself, and
 * runs already in the output file are skipped on rerun. --force re-asks them.
 *
 * Apply the answers with scripts/apply-glued-runs.mjs, which reports first.
 *
 * Requires DATABASE_URL and AI_GATEWAY_API_KEY (both in .env.local).
 */
import { generateText, Output } from "ai";
import { z } from "zod";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSql } from "./lib/db.mjs";

if (!process.env.AI_GATEWAY_API_KEY) {
  console.error("AI_GATEWAY_API_KEY is not set");
  process.exit(1);
}

const args = process.argv.slice(2);
const argVal = (flag, dflt) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : dflt);
const MODEL = argVal("--model", "google/gemini-3.8-flash");
const BATCH = parseInt(argVal("--batch", "40"), 10);
const CONCURRENCY = parseInt(argVal("--concurrency", "4"), 10);
const LIMIT = parseInt(argVal("--limit", "0"), 10);
const MIN_LENGTH = parseInt(argVal("--min-length", "12"), 10);
const FORCE = args.includes("--force");
const today = new Date().toISOString().slice(0, 10);
const OUT = resolve(argVal("--out", `scripts/glued-runs.${today}.jsonl`));

// One-letter keys on purpose: the schema is echoed in every answer.
const AnswerSchema = z.object({
  r: z.array(
    z.object({
      i: z.number().describe("the number of the run, exactly as given"),
      w: z
        .string()
        .describe("the same letters with spaces put where the word breaks belong, or unchanged if it is already one word"),
    }),
  ),
});

function prompt(batch) {
  const lines = batch.map((run, i) => `${i + 1} | ${run}`).join("\n");
  return `These strings come from camera and lens descriptions where an importing bug deleted spaces. Some are a single ordinary word that was never damaged ("interchangeable", "apochromatic", "autofocusing", "spherochromatism"); others are several words run together ("aberrationand" = "aberration and", "theflareandghoststhat" = "the flare and ghosts that").

For each one, return w: the SAME letters, with a space wherever a word break belongs. Return it unchanged when it is already one word. This is photographic and optical writing, so compound technical terms are usually real words.

Rules you must not break:
- Never add, remove or change a letter, and never change the case of one. Only spaces.
- Never split a real word, however long or technical.
- A few have lost their first letter to a different bug ("tabilization", "hotographers"). Return those unchanged; do not restore the letter.
- A leading capital belongs to the first word: "Noflaresarise" is "No flares arise", not "Nof lares arise".
- Leading capitals may be an abbreviation that keeps them: "MTFperformance" is "MTF performance".

Return every number exactly once, nothing else.

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
    })
  );
  return out;
}

const done = new Set();
if (existsSync(OUT) && !FORCE) {
  for (const line of readFileSync(OUT, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      done.add(JSON.parse(line).run);
    } catch {}
  }
}

const sql = createSql();
const usage = { input: 0, output: 0, calls: 0, failed: 0 };

try {
  const rows = [];
  for (const table of ["lenses", "cameras"]) {
    for (const r of await sql.unsafe(
      `SELECT description FROM ${table} WHERE description IS NOT NULL AND description <> ''`
    )) {
      rows.push(r.description);
    }
  }

  // Every distinct word long enough to hide a break, counted so the report can
  // lead with the ones that appear most.
  //
  // The question is the whole word, never a slice of one. Asked about the bare
  // lowercase run, the model read the "oflaresarise" of "Noflaresarise" as "of
  // lares arise", which puts the sentence back as "Nof lares arise"; given the
  // capital it reads "No flares arise". Asked about "Fperformance" it could not
  // see that the letters before it were "MT", and answered "F performance",
  // which would have spelled the measurement "MT F performance".
  const counts = new Map();
  for (const description of rows) {
    for (const m of description.matchAll(/[A-Za-z]+/g)) {
      if (!new RegExp(`[a-z]{${MIN_LENGTH},}`).test(m[0])) continue;
      counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
    }
  }
  const runs = [...counts.keys()].filter((r) => !done.has(r)).sort((a, b) => counts.get(b) - counts.get(a));
  const todo = LIMIT ? runs.slice(0, LIMIT) : runs;
  console.log(
    `${counts.size} distinct runs of ${MIN_LENGTH}+ letters in ${rows.length} descriptions; ` +
      `${todo.length} to ask (${done.size} already in ${OUT})\n`
  );

  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));

  let asked = 0;
  const tally = { split: 0, whole: 0, rejected: 0, missing: 0 };

  await mapLimit(batches, CONCURRENCY, async (batch) => {
    let answers;
    try {
      const { output, usage: u } = await generateText({
        model: MODEL,
        output: Output.object({ schema: AnswerSchema }),
        prompt: prompt(batch),
        temperature: 0,
        timeout: 120_000,
        providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      });
      usage.input += u?.inputTokens ?? 0;
      usage.output += u?.outputTokens ?? 0;
      usage.calls += 1;
      answers = new Map((output?.r ?? []).map((x) => [x.i, x.w]));
    } catch (err) {
      usage.failed += 1;
      console.error(`\n  batch failed (${batch[0]}..): ${err?.message ?? err}`);
      return;
    }

    const lines = [];
    for (const [i, run] of batch.entries()) {
      const answer = answers.get(i + 1);
      if (typeof answer !== "string") {
        tally.missing += 1;
        continue;
      }
      // The whole safety of this pass: the reply must be the same letters, so
      // a model that corrected a spelling or invented a word is discarded.
      if (answer.replace(/\s+/g, "") !== run) {
        tally.rejected += 1;
        lines.push(JSON.stringify({ run, count: counts.get(run), rejected: answer, model: MODEL }));
        continue;
      }
      const pieces = answer.trim().split(/\s+/);
      if (pieces.length > 1) tally.split += 1;
      else tally.whole += 1;
      lines.push(JSON.stringify({ run, count: counts.get(run), pieces, model: MODEL }));
    }
    if (lines.length) appendFileSync(OUT, lines.join("\n") + "\n");
    asked += batch.length;
    process.stdout.write(
      `  ${asked}/${todo.length}  ${JSON.stringify(tally)}  tokens in ${usage.input} out ${usage.output}\r`
    );
  });

  const cost = (usage.input * 0.75 + usage.output * 3.75) / 1e6;
  console.log(
    `\n\n${usage.calls} calls (${usage.failed} failed), ${usage.input} input + ${usage.output} output tokens, ` +
      `about $${cost.toFixed(2)} at list price. Wrote ${OUT}`
  );
} finally {
  await sql.end();
}
