import type { Pool } from "pg";
import { getDb } from "../../frontend/src/db";
import * as schema from "../../frontend/src/db/schema";

// One pool per process: the chat route loads these tools inside the Next.js
// server, so re-exporting the frontend singleton avoids a second pool there.
export { getDb, schema };

/** Drain the pool so the stdio process can exit promptly on EOF/SIGTERM. */
export async function closeDb() {
  await (getDb().$client as Pool).end();
}
