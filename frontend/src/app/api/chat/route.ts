import { streamText, convertToModelMessages, UIMessage, stepCountIs } from "ai";
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
1. Use search tools to find matching entities. A mount system (e.g. "Nikon F") includes cameras from MANY brands (Nikon, Fujifilm, Kodak, etc.). When the user asks about a specific brand's cameras, ALWAYS use the 'query' parameter to filter by brand name (e.g. query: "Nikon") in addition to the system filter.
2. If you need detailed specs to answer a question, use get_camera_details or get_lens_details to read the full specs JSON.
3. For pricing questions, use get_price to get current market estimates and recent sales.
4. Always cite specific data from tool results. Do not guess or rely on training data for specs or prices.
5. If a search returns no results, try broadening the query or suggest alternatives.
6. Keep responses concise and factual. Use tables when comparing multiple items.
7. Do NOT repeat the same tool call with the same parameters. If results don't contain what you need, refine your query.

The specs JSON field contains detailed technical data not available as top-level columns — always check it for nuanced technical questions (e.g. autofocus type, shutter speed range, viewfinder details).`;

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const { success } = await rateLimiters.chat.limit(ip);
  if (!success) return rateLimitedResponse();

  const body = await request.json();
  const allMessages: UIMessage[] = body.messages ?? [body.message];

  const result = streamText({
    model: gateway("google/gemini-2.5-flash"),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(allMessages),
    tools: mcpTools,
    stopWhen: stepCountIs(10),
  });

  return result.toUIMessageStreamResponse();
}
