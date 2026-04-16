import { streamText, stepCountIs } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { NextRequest } from "next/server";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";
import { mcpTools } from "lens-db-mcp-server/ai-tools";

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
    stopWhen: stepCountIs(5),
  });

  return result.toTextStreamResponse();
}
