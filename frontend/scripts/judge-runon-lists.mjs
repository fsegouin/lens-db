/**
 * Give the flattened bullet lists their line breaks back.
 *
 * A press release's feature list arrived from lens-db.com as one paragraph.
 * The markup that separated the items was dropped and nothing was put in its
 * place, so the Noct's page ends with 1,600 characters that read
 *
 *   "...in Nikon history The extremely shallow depth of field and large and
 *   beautiful bokeh possible only with a maximum aperture of f/0.95 Outstanding
 *   resolution along the focal plane..."
 *
 * where each capital is the start of a bullet that no longer exists. There is
 * no punctuation to break on, which is why src/lib/format-description.ts leaves
 * these whole: it splits a long block at sentence ends, and a list like this
 * has none.
 *
 * Finding the item boundaries is reading comprehension, not pattern matching —
 * "history The extremely" is a boundary and "Nikon Z mount system's optical
 * performance" is not, and the difference is meaning. So this asks a model, and
 * bounds what it may answer with.
 *
 * What it may answer with is where each item starts, quoted from the text. A
 * phrase is kept only when it appears in the stored description exactly once,
 * so a paraphrase, an invented item or an ambiguous fragment is dropped rather
 * than written, and the apply step can only ever insert a blank line at a
 * position the description itself supplies. A blank line is what the renderer
 * already reads as an author's paragraph break, so the items then render one
 * to a paragraph with no change to the renderer.
 *
 * The model is shown the paragraph as the page renders it rather than the
 * stored text, since the run-on is a property of the rendering. Those two
 * differ (footnote markers are dropped on the way), which is the other reason
 * the answer is a phrase to look up rather than a rewritten paragraph.
 *
 * Usage (from frontend/):
 *   node --env-file=.env.local scripts/judge-runon-lists.mjs               # ask, write JSONL
 *   node --env-file=.env.local scripts/judge-runon-lists.mjs --limit 20    # a taste
 *
 * Resumable: keyed table:id, and ids already in the output are skipped.
 *
 * Apply the answers with scripts/apply-runon-lists.mjs, which reports first.
 *
 * Requires DATABASE_URL and AI_GATEWAY_API_KEY (both in .env.local).
 */
import { generateText, Output } from "ai";
import { z } from "zod";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSql } from "./lib/db.mjs";
import { formatDescription } from "../src/lib/format-description.ts";

if (!process.env.AI_GATEWAY_API_KEY) {
  console.error("AI_GATEWAY_API_KEY is not set");
  process.exit(1);
}

const args = process.argv.slice(2);
const argVal = (flag, dflt) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : dflt);
const MODEL = argVal("--model", "google/gemini-3.8-flash");
const CONCURRENCY = parseInt(argVal("--concurrency", "4"), 10);
const LIMIT = parseInt(argVal("--limit", "0"), 10);
const FORCE = args.includes("--force");
const today = new Date().toISOString().slice(0, 10);
const OUT = resolve(argVal("--out", `scripts/runon-lists.${today}.jsonl`));

/** A paragraph this long with this few sentence ends is a list, not prose. */
const MIN_WORDS = 80;
const WORDS_PER_SENTENCE = 60;

// The answer is where the items start, not the text itself. The model is shown
// the paragraph as the page renders it, which is not byte-for-byte the stored
// description (footnote markers are dropped on the way), so a rewritten
// paragraph could not be put back. A starting phrase can be found in either.
const AnswerSchema = z.object({
  s: z
    .array(z.string())
    .describe("the first four or five words of each list item after the first, copied exactly"),
});

function prompt(paragraph) {
  return `The text below is a camera or lens press release's feature list. It was a bulleted list, and the bullets were lost when it was imported, so every item now runs straight into the next with no punctuation between them.

Return s: the first four or five words of each item AFTER the first one, copied exactly as they appear. Those are the points where a new bullet began.

Rules you must not break:
- Copy the words exactly, including capitals and punctuation. Do not reword or summarise.
- Each phrase must appear in the text exactly once, so take enough words to be unambiguous.
- Give them in the order they appear.
- A capital letter inside an item ("Nikon", "ARNEO Coat", "L-Fn") is not the start of an item.
- If this is ordinary prose rather than a list, return an empty array.

${paragraph}`;
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

/** The run-on paragraphs of a description, as the page renders them. */
export function runOnParagraphs(description) {
  return formatDescription(description).filter((p) => {
    const words = p.split(/\s+/).length;
    const enders = (p.match(/[.!?](\s|$)/g) ?? []).length;
    return words >= MIN_WORDS && words / Math.max(enders, 1) >= WORDS_PER_SENTENCE;
  });
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

try {
  const targets = [];
  for (const table of ["lenses", "cameras"]) {
    for (const r of await sql.unsafe(
      `SELECT id, slug, description FROM ${table}
       WHERE description IS NOT NULL AND description <> '' ORDER BY id`
    )) {
      if (done.has(`${table}:${r.id}`)) continue;
      const paragraphs = runOnParagraphs(r.description);
      if (paragraphs.length)
        targets.push({ table, id: r.id, slug: r.slug, description: r.description, paragraphs });
    }
  }
  const todo = LIMIT ? targets.slice(0, LIMIT) : targets;
  console.log(`${targets.length} descriptions hold a run-on list; ${todo.length} to ask (${done.size} already in ${OUT})\n`);

  let asked = 0;
  const tally = { broken: 0, unchanged: 0, rejected: 0 };

  await mapLimit(todo, CONCURRENCY, async (row) => {
    const starts = [];
    for (const paragraph of row.paragraphs) {
      let phrases;
      try {
        const { output, usage: u } = await generateText({
          model: MODEL,
          output: Output.object({ schema: AnswerSchema }),
          prompt: prompt(paragraph),
          temperature: 0,
          timeout: 180_000,
          providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
        });
        usage.input += u?.inputTokens ?? 0;
        usage.output += u?.outputTokens ?? 0;
        usage.calls += 1;
        phrases = output?.s;
      } catch (err) {
        usage.failed += 1;
        console.error(`\n  ${row.table}/${row.slug} failed: ${err?.message ?? err}`);
        continue;
      }
      if (!Array.isArray(phrases)) {
        tally.rejected += 1;
        continue;
      }
      if (!phrases.length) {
        tally.unchanged += 1;
        continue;
      }
      // A phrase is usable only when it is quoted from the description exactly
      // once. That is what stops a paraphrase, a hallucinated item or an
      // ambiguous fragment from ever reaching the apply step. Whitespace is
      // normalised on both sides because the rendered paragraph reflowed it.
      const flat = (s) => s.replace(/\s+/g, " ").trim();
      const haystack = flat(row.description);
      const usable = [];
      for (const phrase of phrases) {
        if (typeof phrase !== "string" || flat(phrase).length < 8) continue;
        const needle = flat(phrase);
        const first = haystack.indexOf(needle);
        if (first === -1 || haystack.indexOf(needle, first + 1) !== -1) continue;
        usable.push({ phrase: needle, at: first });
      }
      if (usable.length < phrases.length) tally.rejected += phrases.length - usable.length;
      if (!usable.length) continue;
      tally.broken += 1;
      starts.push(...usable);
    }
    if (starts.length) {
      starts.sort((a, b) => a.at - b.at);
      appendFileSync(
        OUT,
        JSON.stringify({
          table: row.table,
          id: row.id,
          slug: row.slug,
          starts: starts.map((s) => s.phrase),
          model: MODEL,
        }) + "\n"
      );
    }
    asked += 1;
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
