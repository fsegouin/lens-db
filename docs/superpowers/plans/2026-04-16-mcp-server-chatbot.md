# MCP Server + Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server exposing the lens-db database, consumed by a chatbot on lensdb.com via Vercel AI SDK + AI Gateway, and reusable via stdio for Claude Desktop / ChatGPT.

**Architecture:** Shared tool functions query Neon PostgreSQL via Drizzle ORM. Two thin wrappers: AI SDK `tool()` for the chatbot API route, MCP `registerTool()` for the stdio server. The chatbot streams responses via `streamText()` with `@ai-sdk/gateway`.

**Tech Stack:** TypeScript, Drizzle ORM, @modelcontextprotocol/sdk, ai (Vercel AI SDK), @ai-sdk/gateway, Next.js 16 App Router, React 19, Tailwind CSS v4, shadcn components.

**Spec:** `docs/superpowers/specs/2026-04-16-mcp-server-chatbot-design.md`

---

## File Structure

### New files — mcp-server/

| File | Responsibility |
|------|---------------|
| `mcp-server/package.json` | Package config, dependencies, scripts |
| `mcp-server/tsconfig.json` | TypeScript config, imports frontend schema |
| `mcp-server/src/db.ts` | Neon/Drizzle connection (standalone, same pattern as frontend) |
| `mcp-server/src/tools/search-cameras.ts` | Camera search tool logic |
| `mcp-server/src/tools/search-lenses.ts` | Lens search tool logic |
| `mcp-server/src/tools/get-camera-details.ts` | Single camera details with full specs JSON |
| `mcp-server/src/tools/get-lens-details.ts` | Single lens details with full specs JSON |
| `mcp-server/src/tools/get-price.ts` | Price estimates + recent sale history |
| `mcp-server/src/tools/get-system-info.ts` | Mount system info with counts |
| `mcp-server/src/tools/get-compatible-lenses.ts` | Lenses compatible with a camera |
| `mcp-server/src/tools/index.ts` | Re-exports all tool functions and their Zod schemas |
| `mcp-server/src/server.ts` | MCP server entry point (stdio transport) |
| `mcp-server/src/ai-tools.ts` | AI SDK `tool()` wrappers |

### New files — frontend/

| File | Responsibility |
|------|---------------|
| `frontend/src/app/api/chat/route.ts` | POST endpoint: streamText with AI Gateway + MCP tools |
| `frontend/src/app/chat/page.tsx` | Chat page (server component, metadata) |
| `frontend/src/components/ChatInterface.tsx` | Client component: message list, input, streaming |

### Modified files

| File | Change |
|------|--------|
| `frontend/package.json` | Add `@ai-sdk/gateway` dependency |
| `frontend/src/lib/rate-limit.ts` | Add `chat` rate limiter |
| `frontend/src/components/Nav.tsx` | Add Chat link to navigation (if nav exists) |

---

## Task 1: Set up mcp-server package

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/tsconfig.json`
- Create: `mcp-server/src/db.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "lens-db-mcp-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^2.0.0",
    "@neondatabase/serverless": "^1.0.2",
    "drizzle-orm": "^0.45.1",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "paths": {
      "@frontend/*": ["../frontend/src/*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create db.ts**

```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "../../frontend/src/db/schema.js";

export { schema };

let _db: NeonHttpDatabase<typeof schema> | null = null;

export function getDb() {
  if (!_db) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const sql = neon(databaseUrl);
    _db = drizzle(sql, { schema });
  }
  return _db;
}
```

- [ ] **Step 4: Install dependencies**

Run: `cd /home/florent/lens-db/mcp-server && pnpm install`
Expected: dependencies installed, `pnpm-lock.yaml` created.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /home/florent/lens-db/mcp-server && npx tsc --noEmit`
Expected: No errors (may need to adjust paths if schema import fails — fix as needed).

- [ ] **Step 6: Commit**

```bash
git add mcp-server/package.json mcp-server/tsconfig.json mcp-server/src/db.ts mcp-server/pnpm-lock.yaml
git commit -m "feat: scaffold mcp-server package with DB connection"
```

---

## Task 2: Implement search_cameras tool

**Files:**
- Create: `mcp-server/src/tools/search-cameras.ts`

- [ ] **Step 1: Create the tool file**

```typescript
import { z } from "zod";
import { eq, and, gte, lte, sql, asc, desc } from "drizzle-orm";
import { getDb, schema } from "../db.js";

const { cameras, systems, priceEstimates } = schema;

export const searchCamerasSchema = z.object({
  query: z.string().optional().describe("Free text search on camera name"),
  system: z.string().optional().describe("Mount system name, e.g. 'Nikon F', 'Canon EF'"),
  brand: z.string().optional().describe("Manufacturer name"),
  yearFrom: z.number().optional().describe("Earliest year introduced"),
  yearTo: z.number().optional().describe("Latest year introduced"),
  sensorSize: z.string().optional().describe("Sensor size, e.g. 'Full Frame', 'APS-C'"),
  bodyType: z.string().optional().describe("Body type, e.g. 'SLR', 'Mirrorless', 'Rangefinder'"),
  limit: z.number().min(1).max(50).default(20).describe("Max results to return"),
});

export type SearchCamerasParams = z.infer<typeof searchCamerasSchema>;

export async function searchCameras(params: SearchCamerasParams) {
  const db = getDb();
  const conditions = [];

  if (params.query) {
    const words = params.query.trim().split(/\s+/).filter(Boolean).slice(0, 10);
    for (const word of words) {
      const clean = word.replace(/[^a-zA-Z0-9.]/g, "");
      if (!clean) continue;
      const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const startsWithDigit = /^\d/.test(clean);
      const pattern = startsWithDigit ? `\\m${escaped}` : escaped;
      conditions.push(
        sql`regexp_replace(${cameras.name}, '[^a-zA-Z0-9. ]', '', 'g') ~* ${pattern}`
      );
    }
  }
  if (params.system) {
    conditions.push(
      sql`${systems.name} ILIKE ${params.system}`
    );
  }
  if (params.brand) {
    conditions.push(
      sql`${cameras.specs}->>'Brand' ILIKE ${params.brand}`
    );
  }
  if (params.yearFrom) {
    conditions.push(gte(cameras.yearIntroduced, params.yearFrom));
  }
  if (params.yearTo) {
    conditions.push(lte(cameras.yearIntroduced, params.yearTo));
  }
  if (params.sensorSize) {
    conditions.push(eq(cameras.sensorSize, params.sensorSize));
  }
  if (params.bodyType) {
    conditions.push(eq(cameras.bodyType, params.bodyType));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select({
      name: cameras.name,
      slug: cameras.slug,
      system: systems.name,
      yearIntroduced: cameras.yearIntroduced,
      sensorType: cameras.sensorType,
      sensorSize: cameras.sensorSize,
      megapixels: cameras.megapixels,
      bodyType: cameras.bodyType,
      weightG: cameras.weightG,
      medianPrice: priceEstimates.medianPrice,
    })
    .from(cameras)
    .leftJoin(systems, eq(cameras.systemId, systems.id))
    .leftJoin(
      priceEstimates,
      and(
        eq(priceEstimates.entityType, "camera"),
        eq(priceEstimates.entityId, cameras.id)
      )
    )
    .where(where)
    .orderBy(asc(cameras.name))
    .limit(params.limit);

  return {
    count: results.length,
    cameras: results,
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/florent/lens-db/mcp-server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add mcp-server/src/tools/search-cameras.ts
git commit -m "feat: add search_cameras tool function"
```

---

## Task 3: Implement search_lenses tool

**Files:**
- Create: `mcp-server/src/tools/search-lenses.ts`

- [ ] **Step 1: Create the tool file**

```typescript
import { z } from "zod";
import { eq, and, gte, lte, sql, asc } from "drizzle-orm";
import { getDb, schema } from "../db.js";

const { lenses, systems, priceEstimates } = schema;

export const searchLensesSchema = z.object({
  query: z.string().optional().describe("Free text search on lens name"),
  system: z.string().optional().describe("Mount system name, e.g. 'Nikon F', 'Sony E'"),
  brand: z.string().optional().describe("Lens manufacturer"),
  focalLengthMin: z.number().optional().describe("Minimum focal length in mm"),
  focalLengthMax: z.number().optional().describe("Maximum focal length in mm"),
  apertureMax: z.number().optional().describe("Maximum aperture (e.g. 1.4, 2.8)"),
  isZoom: z.boolean().optional().describe("Filter for zoom lenses"),
  isPrime: z.boolean().optional().describe("Filter for prime lenses"),
  isMacro: z.boolean().optional().describe("Filter for macro lenses"),
  hasAutofocus: z.boolean().optional().describe("Filter for autofocus lenses"),
  hasStabilization: z.boolean().optional().describe("Filter for stabilized lenses"),
  yearFrom: z.number().optional().describe("Earliest year introduced"),
  yearTo: z.number().optional().describe("Latest year introduced"),
  limit: z.number().min(1).max(50).default(20).describe("Max results to return"),
});

export type SearchLensesParams = z.infer<typeof searchLensesSchema>;

export async function searchLenses(params: SearchLensesParams) {
  const db = getDb();
  const conditions = [];

  if (params.query) {
    const words = params.query.trim().split(/\s+/).filter(Boolean).slice(0, 10);
    for (const word of words) {
      const clean = word.replace(/[^a-zA-Z0-9.]/g, "");
      if (!clean) continue;
      const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const startsWithDigit = /^\d/.test(clean);
      const pattern = startsWithDigit ? `\\m${escaped}` : escaped;
      conditions.push(
        sql`regexp_replace(${lenses.name}, '[^a-zA-Z0-9. ]', '', 'g') ~* ${pattern}`
      );
    }
  }
  if (params.system) {
    conditions.push(sql`${systems.name} ILIKE ${params.system}`);
  }
  if (params.brand) {
    conditions.push(sql`${lenses.brand} ILIKE ${params.brand}`);
  }
  if (params.focalLengthMin) {
    conditions.push(gte(lenses.focalLengthMin, params.focalLengthMin));
  }
  if (params.focalLengthMax) {
    conditions.push(lte(lenses.focalLengthMax, params.focalLengthMax));
  }
  if (params.apertureMax) {
    conditions.push(lte(lenses.apertureMin, params.apertureMax));
  }
  if (params.isZoom !== undefined) {
    conditions.push(eq(lenses.isZoom, params.isZoom));
  }
  if (params.isPrime !== undefined) {
    conditions.push(eq(lenses.isPrime, params.isPrime));
  }
  if (params.isMacro !== undefined) {
    conditions.push(eq(lenses.isMacro, params.isMacro));
  }
  if (params.hasAutofocus !== undefined) {
    conditions.push(eq(lenses.hasAutofocus, params.hasAutofocus));
  }
  if (params.hasStabilization !== undefined) {
    conditions.push(eq(lenses.hasStabilization, params.hasStabilization));
  }
  if (params.yearFrom) {
    conditions.push(gte(lenses.yearIntroduced, params.yearFrom));
  }
  if (params.yearTo) {
    conditions.push(lte(lenses.yearIntroduced, params.yearTo));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select({
      name: lenses.name,
      slug: lenses.slug,
      brand: lenses.brand,
      system: systems.name,
      focalLengthMin: lenses.focalLengthMin,
      focalLengthMax: lenses.focalLengthMax,
      apertureMin: lenses.apertureMin,
      apertureMax: lenses.apertureMax,
      yearIntroduced: lenses.yearIntroduced,
      isZoom: lenses.isZoom,
      isPrime: lenses.isPrime,
      isMacro: lenses.isMacro,
      hasAutofocus: lenses.hasAutofocus,
      hasStabilization: lenses.hasStabilization,
      weightG: lenses.weightG,
      medianPrice: priceEstimates.medianPrice,
    })
    .from(lenses)
    .leftJoin(systems, eq(lenses.systemId, systems.id))
    .leftJoin(
      priceEstimates,
      and(
        eq(priceEstimates.entityType, "lens"),
        eq(priceEstimates.entityId, lenses.id)
      )
    )
    .where(where)
    .orderBy(asc(lenses.name))
    .limit(params.limit);

  return {
    count: results.length,
    lenses: results,
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/florent/lens-db/mcp-server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add mcp-server/src/tools/search-lenses.ts
git commit -m "feat: add search_lenses tool function"
```

---

## Task 4: Implement detail tools (get_camera_details, get_lens_details)

**Files:**
- Create: `mcp-server/src/tools/get-camera-details.ts`
- Create: `mcp-server/src/tools/get-lens-details.ts`

- [ ] **Step 1: Create get-camera-details.ts**

```typescript
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db.js";

const { cameras, systems } = schema;

export const getCameraDetailsSchema = z.object({
  slug: z.string().describe("Camera slug, e.g. 'nikon-f3'"),
});

export type GetCameraDetailsParams = z.infer<typeof getCameraDetailsSchema>;

export async function getCameraDetails(params: GetCameraDetailsParams) {
  const db = getDb();

  const [result] = await db
    .select({
      name: cameras.name,
      slug: cameras.slug,
      system: systems.name,
      description: cameras.description,
      alias: cameras.alias,
      sensorType: cameras.sensorType,
      sensorSize: cameras.sensorSize,
      megapixels: cameras.megapixels,
      resolution: cameras.resolution,
      yearIntroduced: cameras.yearIntroduced,
      bodyType: cameras.bodyType,
      weightG: cameras.weightG,
      specs: cameras.specs,
      averageRating: cameras.averageRating,
      ratingCount: cameras.ratingCount,
    })
    .from(cameras)
    .leftJoin(systems, eq(cameras.systemId, systems.id))
    .where(eq(cameras.slug, params.slug))
    .limit(1);

  if (!result) {
    return { error: `Camera not found with slug: ${params.slug}` };
  }

  return result;
}
```

- [ ] **Step 2: Create get-lens-details.ts**

```typescript
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db.js";

const { lenses, systems } = schema;

export const getLensDetailsSchema = z.object({
  slug: z.string().describe("Lens slug, e.g. 'canon-ef-50mm-f-1-4-usm'"),
});

export type GetLensDetailsParams = z.infer<typeof getLensDetailsSchema>;

export async function getLensDetails(params: GetLensDetailsParams) {
  const db = getDb();

  const [result] = await db
    .select({
      name: lenses.name,
      slug: lenses.slug,
      brand: lenses.brand,
      system: systems.name,
      description: lenses.description,
      lensType: lenses.lensType,
      era: lenses.era,
      productionStatus: lenses.productionStatus,
      focalLengthMin: lenses.focalLengthMin,
      focalLengthMax: lenses.focalLengthMax,
      apertureMin: lenses.apertureMin,
      apertureMax: lenses.apertureMax,
      weightG: lenses.weightG,
      filterSizeMm: lenses.filterSizeMm,
      minFocusDistanceM: lenses.minFocusDistanceM,
      maxMagnification: lenses.maxMagnification,
      lensElements: lenses.lensElements,
      lensGroups: lenses.lensGroups,
      diaphragmBlades: lenses.diaphragmBlades,
      yearIntroduced: lenses.yearIntroduced,
      yearDiscontinued: lenses.yearDiscontinued,
      isZoom: lenses.isZoom,
      isPrime: lenses.isPrime,
      isMacro: lenses.isMacro,
      hasAutofocus: lenses.hasAutofocus,
      hasStabilization: lenses.hasStabilization,
      specs: lenses.specs,
      averageRating: lenses.averageRating,
      ratingCount: lenses.ratingCount,
    })
    .from(lenses)
    .leftJoin(systems, eq(lenses.systemId, systems.id))
    .where(eq(lenses.slug, params.slug))
    .limit(1);

  if (!result) {
    return { error: `Lens not found with slug: ${params.slug}` };
  }

  return result;
}
```

- [ ] **Step 3: Verify both compile**

Run: `cd /home/florent/lens-db/mcp-server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add mcp-server/src/tools/get-camera-details.ts mcp-server/src/tools/get-lens-details.ts
git commit -m "feat: add get_camera_details and get_lens_details tools"
```

---

## Task 5: Implement get_price tool

**Files:**
- Create: `mcp-server/src/tools/get-price.ts`

- [ ] **Step 1: Create the tool file**

```typescript
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { getDb, schema } from "../db.js";

const { cameras, lenses, priceEstimates, priceHistory } = schema;

export const getPriceSchema = z.object({
  entityType: z.enum(["camera", "lens"]).describe("Type of entity"),
  slug: z.string().describe("Entity slug"),
});

export type GetPriceParams = z.infer<typeof getPriceSchema>;

export async function getPrice(params: GetPriceParams) {
  const db = getDb();

  // Resolve slug to entity ID
  const table = params.entityType === "camera" ? cameras : lenses;
  const [entity] = await db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(eq(table.slug, params.slug))
    .limit(1);

  if (!entity) {
    return { error: `${params.entityType} not found with slug: ${params.slug}` };
  }

  // Get price estimate
  const [estimate] = await db
    .select()
    .from(priceEstimates)
    .where(
      and(
        eq(priceEstimates.entityType, params.entityType),
        eq(priceEstimates.entityId, entity.id)
      )
    )
    .limit(1);

  // Get recent sale history (last 10)
  const history = await db
    .select({
      saleDate: priceHistory.saleDate,
      condition: priceHistory.condition,
      priceUsd: priceHistory.priceUsd,
      source: priceHistory.source,
    })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.entityType, params.entityType),
        eq(priceHistory.entityId, entity.id)
      )
    )
    .orderBy(desc(priceHistory.saleDate))
    .limit(10);

  return {
    name: entity.name,
    estimate: estimate
      ? {
          medianPrice: estimate.medianPrice,
          priceAverageLow: estimate.priceAverageLow,
          priceAverageHigh: estimate.priceAverageHigh,
          priceVeryGoodLow: estimate.priceVeryGoodLow,
          priceVeryGoodHigh: estimate.priceVeryGoodHigh,
          priceMintLow: estimate.priceMintLow,
          priceMintHigh: estimate.priceMintHigh,
          currency: estimate.currency,
          rarity: estimate.rarity,
        }
      : null,
    recentSales: history,
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/florent/lens-db/mcp-server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add mcp-server/src/tools/get-price.ts
git commit -m "feat: add get_price tool function"
```

---

## Task 6: Implement get_system_info and get_compatible_lenses tools

**Files:**
- Create: `mcp-server/src/tools/get-system-info.ts`
- Create: `mcp-server/src/tools/get-compatible-lenses.ts`

- [ ] **Step 1: Create get-system-info.ts**

```typescript
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db.js";

const { systems, cameras, lenses } = schema;

export const getSystemInfoSchema = z.object({
  slug: z.string().describe("System slug, e.g. 'nikon-f'"),
});

export type GetSystemInfoParams = z.infer<typeof getSystemInfoSchema>;

export async function getSystemInfo(params: GetSystemInfoParams) {
  const db = getDb();

  const [system] = await db
    .select()
    .from(systems)
    .where(eq(systems.slug, params.slug))
    .limit(1);

  if (!system) {
    return { error: `System not found with slug: ${params.slug}` };
  }

  const [cameraCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(cameras)
    .where(eq(cameras.systemId, system.id));

  const [lensCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(lenses)
    .where(eq(lenses.systemId, system.id));

  return {
    name: system.name,
    slug: system.slug,
    description: system.description,
    mountType: system.mountType,
    manufacturer: system.manufacturer,
    cameraCount: Number(cameraCount.count),
    lensCount: Number(lensCount.count),
  };
}
```

- [ ] **Step 2: Create get-compatible-lenses.ts**

```typescript
import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { getDb, schema } from "../db.js";

const { cameras, lenses, lensCompatibility, systems } = schema;

export const getCompatibleLensesSchema = z.object({
  cameraSlug: z.string().describe("Camera slug"),
});

export type GetCompatibleLensesParams = z.infer<typeof getCompatibleLensesSchema>;

export async function getCompatibleLenses(params: GetCompatibleLensesParams) {
  const db = getDb();

  const [camera] = await db
    .select({ id: cameras.id, name: cameras.name })
    .from(cameras)
    .where(eq(cameras.slug, params.cameraSlug))
    .limit(1);

  if (!camera) {
    return { error: `Camera not found with slug: ${params.cameraSlug}` };
  }

  const results = await db
    .select({
      name: lenses.name,
      slug: lenses.slug,
      brand: lenses.brand,
      system: systems.name,
      focalLengthMin: lenses.focalLengthMin,
      focalLengthMax: lenses.focalLengthMax,
      apertureMin: lenses.apertureMin,
      isNative: lensCompatibility.isNative,
      notes: lensCompatibility.notes,
    })
    .from(lensCompatibility)
    .innerJoin(lenses, eq(lensCompatibility.lensId, lenses.id))
    .leftJoin(systems, eq(lenses.systemId, systems.id))
    .where(eq(lensCompatibility.cameraId, camera.id))
    .orderBy(asc(lenses.name));

  return {
    camera: camera.name,
    count: results.length,
    lenses: results,
  };
}
```

- [ ] **Step 3: Verify both compile**

Run: `cd /home/florent/lens-db/mcp-server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add mcp-server/src/tools/get-system-info.ts mcp-server/src/tools/get-compatible-lenses.ts
git commit -m "feat: add get_system_info and get_compatible_lenses tools"
```

---

## Task 7: Create tools index and AI SDK wrappers

**Files:**
- Create: `mcp-server/src/tools/index.ts`
- Create: `mcp-server/src/ai-tools.ts`

- [ ] **Step 1: Create tools/index.ts**

```typescript
export { searchCameras, searchCamerasSchema } from "./search-cameras.js";
export { searchLenses, searchLensesSchema } from "./search-lenses.js";
export { getCameraDetails, getCameraDetailsSchema } from "./get-camera-details.js";
export { getLensDetails, getLensDetailsSchema } from "./get-lens-details.js";
export { getPrice, getPriceSchema } from "./get-price.js";
export { getSystemInfo, getSystemInfoSchema } from "./get-system-info.js";
export { getCompatibleLenses, getCompatibleLensesSchema } from "./get-compatible-lenses.js";
```

- [ ] **Step 2: Create ai-tools.ts**

```typescript
import { tool } from "ai";
import {
  searchCameras,
  searchCamerasSchema,
  searchLenses,
  searchLensesSchema,
  getCameraDetails,
  getCameraDetailsSchema,
  getLensDetails,
  getLensDetailsSchema,
  getPrice,
  getPriceSchema,
  getSystemInfo,
  getSystemInfoSchema,
  getCompatibleLenses,
  getCompatibleLensesSchema,
} from "./tools/index.js";

export const mcpTools = {
  search_cameras: tool({
    description:
      "Search for cameras by name, mount system, year, sensor size, or body type. Returns a summary list. Use get_camera_details for full specs.",
    parameters: searchCamerasSchema,
    execute: async (params) => searchCameras(params),
  }),
  search_lenses: tool({
    description:
      "Search for lenses by name, mount system, brand, focal length, aperture, or features. Returns a summary list. Use get_lens_details for full specs.",
    parameters: searchLensesSchema,
    execute: async (params) => searchLenses(params),
  }),
  get_camera_details: tool({
    description:
      "Get full details for a specific camera by slug, including the complete specs JSON. Use this to answer detailed technical questions.",
    parameters: getCameraDetailsSchema,
    execute: async (params) => getCameraDetails(params),
  }),
  get_lens_details: tool({
    description:
      "Get full details for a specific lens by slug, including the complete specs JSON. Use this to answer detailed technical questions.",
    parameters: getLensDetailsSchema,
    execute: async (params) => getLensDetails(params),
  }),
  get_price: tool({
    description:
      "Get second-hand market price estimates and recent sale history for a camera or lens.",
    parameters: getPriceSchema,
    execute: async (params) => getPrice(params),
  }),
  get_system_info: tool({
    description:
      "Get details about a camera mount system, including camera and lens counts.",
    parameters: getSystemInfoSchema,
    execute: async (params) => getSystemInfo(params),
  }),
  get_compatible_lenses: tool({
    description:
      "Find lenses compatible with a specific camera body.",
    parameters: getCompatibleLensesSchema,
    execute: async (params) => getCompatibleLenses(params),
  }),
};
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /home/florent/lens-db/mcp-server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add mcp-server/src/tools/index.ts mcp-server/src/ai-tools.ts
git commit -m "feat: add tools index and AI SDK tool wrappers"
```

---

## Task 8: Create MCP stdio server

**Files:**
- Create: `mcp-server/src/server.ts`

- [ ] **Step 1: Create server.ts**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  searchCameras,
  searchCamerasSchema,
  searchLenses,
  searchLensesSchema,
  getCameraDetails,
  getCameraDetailsSchema,
  getLensDetails,
  getLensDetailsSchema,
  getPrice,
  getPriceSchema,
  getSystemInfo,
  getSystemInfoSchema,
  getCompatibleLenses,
  getCompatibleLensesSchema,
} from "./tools/index.js";

const server = new McpServer({
  name: "lens-db",
  version: "0.1.0",
});

server.registerTool("search_cameras", {
  description:
    "Search for cameras by name, mount system, year, sensor size, or body type. Returns a summary list. Use get_camera_details for full specs.",
  inputSchema: searchCamerasSchema,
}, async (params) => ({
  content: [{ type: "text", text: JSON.stringify(await searchCameras(params), null, 2) }],
}));

server.registerTool("search_lenses", {
  description:
    "Search for lenses by name, mount system, brand, focal length, aperture, or features. Returns a summary list. Use get_lens_details for full specs.",
  inputSchema: searchLensesSchema,
}, async (params) => ({
  content: [{ type: "text", text: JSON.stringify(await searchLenses(params), null, 2) }],
}));

server.registerTool("get_camera_details", {
  description:
    "Get full details for a specific camera by slug, including the complete specs JSON. Use this to answer detailed technical questions.",
  inputSchema: getCameraDetailsSchema,
}, async (params) => ({
  content: [{ type: "text", text: JSON.stringify(await getCameraDetails(params), null, 2) }],
}));

server.registerTool("get_lens_details", {
  description:
    "Get full details for a specific lens by slug, including the complete specs JSON. Use this to answer detailed technical questions.",
  inputSchema: getLensDetailsSchema,
}, async (params) => ({
  content: [{ type: "text", text: JSON.stringify(await getLensDetails(params), null, 2) }],
}));

server.registerTool("get_price", {
  description:
    "Get second-hand market price estimates and recent sale history for a camera or lens.",
  inputSchema: getPriceSchema,
}, async (params) => ({
  content: [{ type: "text", text: JSON.stringify(await getPrice(params), null, 2) }],
}));

server.registerTool("get_system_info", {
  description:
    "Get details about a camera mount system, including camera and lens counts.",
  inputSchema: getSystemInfoSchema,
}, async (params) => ({
  content: [{ type: "text", text: JSON.stringify(await getSystemInfo(params), null, 2) }],
}));

server.registerTool("get_compatible_lenses", {
  description:
    "Find lenses compatible with a specific camera body.",
  inputSchema: getCompatibleLensesSchema,
}, async (params) => ({
  content: [{ type: "text", text: JSON.stringify(await getCompatibleLenses(params), null, 2) }],
}));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

- [ ] **Step 2: Build the project**

Run: `cd /home/florent/lens-db/mcp-server && npx tsc`
Expected: `dist/` directory created with compiled JS files.

- [ ] **Step 3: Commit**

```bash
git add mcp-server/src/server.ts
git commit -m "feat: add MCP stdio server entry point"
```

---

## Task 9: Add chatbot API route

**Files:**
- Modify: `frontend/package.json` (add `@ai-sdk/gateway`)
- Modify: `frontend/src/lib/rate-limit.ts` (add chat limiter)
- Create: `frontend/src/app/api/chat/route.ts`

- [ ] **Step 1: Install @ai-sdk/gateway**

Run: `cd /home/florent/lens-db/frontend && pnpm add @ai-sdk/gateway`
Expected: Package added to `package.json`.

- [ ] **Step 2: Add chat rate limiter**

Add to `frontend/src/lib/rate-limit.ts`, inside the `rateLimiters` object:

```typescript
  chat: createRateLimit(10, "60 s"),
```

- [ ] **Step 3: Create the chat API route**

```typescript
import { streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { NextRequest } from "next/server";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";
import { mcpTools } from "../../../mcp-server/src/ai-tools.js";

const SYSTEM_PROMPT = `You are a helpful assistant for The Lens DB, a database of camera lenses, cameras, and mount systems.

You have access to tools that query a database containing:
- 7,400+ lenses with detailed specifications
- 1,000+ cameras with detailed specifications
- 130+ mount systems
- Second-hand market pricing data (median prices, condition-based ranges, recent eBay sales)

How to answer questions:
1. Use search tools first to find matching entities. Use the system name (e.g. "Nikon F", "Canon EF") not the brand name when filtering by mount system.
2. If you need detailed specs to answer a question, use get_camera_details or get_lens_details to read the full specs JSON.
3. For pricing questions, use get_price to get current market estimates and recent sales.
4. Always cite specific data from tool results. Do not guess or rely on training data for specs or prices.
5. If a search returns no results, try broadening the query or suggest alternatives.
6. Keep responses concise and factual. Use tables when comparing multiple items.

The specs JSON field contains detailed technical data not available as top-level columns — always check it for nuanced technical questions (e.g. autofocus type, shutter speed range, viewfinder details).`;

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const { success } = await rateLimiters.chat.limit(ip);
  if (!success) return rateLimitedResponse();

  const { messages } = await request.json();

  const result = streamText({
    model: gateway("anthropic/claude-sonnet-4-5"),
    system: SYSTEM_PROMPT,
    messages,
    tools: mcpTools,
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd /home/florent/lens-db/frontend && npx tsc --noEmit`
Expected: No errors. Note: the import path from the mcp-server package may need adjustment — if TypeScript can't resolve `../../../mcp-server/src/ai-tools.js`, configure the path in `tsconfig.json` or use a workspace reference. Adjust as needed.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src/lib/rate-limit.ts frontend/src/app/api/chat/route.ts
git commit -m "feat: add chatbot API route with AI Gateway and MCP tools"
```

---

## Task 10: Build chat UI

**Files:**
- Create: `frontend/src/app/chat/page.tsx`
- Create: `frontend/src/components/ChatInterface.tsx`

- [ ] **Step 1: Create ChatInterface.tsx (client component)**

```tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { Send } from "lucide-react";

export default function ChatInterface() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({ api: "/api/chat" });

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-3xl mx-auto">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 dark:text-zinc-400 mt-20">
            <p className="text-lg font-medium mb-2">Ask me anything about cameras and lenses</p>
            <div className="space-y-1 text-sm">
              <p>&ldquo;Which Nikon F camera was the first with autofocus?&rdquo;</p>
              <p>&ldquo;What&apos;s the cheapest Sony E mount camera on the second-hand market?&rdquo;</p>
              <p>&ldquo;Compare 50mm f/1.4 lenses for Canon EF&rdquo;</p>
            </div>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
                message.role === "user"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-500">
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="text-red-500 text-sm mb-2 text-center">
          Something went wrong. Please try again.
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-zinc-200 dark:border-zinc-700 pt-4">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask about cameras, lenses, prices..."
          className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create chat/page.tsx**

```tsx
import { Metadata } from "next";
import ChatInterface from "@/components/ChatInterface";

export const metadata: Metadata = {
  title: "Chat | The Lens DB",
  description: "Ask questions about cameras, lenses, and mount systems",
};

export default function ChatPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Chat with The Lens DB</h1>
      <ChatInterface />
    </main>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /home/florent/lens-db/frontend && npx tsc --noEmit`
Expected: No errors. If `@ai-sdk/react` is not installed (it should come with `ai`), install it: `pnpm add @ai-sdk/react`.

- [ ] **Step 4: Test locally**

Run: `cd /home/florent/lens-db/frontend && pnpm dev`

1. Open `http://localhost:3000/chat` in browser
2. Verify the empty state renders with example questions
3. Type "What cameras use the Nikon F mount?" and submit
4. Verify a streaming response appears with camera data from the database
5. Try a pricing query: "How much is a Canon AE-1 worth?"
6. Try a detailed specs query: "Which Nikon F camera was the first with autofocus?"

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/chat/page.tsx frontend/src/components/ChatInterface.tsx
git commit -m "feat: add chat page and interface component"
```

---

## Task 11: Add chat link to navigation

**Files:**
- Modify: `frontend/src/components/header-nav.tsx:9-17` (desktop nav links array)
- Modify: `frontend/src/components/mobile-nav.tsx:11-19` (mobile nav links array)

- [ ] **Step 1: Add Chat to header-nav.tsx navLinks array**

In `frontend/src/components/header-nav.tsx`, add to the `navLinks` array after the Submit entry:

```typescript
  { href: "/chat", label: "Chat" },
```

- [ ] **Step 2: Add Chat to mobile-nav.tsx navLinks array**

In `frontend/src/components/mobile-nav.tsx`, add to the `navLinks` array after the Submit entry (before Search):

```typescript
  { href: "/chat", label: "Chat" },
```

- [ ] **Step 3: Verify the link renders**

Open `http://localhost:3000` and confirm the Chat link appears in both desktop and mobile navigation, and navigates to `/chat`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/header-nav.tsx frontend/src/components/mobile-nav.tsx
git commit -m "feat: add Chat link to site navigation"
```

---

## Task 12: Add .gitignore and environment setup

**Files:**
- Create: `mcp-server/.gitignore`
- Modify: `frontend/.env.example` (if it exists, add `AI_GATEWAY_API_KEY`)

- [ ] **Step 1: Create mcp-server/.gitignore**

```
node_modules/
dist/
.env
```

- [ ] **Step 2: Add AI_GATEWAY_API_KEY to .env.example**

Add this line to `frontend/.env.example`:

```
AI_GATEWAY_API_KEY=        # Vercel AI Gateway API key (required for /chat)
```

- [ ] **Step 3: Commit**

```bash
git add mcp-server/.gitignore frontend/.env.example
git commit -m "chore: add mcp-server gitignore and AI Gateway env var docs"
```

---

## Task 13: End-to-end verification

- [ ] **Step 1: Verify MCP stdio server works**

Run: `cd /home/florent/lens-db/mcp-server && DATABASE_URL="<connection-string>" node dist/server.js`

The server should start and wait for MCP protocol messages on stdin. Ctrl+C to exit. No errors on startup.

- [ ] **Step 2: Verify chatbot end-to-end**

With `pnpm dev` running and `AI_GATEWAY_API_KEY` set in `.env.local`:

1. Open `/chat`
2. Ask: "What Nikon 1 cameras are available?"
3. Verify the response lists cameras from the database
4. Ask: "Which one is the cheapest on the second-hand market?"
5. Verify it calls `get_price` for the cameras and compares prices
6. Ask: "Tell me more about the Nikon F mount"
7. Verify it calls `get_system_info`

- [ ] **Step 3: Verify rate limiting**

Send 11 rapid requests to `/api/chat` and confirm the 11th returns 429.
