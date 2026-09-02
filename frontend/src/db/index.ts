import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { createPool } from "./pool";
import * as schema from "./schema";

// drizzle() returns the database intersected with `$client`; keep it on the
// alias so callers (e.g. the MCP server's shutdown) can reach the pool.
export type Database = NodePgDatabase<typeof schema> & { $client: Pool };

// Cached on globalThis so Next dev HMR reuses one pool instead of leaking one per reload.
const globalForDb = globalThis as unknown as { __lensDb?: Database };

export function getDb() {
  if (!globalForDb.__lensDb) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    globalForDb.__lensDb = drizzle(createPool(databaseUrl), { schema });
  }
  return globalForDb.__lensDb;
}

export const db = new Proxy({} as Database, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
