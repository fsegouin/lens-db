/**
 * Manual review CLI for uncertain DPReview duplicates — candidates where the
 * LLM was not ≥90% sure the deterministic match is a real duplicate.
 *
 * For each item you decide:
 *   [d] duplicate — the matched DB lens is enriched with the scraped data
 *   [n] new lens  — the candidate is queued as a pending edit for admin approval
 *   [v] version   — same product line, different generation: both lenses join a
 *                   version group; you can label/rename them (e.g. Type IV/V)
 *   [s] skip      — leave it in the review queue
 *   [q] quit
 *
 * Usage: API_URL=https://thelensdb.com CRON_SECRET=... node scraper/dpreview-review-cli.mjs
 */

import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const API_URL = process.env.API_URL || "https://thelensdb.com";
const CRON_SECRET = process.env.CRON_SECRET;

function authHeaders(extra = {}) {
  return {
    ...(CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {}),
    ...extra,
  };
}

async function getReviewItems() {
  const res = await fetch(`${API_URL}/api/cron/dpreview-review`, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`Failed to fetch review queue: ${res.status} ${await res.text()}`);
  }
  const { items } = await res.json();
  return items;
}

async function submitDecision(dpreviewSlug, decision, extra = {}) {
  const res = await fetch(`${API_URL}/api/cron/dpreview-review`, {
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
};

function describeCandidate(item) {
  const c = item.candidateData || {};
  const spec = c.specTable || {};
  const lines = [
    `  DPReview:  ${item.name}`,
    `             ${item.dpreviewUrl}`,
    `             announced ${c.year ?? spec["Announced"] ?? "?"} | mounts: ${spec["Lens mount"] || c.mounts || "?"} | ${spec["Lens type"] || "?"}`,
  ];
  if (item.matchedLensId) {
    lines.push(
      `  DB match:  ${item.matchedLensName} (${item.matchedLensYear ?? "?"})`,
      `             ${API_URL}/lenses/${item.matchedLensSlug}`,
    );
  } else {
    lines.push("  DB match:  (missing — matched lens no longer exists)");
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
    console.log("Review queue is empty — nothing to do.");
    return;
  }
  console.log(`${items.length} uncertain duplicate${items.length === 1 ? "" : "s"} to review\n`);

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const counts = { duplicate: 0, new: 0, version: 0, skipped: 0 };

  const ask = async (prompt) => {
    try {
      return (await rl.question(prompt)).trim();
    } catch {
      return ""; // stdin closed (EOF)
    }
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`[${i + 1}/${items.length}] ${"─".repeat(60)}`);
    console.log(describeCandidate(item));

    let answer;
    for (;;) {
      try {
        answer = (await rl.question("  [d]uplicate / [n]ew lens / [v]ersion / [s]kip / [q]uit > "))
          .trim()
          .toLowerCase();
      } catch {
        answer = "q"; // stdin closed (EOF) — treat as quit
      }
      if (["d", "n", "v", "s", "q"].includes(answer)) break;
    }
    if (answer === "q") break;
    if (answer === "s") {
      counts.skipped++;
      continue;
    }

    if (answer === "v") {
      const existingLabel = await ask(`  Version label for the EXISTING lens "${item.matchedLensName}" (e.g. Type IV; blank = none): `);
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
        console.log(`  ✓ merged into lens #${result.lensId} (${fields})\n`);
      } else {
        console.log(`  ✓ queued as pending edit #${result.pendingEditId} — approve at ${API_URL}/admin/pending-edits\n`);
      }
    }
  }

  rl.close();
  console.log(
    `\nDone: ${counts.duplicate} merged, ${counts.new} queued as new, ${counts.version} versioned, ` +
    `${counts.skipped} skipped, ` +
    `${items.length - counts.duplicate - counts.new - counts.version - counts.skipped} left in queue`,
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
