# MCP Server + Chatbot Design

## Goal

Expose the lens-db database (cameras, lenses, systems, pricing) through an MCP server so it can be consumed by:

1. A chatbot embedded on lensdb.com (via Vercel AI SDK + AI Gateway)
2. Claude Desktop, ChatGPT, or other MCP-compatible clients (via stdio transport)

Users should be able to ask natural language questions like:
- "Which Nikon 1 camera is the cheapest on the second hand market?"
- "Which Nikon F camera was the first to have autofocus?"
- "What 50mm f/1.4 lenses are available for Sony E mount?"
- "Compare the Canon AE-1 and Nikon FM2 prices"

## Architecture

### Shared Tool Core + Dual Interface

```
mcp-server/
├── src/
│   ├── tools/              # Pure tool logic (async functions)
│   │   ├── search-cameras.ts
│   │   ├── search-lenses.ts
│   │   ├── get-camera-details.ts
│   │   ├── get-lens-details.ts
│   │   ├── get-price.ts
│   │   ├── get-system-info.ts
│   │   └── get-compatible-lenses.ts
│   ├── db.ts               # Neon/Drizzle connection (imports schema from frontend)
│   ├── server.ts           # MCP server entry point (stdio transport)
│   └── ai-tools.ts         # AI SDK tool() wrappers for chatbot use
├── package.json
├── tsconfig.json
└── README.md
```

Tool functions are plain TypeScript async functions that accept validated params and return structured data. They are wrapped in two thin layers:

- **MCP server** (`server.ts`): `registerTool()` with Zod schemas, stdio transport. For CLI/desktop clients.
- **AI SDK tools** (`ai-tools.ts`): `tool()` from the `ai` package with the same Zod schemas. Imported directly by the chatbot API route — no protocol overhead, works on Vercel serverless.

### Data flow

```
[Chatbot UI] → POST /api/chat → streamText(gateway model, ai-tools) → tool functions → Neon DB
[Claude Desktop] → stdio → MCP server → tool functions → Neon DB
```

### Chatbot API route

```
frontend/src/app/api/chat/route.ts
```

- Uses `streamText()` from `ai` package
- Model via `gateway()` from `@ai-sdk/gateway` (Vercel AI Gateway)
- Tools imported from `mcp-server/src/ai-tools.ts`
- System prompt instructs the LLM about the database and how to use tools
- Streams responses back to the client

### Chatbot UI

A dedicated `/chat` page with a simple conversational interface:
- Message list (user + assistant messages)
- Text input with submit
- Streaming response display
- No auth required (public access)
- Rate limited via Upstash Redis (same pattern as existing API routes)

## Tools

### search_cameras

Find cameras matching filters. Returns a summary list (name, system, year, sensor, body type, key specs).

**Params:**
- `query` (string, optional) — free text search on name
- `system` (string, optional) — mount system name (e.g. "Nikon F", "Canon EF")
- `brand` (string, optional) — manufacturer
- `yearFrom` / `yearTo` (number, optional) — year introduced range
- `sensorSize` (string, optional) — e.g. "Full Frame", "APS-C"
- `bodyType` (string, optional) — e.g. "SLR", "Mirrorless", "Rangefinder"
- `limit` (number, optional, default 20, max 50)

### search_lenses

Find lenses matching filters. Returns a summary list (name, system, focal length, aperture, features).

**Params:**
- `query` (string, optional) — free text search on name
- `system` (string, optional) — mount system name
- `brand` (string, optional) — manufacturer
- `focalLengthMin` / `focalLengthMax` (number, optional) — focal length range in mm
- `apertureMax` (number, optional) — maximum aperture (e.g. 1.4)
- `isZoom` / `isPrime` / `isMacro` (boolean, optional)
- `hasAutofocus` / `hasStabilization` (boolean, optional)
- `yearFrom` / `yearTo` (number, optional)
- `limit` (number, optional, default 20, max 50)

### get_camera_details

Full details for a specific camera, including the complete `specs` JSONB field. The LLM reads this JSON to answer detailed questions (e.g. autofocus type, shutter speed range, viewfinder coverage).

**Params:**
- `slug` (string) — camera slug (e.g. "nikon-f3")

**Returns:** All camera columns + system name + full specs JSON.

### get_lens_details

Full details for a specific lens, including the complete `specs` JSONB field.

**Params:**
- `slug` (string) — lens slug

**Returns:** All lens columns + system name + full specs JSON.

### get_price

Price estimate and recent sale history for a camera or lens.

**Params:**
- `entityType` ("camera" | "lens")
- `slug` (string) — entity slug

**Returns:**
- From `priceEstimates`: average/very good/mint price ranges, median price, rarity
- From `priceHistory`: last 10 sales (date, condition, price, source)

### get_system_info

Mount system details with counts of associated cameras and lenses.

**Params:**
- `slug` (string) — system slug (e.g. "nikon-f")

**Returns:** System fields + count of cameras + count of lenses.

### get_compatible_lenses

Lenses compatible with a given camera body.

**Params:**
- `cameraSlug` (string) — camera slug

**Returns:** List of compatible lenses with `isNative` flag, plus basic lens info (name, focal length, aperture).

## System Prompt

The chatbot system prompt will:
- Describe the database contents (cameras, lenses, systems, pricing data)
- Instruct the LLM to use search tools first to find entities, then detail tools for specific questions
- Tell the LLM that the `specs` JSONB field contains detailed specifications not available as top-level columns — it should read this field for nuanced questions
- Instruct the LLM to cite specific data from tool results rather than relying on training knowledge
- Keep responses concise and factual

## Dependencies

### New packages (mcp-server/)
- `@modelcontextprotocol/sdk` — MCP server SDK
- `zod` — schema validation (already in frontend, but needed as direct dependency)
- `@neondatabase/serverless` — DB client
- `drizzle-orm` — ORM

### New packages (frontend/)
- `@ai-sdk/gateway` — Vercel AI Gateway provider
- `@ai-sdk/mcp` — only needed if we later add MCP client transport; not needed for v1

### Existing packages (already installed)
- `ai` — Vercel AI SDK (already in frontend/package.json)

## Environment Variables

### New
- `AI_GATEWAY_API_KEY` — Vercel AI Gateway API key (frontend, for chatbot)

### Existing (reused by mcp-server)
- `DATABASE_URL` — Neon PostgreSQL connection string

## Rate Limiting

The `/api/chat` endpoint will be rate limited via Upstash Redis, matching existing patterns:
- Suggested limit: 10 requests per 60 seconds per IP
- Uses the same `rateLimitedResponse` helper from `src/lib/api-utils.ts`

## Security

- Chatbot API route runs server-side only — tool functions never execute on the client
- No database credentials are exposed to the frontend
- The MCP stdio server is a local-only interface (no network exposure)
- Rate limiting prevents abuse of the chatbot endpoint
- No auth required for the chatbot (public feature), but rate limits cap usage

## Out of Scope (v1)

- Conversation history / persistence (each request is stateless)
- User authentication for chat
- Image display in chat responses
- Writing/modifying data through chat (read-only)
- Lens comparison tool (can be added later)
- Collection browsing tool (can be added later)
