#!/usr/bin/env node

import { neon } from "@neondatabase/serverless";

function parseArgs(argv) {
  const args = {
    slug: null,
    limit: 25,
    model: "gpt-4.1-mini",
    dryRun: false,
    overwrite: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--slug") {
      args.slug = argv[i + 1] ?? null;
      i += 1;
    } else if (arg.startsWith("--limit=")) {
      args.limit = Number(arg.slice("--limit=".length));
    } else if (arg === "--limit") {
      args.limit = Number(argv[i + 1] ?? args.limit);
      i += 1;
    } else if (arg.startsWith("--model=")) {
      args.model = arg.slice("--model=".length);
    } else if (arg === "--model") {
      args.model = argv[i + 1] ?? args.model;
      i += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--overwrite") {
      args.overwrite = true;
    }
  }

  if (!Number.isFinite(args.limit) || args.limit <= 0) {
    throw new Error("Invalid --limit value. Use a positive number.");
  }

  return args;
}

function compactSpace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function buildPrompt(row) {
  const parts = [
    `System name: ${row.name}`,
    row.manufacturer ? `Manufacturer: ${row.manufacturer}` : null,
    row.mount_type ? `Mount type: ${row.mount_type}` : null,
    `Lens count in database: ${row.lens_count ?? 0}`,
    `Camera count in database: ${row.camera_count ?? 0}`,
    row.first_lens_year ? `Earliest lens year in DB: ${row.first_lens_year}` : null,
    row.latest_lens_year ? `Latest lens year in DB: ${row.latest_lens_year}` : null,
    row.first_camera_year ? `Earliest camera year in DB: ${row.first_camera_year}` : null,
    row.latest_camera_year ? `Latest camera year in DB: ${row.latest_camera_year}` : null,
  ].filter(Boolean);

  return parts.join("\n");
}

async function generateDescription({ apiKey, model, row }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You write short, factual photography-system blurbs for database entries. Keep to 1-2 sentences, neutral tone, no hype, no markdown, no bullets. Do not invent unverifiable facts. If uncertain, use cautious language.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Write a concise description for this camera system entry. Mention what the system is and the context implied by the dataset.\n\n${buildPrompt(row)}`,
            },
          ],
        },
      ],
      max_output_tokens: 160,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text = compactSpace(data.output_text || "");
  if (!text) {
    throw new Error("OpenAI returned empty output_text");
  }

  return text;
}

async function main() {
  const { slug, limit, model, dryRun, overwrite } = parseArgs(process.argv.slice(2));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  const sql = neon(databaseUrl);

  const rows = await sql`
    SELECT
      s.id,
      s.slug,
      s.name,
      s.manufacturer,
      s.mount_type,
      s.description,
      (SELECT COUNT(*)::int FROM lenses l WHERE l.system_id = s.id) AS lens_count,
      (SELECT COUNT(*)::int FROM cameras c WHERE c.system_id = s.id) AS camera_count,
      (SELECT MIN(l.year_introduced) FROM lenses l WHERE l.system_id = s.id) AS first_lens_year,
      (SELECT MAX(l.year_introduced) FROM lenses l WHERE l.system_id = s.id) AS latest_lens_year,
      (SELECT MIN(c.year_introduced) FROM cameras c WHERE c.system_id = s.id) AS first_camera_year,
      (SELECT MAX(c.year_introduced) FROM cameras c WHERE c.system_id = s.id) AS latest_camera_year
    FROM systems s
    WHERE
      ${slug ? sql`(s.slug = ${slug})` : sql`TRUE`}
      AND
      ${overwrite ? sql`TRUE` : sql`(s.description IS NULL OR btrim(s.description) = '')`}
    ORDER BY s.name ASC
    LIMIT ${limit}
  `;

  if (rows.length === 0) {
    console.log("No matching systems found.");
    return;
  }

  console.log(
    `Generating descriptions for ${rows.length} system(s) using ${model}${dryRun ? " (dry-run)" : ""}...`
  );

  let successCount = 0;
  for (const row of rows) {
    try {
      const description = await generateDescription({
        apiKey: openaiApiKey,
        model,
        row,
      });

      if (dryRun) {
        console.log(`\n[${row.slug}] ${description}`);
      } else {
        await sql`UPDATE systems SET description = ${description} WHERE id = ${row.id}`;
        console.log(`[updated] ${row.slug}`);
      }

      successCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[failed] ${row.slug}: ${message}`);
    }
  }

  console.log(`\nDone. ${successCount}/${rows.length} descriptions processed.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
