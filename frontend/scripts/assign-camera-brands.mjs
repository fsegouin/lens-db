/**
 * Fills cameras.brand.
 *
 * Each camera gets two independent readings: the brand its name visibly
 * starts with, matched against the brands lenses already use, and a model's
 * answer given the name, alias, mount and year. A brand is written only when
 * the two agree, or when the name starts with no known brand and the model is
 * sure of a brand other cameras share. Everything else is a review item for
 * a person, and their choices come back through --manual. The rules live in
 * src/lib/camera-brand.ts.
 *
 * The model's answers are appended to a JSONL file as they arrive, so a rerun
 * asks only about cameras not yet answered. Nothing is written to the database
 * without --apply, and --apply writes only cameras that are decided, each with
 * a patrolled revision. A brand already on a camera is kept unless --manual
 * chose another or --only asked about it again (see brandWrites), so passing
 * an old --manual file again puts its choices back over later form edits.
 *
 * Usage (from frontend/):
 *   node scripts/assign-camera-brands.mjs                       # ask, then report
 *   node scripts/assign-camera-brands.mjs --queue review.json   # also write the review items
 *   node scripts/assign-camera-brands.mjs --manual choices.json # fold in a person's choices
 *   node scripts/assign-camera-brands.mjs --manual choices.json --apply
 *
 * --manual is a JSON object of camera id to brand. Other flags: --model,
 * --batch, --concurrency, --answers <file>, --no-ask (report from the answers
 * already on disk), --only 12,34 (ask about just these cameras, again if they
 * were already answered).
 *
 * Requires DATABASE_URL and AI_GATEWAY_API_KEY (in .env.local).
 */

import { generateText, Output } from "ai";
import { z } from "zod";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPool } from "./lib/db.mjs";
import {
  brandWrites,
  buildVocabulary,
  flagLoneBrands,
  foldBrand,
  leadWord,
  prefixBrand,
  resolveBrand,
} from "../src/lib/camera-brand.ts";

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
const argVal = (flag, dflt) => {
  const i = args.indexOf(flag);
  if (i === -1) return dflt;
  const value = args[i + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
  return value;
};
const MODEL = argVal("--model", "openai/gpt-6.1-sol");
const BATCH = parseInt(argVal("--batch", "25"), 10);
const CONCURRENCY = parseInt(argVal("--concurrency", "4"), 10);
const ANSWERS = resolve(argVal("--answers", "scripts/camera-brands.answers.jsonl"));
const QUEUE = argVal("--queue", null);
const MANUAL = argVal("--manual", null);
const ASK = !args.includes("--no-ask");
const ONLY = new Set(
  argVal("--only", "")
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter(Number.isInteger),
);
const APPLY = args.includes("--apply");
const CHUNK = 200;
// A brand the vocabulary holds on fewer lenses than this is as likely a lens
// line filed as a brand ("Jupiter", "Helios") as a maker, so the model is not
// told to prefer it.
const VOCABULARY_HINT_MIN_LENSES = 5;

const AnswerSchema = z.object({
  r: z.array(
    z.object({
      i: z.number().int().describe("the camera id, as given"),
      b: z.string().describe("the brand"),
      c: z.enum(["high", "medium", "low"]).describe("confidence in the brand"),
      n: z.string().describe("one short clause when confidence is not high, else empty"),
    }),
  ),
});

function prompt(batch, hintBrands) {
  return `You assign each camera body its brand for a camera catalogue.

The brand is the name the camera was sold under: the word a photographer puts before the model.

Rules:
1. When the maker is on the catalogue's brand list below, use that exact spelling. Otherwise use the maker's usual name.
2. A model line that carries the maker's name folds into the maker. Rolleiflex and Rolleicord are Rollei. Nikkormat and Nikonos are Nikon. Leicaflex is Leica. Canonflex is Canon. Fujica and Fujifilm are Fuji. Asahi Pentax, Asahiflex and Honeywell Pentax are Pentax. Yashica-Mat is Yashica.
3. A trade name used across a whole family of cameras is the brand, even when the manufacturer is named differently: Zenit and Zorki, not KMZ. Kiev, not Arsenal. Praktica, not Pentacon or KW. Exakta and Exa, not Ihagee. Edixa, not Wirgin. Contax, not Zeiss Ikon, Yashica or Kyocera.
4. A single model's name is not a brand. Use the manufacturer: KMZ Horizont is KMZ, LOMO Smena is LOMO, Ihagee Paff-Reflex is Ihagee.
5. A name that starts with the factory followed by the brand it was sold under takes the brand it was sold under: "Cosina Vivitar V2000" is Vivitar.
6. Zeiss Ikon cameras are "Zeiss Ikon", never "Carl Zeiss".
7. Old Kodak names put the maker last: "No. 2 Folding Pocket Kodak" is Kodak.

Confidence: "high" when you recognise the camera or its maker without doubt. "medium" when you infer the maker from the shape of the name. "low" when you are guessing.

Catalogue brand list: ${hintBrands.join(", ")}

Cameras, one per line as id | name | also known as | mount | year:
${batch.map((c) => `${c.id} | ${c.name} | ${c.alias ?? ""} | ${c.mount ?? ""} | ${c.year ?? ""}`).join("\n")}

Answer for every id.`;
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

/** Answers on disk, keyed by camera id. A later line for the same id wins. */
function readAnswers() {
  const answers = new Map();
  if (!existsSync(ANSWERS)) return answers;
  for (const line of readFileSync(ANSWERS, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const a = JSON.parse(line);
    answers.set(a.id, a);
  }
  return answers;
}

async function askModel(cameras, hintBrands) {
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY is not set");
  const batches = [];
  for (let i = 0; i < cameras.length; i += BATCH) batches.push(cameras.slice(i, i + BATCH));
  const usage = { input: 0, output: 0, failed: 0, missing: 0 };
  let done = 0;
  await mapLimit(batches, CONCURRENCY, async (batch) => {
    try {
      const { output, usage: u } = await generateText({
        model: MODEL,
        output: Output.object({ schema: AnswerSchema }),
        prompt: prompt(batch, hintBrands),
        timeout: 180_000,
      });
      usage.input += u?.inputTokens ?? 0;
      usage.output += u?.outputTokens ?? 0;
      const byId = new Map((output?.r ?? []).map((x) => [x.i, x]));
      const lines = [];
      for (const c of batch) {
        const a = byId.get(c.id);
        if (!a || !a.b.trim()) {
          usage.missing += 1;
          continue;
        }
        lines.push(
          JSON.stringify({
            id: c.id,
            name: c.name,
            brand: a.b.trim(),
            confidence: a.c,
            ...(a.n ? { note: a.n } : {}),
            model: MODEL,
          }),
        );
      }
      if (lines.length) appendFileSync(ANSWERS, lines.join("\n") + "\n");
    } catch (err) {
      usage.failed += 1;
      console.error(`\n  batch failed (${batch[0].id}..${batch.at(-1).id}): ${err?.message ?? err}`);
    }
    done += batch.length;
    process.stdout.write(`  asked ${done}/${cameras.length}  tokens in ${usage.input} out ${usage.output}\r`);
  });
  console.log(`\n  ${JSON.stringify(usage)}`);
}

/** Review items, grouped so one choice can settle a whole family. */
function buildQueue(decisions) {
  const groups = new Map();
  for (const d of decisions.filter((d) => d.status === "review")) {
    const key = `${leadWord(d.name)}|${foldBrand(d.prefix ?? "")}|${foldBrand(d.brand ?? "")}`;
    if (!groups.has(key)) {
      groups.set(key, { lead: leadWord(d.name), prefix: d.prefix, guess: d.brand, cameras: [] });
    }
    groups.get(key).cameras.push({
      id: d.id,
      name: d.name,
      slug: d.slug,
      alias: d.alias,
      mount: d.mount,
      year: d.year,
      reason: d.reason,
      note: d.note,
    });
  }
  return [...groups.values()].sort((a, b) => b.cameras.length - a.cameras.length);
}

const CAMEL_SKIP = new Set(["viewCount", "averageRating", "ratingCount", "submittedByIp"]);
function snapshot(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (!CAMEL_SKIP.has(camel)) out[camel] = v;
  }
  return out;
}

/** One transaction per chunk: the rows, then a revision of each as it now stands. */
async function writeChunk(client, writes) {
  const ids = writes.map((w) => w.id);
  await client.query("begin");
  try {
    const values = [];
    const params = [];
    for (const w of writes) {
      params.push(w.id, w.name, w.brand);
      const o = params.length - 3;
      values.push(`($${o + 1}::int, $${o + 2}::text, $${o + 3}::text)`);
    }
    const updated = await client.query(
      `update cameras c set brand = v.brand
       from (values ${values.join(",")}) as v(id, name, brand)
       where c.id = v.id and c.name = v.name`,
      params,
    );
    if (updated.rowCount !== writes.length) {
      throw new Error(`expected ${writes.length} rows updated, got ${updated.rowCount} (a name no longer matches)`);
    }

    const { rows: after } = await client.query(`select * from cameras where id = any($1::int[])`, [ids]);
    const afterById = new Map(after.map((r) => [r.id, r]));
    const { rows: nexts } = await client.query(
      `select entity_id, coalesce(max(revision_number), 0) + 1 as next from revisions
       where entity_type = 'camera' and entity_id = any($1::int[]) group by entity_id`,
      [ids],
    );
    const nextById = new Map(nexts.map((r) => [r.entity_id, Number(r.next)]));

    const rows = [];
    const revisionParams = [];
    for (const w of writes) {
      revisionParams.push(
        w.id,
        nextById.get(w.id) ?? 1,
        JSON.stringify(snapshot(afterById.get(w.id))),
        w.before ? `Brand ${w.before} → ${w.brand}` : `Brand recorded: ${w.brand}`,
      );
      const o = revisionParams.length - 4;
      rows.push(`('camera', $${o + 1}, $${o + 2}, $${o + 3}::jsonb, $${o + 4}, '["brand"]'::jsonb, true, now())`);
    }
    await client.query(
      `insert into revisions (entity_type, entity_id, revision_number, data, summary, changed_fields, is_patrolled, patrolled_at)
       values ${rows.join(",")}`,
      revisionParams,
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

const pool = createPool();
try {
  const { rows: cameras } = await pool.query(
    `select c.id, c.name, c.slug, c.alias, c.brand as current, c.year_introduced as year, s.name as mount
     from cameras c left join systems s on s.id = c.system_id
     where c.merged_into_id is null order by c.id`,
  );
  const { rows: brandCounts } = await pool.query(
    `select brand, count(*)::int as n from lenses
     where merged_into_id is null and brand is not null group by brand`,
  );
  const vocabulary = buildVocabulary(brandCounts);
  const hintBrands = brandCounts
    .filter((b) => b.n >= VOCABULARY_HINT_MIN_LENSES)
    .map((b) => vocabulary.get(foldBrand(b.brand)))
    .filter((brand, i, all) => all.indexOf(brand) === i)
    .sort();

  if (ASK) {
    const answered = readAnswers();
    const todo = ONLY.size
      ? cameras.filter((c) => ONLY.has(c.id))
      : cameras.filter((c) => answered.get(c.id)?.name !== c.name);
    console.log(`${cameras.length} cameras, ${todo.length} to ask ${MODEL} (answers in ${ANSWERS})`);
    if (todo.length) await askModel(todo, hintBrands);
  }

  const answers = readAnswers();
  const manual = MANUAL ? JSON.parse(readFileSync(resolve(MANUAL), "utf8")) : {};
  const resolved = cameras.map((c) => {
    const answer = answers.get(c.id);
    const prefix = prefixBrand(c.name, vocabulary);
    return {
      ...c,
      prefix,
      note: answer?.note,
      // An answer given for an earlier name of this camera is not an answer.
      ...resolveBrand(
        { prefix, answer: answer?.name === c.name ? answer : undefined, manual: manual[c.id] },
        vocabulary,
      ),
    };
  });

  const decisions = flagLoneBrands(resolved, vocabulary);

  const tally = {};
  for (const d of decisions) tally[d.status] = (tally[d.status] ?? 0) + 1;
  console.log(`\n${JSON.stringify(tally)}`);

  const queue = buildQueue(decisions);
  console.log(`review: ${queue.reduce((n, g) => n + g.cameras.length, 0)} cameras in ${queue.length} groups`);
  if (QUEUE) {
    writeFileSync(resolve(QUEUE), JSON.stringify(queue, null, 2) + "\n");
    console.log(`review items written to ${QUEUE}`);
  }

  const writes = brandWrites(decisions, ONLY);
  console.log(`${writes.length} cameras to write`);

  if (APPLY) {
    const client = await pool.connect();
    try {
      for (let i = 0; i < writes.length; i += CHUNK) {
        await writeChunk(client, writes.slice(i, i + CHUNK));
        process.stdout.write(`  wrote ${Math.min(i + CHUNK, writes.length)}/${writes.length}\r`);
      }
      console.log(`\n  wrote ${writes.length} cameras with revisions`);
    } finally {
      client.release();
    }
  } else {
    console.log("Dry run. Re-run with --apply to write.");
  }
} finally {
  await pool.end();
}
