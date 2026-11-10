import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const SCRIPT = fileURLToPath(new URL("./consolidate-systems.mjs", import.meta.url));

// The script connects to the database when imported, so read its merge map
// from the source instead.
function loadMerges() {
  const src = readFileSync(SCRIPT, "utf8");
  const start = src.indexOf("const MERGES = [");
  const end = src.indexOf("\n];\n", start);
  assert.ok(start !== -1 && end !== -1, "MERGES array not found");
  return new Function(`return ${src.slice(start + "const MERGES = ".length, end + 2)};`)();
}

// A merged-away source no longer exists, so a later run that targets it fails,
// and the script refuses any run where one system is both.
test("no system is both a merge target and a merge source in any tier", () => {
  const merges = loadMerges();
  const sources = new Set(merges.flatMap((m) => m.from.map(([id]) => id)));
  const clashes = merges
    .filter((m) => sources.has(m.into[0]))
    .map((m) => `tier ${m.tier} target #${m.into[0]} ${m.into[1]}`);
  assert.deepEqual(clashes, []);
});

test("--tier without a value stops with a usage message", () => {
  const { status, stderr } = spawnSync(process.execPath, [SCRIPT, "--tier"], {
    cwd: tmpdir(),
    env: { PATH: process.env.PATH },
    encoding: "utf8",
  });
  assert.equal(status, 1);
  assert.match(stderr, /--tier needs a comma-separated list/);
});
