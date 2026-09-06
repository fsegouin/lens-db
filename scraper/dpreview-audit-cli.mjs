/**
 * Post-hoc extraction audit runner: walks every entity the DPReview watcher
 * created or enriched, plus its pending new-entity edits, and has an LLM
 * verify the extracted columns against the raw spec table stored alongside
 * each. Read-only — prints a report and saves it as JSON, never writes data.
 *
 * Usage: API_URL=http://localhost:3000 CRON_SECRET=... node scraper/dpreview-audit-cli.mjs
 *        (optional: LIMIT=25 to audit only the first N per target, for a quick sample;
 *         CREATE_EDITS=1 to file findings into the pending-edits review queue —
 *         corrections as new pending edits for inserted entities, warnings
 *         annotated onto existing pending edits;
 *         ENTITY=cameras to audit camera bodies, "lenses" (default), or "all")
 */

import fs from "node:fs";

// Each entity contributes two targets: the records the watcher has already
// written, and the new-entity edits still awaiting approval.
const ENTITY_TARGETS = {
  lenses: [
    { target: "lenses", heading: "Lenses (created/enriched)", resumable: true },
    { target: "pending", heading: "Pending new-lens edits", resumable: false },
  ],
  cameras: [
    { target: "cameras", heading: "Cameras (created/enriched)", resumable: true },
    { target: "pending-cameras", heading: "Pending new-camera edits", resumable: false },
  ],
};

const ENTITY_KEY = process.env.ENTITY || "lenses";
const TARGETS =
  ENTITY_KEY === "all"
    ? [...ENTITY_TARGETS.lenses, ...ENTITY_TARGETS.cameras]
    : ENTITY_TARGETS[ENTITY_KEY];
if (!TARGETS) {
  console.error(
    `Unknown ENTITY "${ENTITY_KEY}" — expected one of: ${Object.keys(ENTITY_TARGETS).join(", ")}, all`,
  );
  process.exit(1);
}

const API_URL = process.env.API_URL || "https://thelensdb.com";
const CRON_SECRET = process.env.CRON_SECRET;
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const CREATE_EDITS = process.env.CREATE_EDITS === "1";
// Only audit candidates first seen in the last N hours (weekly cron passes
// this so it never re-audits the whole catalog)
const RECENT_HOURS = process.env.RECENT_HOURS ? parseInt(process.env.RECENT_HOURS, 10) : null;
const BATCH = 10;

function authHeaders(extra = {}) {
  return {
    ...(CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {}),
    ...extra,
  };
}

async function api(method, bodyOrNull) {
  // Retry transient failures (network flaps, serverless DB hiccups)
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${API_URL}/api/cron/dpreview-audit`, {
        method,
        headers: authHeaders(bodyOrNull ? { "Content-Type": "application/json" } : {}),
        ...(bodyOrNull ? { body: JSON.stringify(bodyOrNull) } : {}),
      });
      if (!res.ok) {
        throw new Error(`${method} audit failed: ${res.status} ${await res.text()}`);
      }
      return await res.json();
    } catch (error) {
      if (attempt >= 3) throw error;
      console.warn(`  retrying after error (${attempt}/3): ${String(error).slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

async function auditTarget(target, resumable) {
  const results = [];
  // AFTER_ID resumes an entity target past already-audited ids
  let afterId = resumable && process.env.AFTER_ID ? parseInt(process.env.AFTER_ID, 10) : 0;
  while (results.length < LIMIT) {
    const { items, lastId } = await api("POST", {
      target,
      afterId,
      limit: Math.min(BATCH, LIMIT - results.length),
      createEdits: CREATE_EDITS,
      ...(RECENT_HOURS ? { recentHours: RECENT_HOURS } : {}),
    });
    results.push(...items);
    for (const item of items) {
      if (!item.ok && item.issues.length > 0) {
        console.log(`  ⚠ ${item.name} (#${item.id})`);
        for (const issue of item.issues) {
          console.log(`      ${issue.problem.toUpperCase()} ${issue.field}: raw "${issue.rawValue}" vs extracted "${issue.extractedValue}"`);
        }
      }
    }
    if (lastId === null) break;
    afterId = lastId;
    process.stdout.write(`  …${results.length} audited\r`);
  }
  return results;
}

async function main() {
  if (!CRON_SECRET) {
    console.warn("Warning: CRON_SECRET not set — requests will be unauthenticated");
  }

  const counts = await api("GET");
  console.log(
    `Watcher-touched: ${counts.lenses} lenses, ${counts.cameras ?? 0} cameras. ` +
    `Pending edits: ${counts.pendingEdits} lens, ${counts.pendingCameras ?? 0} camera.\n`,
  );

  const report = { generatedAt: new Date().toISOString() };
  const all = [];
  for (const { target, heading, resumable } of TARGETS) {
    console.log(`── ${heading} ──`);
    const results = await auditTarget(target, resumable);
    report[target] = results;
    all.push(...results);
    console.log("");
  }

  const flagged = all.filter((r) => !r.ok && r.issues.length > 0);
  const flaggedIssues = flagged.flatMap((r) => r.issues);
  const wrong = flaggedIssues.filter((i) => i.problem === "wrong").length;
  const missing = flaggedIssues.filter((i) => i.problem === "missing").length;

  const outPath = `${process.cwd()}/dpreview-audit-report.json`;
  fs.writeFileSync(outPath, JSON.stringify(report, null, 1));

  console.log(
    `Done: ${all.length} audited, ` +
    `${flagged.length} flagged (${wrong} wrong, ${missing} missing).\nFull report: ${outPath}`,
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
