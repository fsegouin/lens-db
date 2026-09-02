// Approves all remaining pending edits by driving the bulk endpoint as your
// admin account (signs a session with your own SESSION_SECRET).
// Small batches + retries so it survives the server being killed/restarted.
// Run (from frontend/): bash -c 'set -a; source .env.local; set +a; node scripts/approve-all-pending.mjs'
import crypto from "node:crypto";
import pg from "pg";

const API = "http://localhost:3105";
const BATCH = 8; // ~10-12s per batch — fits between server deaths

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const { rows } = await pool.query("SELECT id, display_name FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
await pool.end();
if (!rows.length) throw new Error("no admin user found");
const admin = rows[0];
console.log(`acting as admin: ${admin.display_name} (#${admin.id})`);

const expiresAt = Math.floor(Date.now() / 1000) + 7200;
const payload = `${admin.id}.${expiresAt}`;
const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("hex");
const cookie = `user_session=${payload}.${signature}`;

let approved = 0;
const failed = [];
let afterId = 0;
for (;;) {
  let data;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${API}/api/admin/pending-edits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie, Origin: API },
        body: JSON.stringify({ action: "approve_all", afterId, limit: BATCH }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      data = await res.json();
      break;
    } catch (error) {
      if (attempt >= 10) throw error;
      console.warn(`  server unreachable/failed (attempt ${attempt}/10), retrying in 10s: ${String(error).slice(0, 90)}`);
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
  approved += data.approved;
  failed.push(...data.failed);
  console.log(`approved so far: ${approved}${failed.length ? ` (${failed.length} failed)` : ""}`);
  if (data.lastId === null) break;
  afterId = data.lastId;
}
console.log(`\nDone: ${approved} approved, ${failed.length} failed`);
for (const f of failed) console.log(`  #${f.id}: ${f.reason}`);
