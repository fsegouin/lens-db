import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";
import { SUPABASE_SSL } from "./src/db/supabase-ca";

const DEFAULT_POSTGRES_PORT = 5432;

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const cwd = process.cwd();
loadEnvFile(resolve(cwd, ".env"));
loadEnvFile(resolve(cwd, ".env.local"));

// drizzle-kit opens its own pg connection and cannot verify Supabase's
// self-signed chain from a bare URL, so split the URL into fields and pin the CA.
function dbCredentials(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: Number(url.port || DEFAULT_POSTGRES_PORT),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: SUPABASE_SSL,
  };
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: dbCredentials(process.env.DATABASE_URL),
});
