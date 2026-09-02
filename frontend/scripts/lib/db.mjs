/**
 * Neon-compatible tagged-template `sql` on top of node-postgres so the one-off
 * maintenance scripts in this directory keep their shape after the move to
 * Supabase:
 *
 *   const sql = createSql();                              // reads DATABASE_URL
 *   const rows = await sql`SELECT ... WHERE id = ${id}`;  // parameterised
 *   const rows = await sql.query('SELECT ...', [params]); // raw text
 *   const rows = await sql.unsafe('SELECT ...');          // raw text, no params
 *   sql`... ${sql`fragment`} ...`                          // nested fragments splice in
 *
 * Every form resolves to the row array, like the Neon driver did.
 * Mirrors src/db/pool.ts: TLS pinned to the Supabase root CA, URL TLS params ignored.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

// The CA lives in src/db/supabase-ca.ts as a template literal so the app can
// bundle it; pull the PEM block out of that file rather than duplicating it.
const caSource = readFileSync(
  fileURLToPath(new URL("../../src/db/supabase-ca.ts", import.meta.url)),
  "utf8",
);
const caMatch = caSource.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);
if (!caMatch) {
  throw new Error("Could not find the Supabase root CA PEM block in src/db/supabase-ca.ts");
}
const SUPABASE_ROOT_CA = caMatch[0];

const FRAGMENT = Symbol("sql-fragment");
const TLS_URL_PARAMS = ["sslmode", "ssl", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"];

function compile(strings, values, params) {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value && value[FRAGMENT]) {
      text += compile(value.strings, value.values, params);
    } else {
      params.push(value);
      text += `$${params.length}`;
    }
    text += strings[i + 1];
  }
  return text;
}

export function createPool(databaseUrl = process.env.DATABASE_URL, { max = 2 } = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL environment variable is not set");
  const url = new URL(databaseUrl);
  for (const param of TLS_URL_PARAMS) url.searchParams.delete(param);
  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl: { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true },
    max,
    connectionTimeoutMillis: 10_000,
    // One-off scripts rarely call sql.end(); let the process exit once the
    // pool is idle instead of holding pooler sockets for idleTimeoutMillis.
    allowExitOnIdle: true,
  });
  pool.on("error", (err) => console.error("[db] idle client error", err));
  return pool;
}

export function createSql(databaseUrl = process.env.DATABASE_URL) {
  const pool = createPool(databaseUrl);
  const query = async (text, params = []) => (await pool.query(text, params)).rows;

  // Lazy thenable: `await sql`...`` runs the query; nesting `${sql`...`}` inside
  // another template splices it in as a fragment without executing it.
  const sql = (strings, ...values) => ({
    [FRAGMENT]: true,
    strings,
    values,
    then(resolve, reject) {
      const params = [];
      const text = compile(strings, values, params);
      return query(text, params).then(resolve, reject);
    },
  });
  sql.query = query;
  sql.unsafe = (text) => query(text);
  sql.end = () => pool.end();
  return sql;
}
