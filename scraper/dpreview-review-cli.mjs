/**
 * Manual review CLI for uncertain DPReview duplicates — candidates where the
 * LLM was not ≥90% sure the deterministic match is a real duplicate.
 *
 * For each item you decide:
 *   [d] duplicate — the matched DB record is enriched with the scraped data
 *   [n] new       — the candidate is queued as a pending edit for admin approval
 *   [v] version   — lenses only: same product line, different generation, so
 *                   both lenses join a version group and can be labelled or
 *                   renamed (e.g. Type IV/V). Cameras have no version groups —
 *                   a successor body is simply its own record, so answer [n].
 *   [s] skip      — leave it in the review queue
 *   [q] quit
 *
 * Usage: API_URL=https://thelensdb.com CRON_SECRET=... node scraper/dpreview-review-cli.mjs
 *        (ENTITY=cameras to review camera bodies; default "lenses")
 */

import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const ENTITIES = {
  lenses: {
    noun: "lens",
    nounPlural: "lenses",
    endpoint: "/api/cron/dpreview-review",
    sitePath: "lenses",
    supportsVersion: true,
    match: (item) => ({
      id: item.matchedLensId,
      name: item.matchedLensName,
      slug: item.matchedLensSlug,
      year: item.matchedLensYear,
    }),
    // The one-line summary of a candidate, under its name
    summary: (c, spec) =>
      `announced ${c.year ?? spec["Announced"] ?? "?"} | mounts: ${spec["Lens mount"] || c.mounts || "?"} | ${spec["Lens type"] || "?"}`,
  },
  cameras: {
    noun: "camera",
    nounPlural: "cameras",
    endpoint: "/api/cron/dpreview-camera-review",
    sitePath: "cameras",
    supportsVersion: false,
    match: (item) => ({
      id: item.matchedCameraId,
      name: item.matchedCameraName,
      slug: item.matchedCameraSlug,
      year: item.matchedCameraYear,
    }),
    summary: (c, spec) =>
      `announced ${c.year ?? spec["Announced"] ?? "?"} | ${spec["Body type"] || "?"} | ` +
      `${spec["Sensor size"] || "?"} ${spec["Effective pixels"] || ""} | mount: ${spec["Lens mount"] || "fixed lens"}`,
  },
};

const ENTITY_KEY = process.env.ENTITY || "lenses";
const ENTITY = ENTITIES[ENTITY_KEY];
if (!ENTITY) {
  console.error(`Unknown ENTITY "${ENTITY_KEY}" — expected one of: ${Object.keys(ENTITIES).join(", ")}`);
  process.exit(1);
}

const API_URL = process.env.API_URL || "https://thelensdb.com";
const CRON_SECRET = process.env.CRON_SECRET;

function authHeaders(extra = {}) {
  return {
    ...(CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {}),
    ...extra,
  };
}

async function getReviewItems() {
  const res = await fetch(`${API_URL}${ENTITY.endpoint}`, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`Failed to fetch review queue: ${res.status} ${await res.text()}`);
  }
  const { items } = await res.json();
  return items;
}

async function submitDecision(dpreviewSlug, decision, extra = {}) {
  const res = await fetch(`${API_URL}${ENTITY.endpoint}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ dpreviewSlug, decision, ...extra }),
  });
  if (!res.ok) {
    console.error(`  Failed: ${res.status} ${await res.text()}`);
    return null;
  }
  return res.json();
}

const VERDICT_TEXT = {
  duplicate: "a DUPLICATE of the DB match → suggests [d]",
  new_version: "a NEW VERSION of the DB match → suggests [v]",
  new_lens: "a DISTINCT NEW LENS → suggests [n]",
  new_camera: "a DISTINCT NEW CAMERA → suggests [n]",
};

function describeCandidate(item) {
  const c = item.candidateData || {};
  const spec = c.specTable || {};
  const match = ENTITY.match(item);
  const lines = [
    `  DPReview:  ${item.name}`,
    `             ${item.dpreviewUrl}`,
    `             ${ENTITY.summary(c, spec)}`,
  ];
  if (match.id) {
    lines.push(
      `  DB match:  ${match.name} (${match.year ?? "?"})`,
      `             ${API_URL}/${ENTITY.sitePath}/${match.slug}`,
    );
  } else {
    lines.push(`  DB match:  (missing — matched ${ENTITY.noun} no longer exists)`);
  }
  let verdict;
  if (item.llmConfidence == null) {
    verdict = "no verdict recorded";
  } else if (!VERDICT_TEXT[item.llmVerdict]) {
    verdict = `${Math.round(item.llmConfidence * 100)}% confidence (verdict type not recorded)`;
  } else {
    verdict = `${Math.round(item.llmConfidence * 100)}% sure this is ${VERDICT_TEXT[item.llmVerdict]}`;
  }
  lines.push(`  LLM:       ${verdict}`);
  lines.push(`             ${item.llmReasoning || "no reasoning recorded"}`);
  return lines.join("\n");
}

async function main() {
  if (!CRON_SECRET) {
    console.warn("Warning: CRON_SECRET not set — requests will be unauthenticated");
  }

  const items = await getReviewItems();
  if (items.length === 0) {
    console.log(`Review queue is empty — nothing to do (${ENTITY.nounPlural}).`);
    return;
  }
  console.log(`${items.length} uncertain ${ENTITY.noun} duplicate${items.length === 1 ? "" : "s"} to review\n`);

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const counts = { duplicate: 0, new: 0, version: 0, skipped: 0 };

  const answers = ENTITY.supportsVersion ? ["d", "n", "v", "s", "q"] : ["d", "n", "s", "q"];
  const promptText = ENTITY.supportsVersion
    ? "  [d]uplicate / [n]ew lens / [v]ersion / [s]kip / [q]uit > "
    : "  [d]uplicate / [n]ew camera / [s]kip / [q]uit > ";

  const ask = async (prompt) => {
    try {
      return (await rl.question(prompt)).trim();
    } catch {
      return ""; // stdin closed (EOF)
    }
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const match = ENTITY.match(item);
    console.log(`[${i + 1}/${items.length}] ${"─".repeat(60)}`);
    console.log(describeCandidate(item));

    let answer;
    for (;;) {
      try {
        answer = (await rl.question(promptText)).trim().toLowerCase();
      } catch {
        answer = "q"; // stdin closed (EOF) — treat as quit
      }
      if (answers.includes(answer)) break;
    }
    if (answer === "q") break;
    if (answer === "s") {
      counts.skipped++;
      continue;
    }

    if (answer === "v") {
      const existingLabel = await ask(`  Version label for the EXISTING lens "${match.name}" (e.g. Type IV; blank = none): `);
      const renameExistingTo = await ask("  Rename existing display name to (blank = keep, slug is preserved either way): ");
      const newLabel = await ask(`  Version label for the NEW lens "${item.name}" (e.g. Type V; blank = none): `);
      const result = await submitDecision(item.dpreviewSlug, "version", {
        existingLabel: existingLabel || undefined,
        renameExistingTo: renameExistingTo || undefined,
        newLabel: newLabel || undefined,
      });
      if (result) {
        counts.version++;
        console.log(`  ✓ version group #${result.versionGroupId}: created ${API_URL}/lenses/${result.newSlug}\n`);
      }
      continue;
    }

    const decision = answer === "d" ? "duplicate" : "new";
    const result = await submitDecision(item.dpreviewSlug, decision);
    if (result) {
      counts[decision]++;
      if (decision === "duplicate") {
        const fields = result.enrichedFields?.length
          ? `enriched: ${result.enrichedFields.join(", ")}`
          : "nothing to enrich";
        const mergedId = result.lensId ?? result.cameraId;
        console.log(`  ✓ merged into ${ENTITY.noun} #${mergedId} (${fields})\n`);
      } else {
        console.log(`  ✓ queued as pending edit #${result.pendingEditId} — approve at ${API_URL}/admin/pending-edits\n`);
      }
    }
  }

  rl.close();
  const resolved = counts.duplicate + counts.new + counts.version;
  console.log(
    `\nDone: ${counts.duplicate} merged, ${counts.new} queued as new, ` +
    (ENTITY.supportsVersion ? `${counts.version} versioned, ` : "") +
    `${counts.skipped} skipped, ` +
    `${items.length - resolved - counts.skipped} left in queue`,
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
