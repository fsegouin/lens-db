import { Pool } from "pg";
import { DB_SSL } from "./db-ca";

const MAX_CLIENTS_PER_INSTANCE = 4;
const IDLE_TIMEOUT_MS = 10_000;
const CONNECTION_TIMEOUT_MS = 10_000;

// pg merges URL query params OVER the explicit config, so every TLS-related
// param must be stripped or it would silently replace the pinned CA.
const TLS_URL_PARAMS = ["sslmode", "ssl", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"];

/**
 * Builds the pg Pool used by the app and the MCP server.
 *
 * Serverless: keep the per-instance pool tiny and let the transaction pooler
 * (pgbouncer, port 6543) do the real multiplexing. TLS is always on with the
 * chain verified against the pinned root CAs in db-ca.ts.
 */
export function createPool(databaseUrl: string) {
  const url = new URL(databaseUrl);
  for (const param of TLS_URL_PARAMS) url.searchParams.delete(param);
  const pool = new Pool({
    connectionString: url.toString(),
    ssl: DB_SSL,
    max: MAX_CLIENTS_PER_INSTANCE,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
  // An idle client dropped by the pooler emits "error" on the pool; with no
  // listener Node treats it as an uncaught exception and exits the process.
  pool.on("error", (err) => {
    console.error("[db] idle client error", err);
  });
  return pool;
}
