import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getCameraDetails,
  getCameraDetailsSchema,
  getCompatibleLenses,
  getCompatibleLensesSchema,
  getLensDetails,
  getLensDetailsSchema,
  getSystemInfo,
  getSystemInfoSchema,
  searchCameras,
  searchCamerasSchema,
  searchLenses,
  searchLensesSchema,
} from "lens-db-mcp-server/tools";

export const maxDuration = 60;

/**
 * The database as an MCP server, over HTTP.
 *
 * The stdio server in mcp-server/ needs database credentials, so it can only
 * ever run on a machine that has them. This is the same tools reachable by
 * anyone, which is what "publishing the MCP server" has to mean.
 *
 * It implements the stateless profile of the Streamable HTTP transport: every
 * request carries a whole JSON-RPC message and gets a whole answer back. There
 * is no session and nothing is pushed from the server, which these tools never
 * need, and it means an instance holds no state between requests.
 *
 * get_price is deliberately not exposed. Used prices are derived from eBay
 * completed listings, which this site may show but may not redistribute, and a
 * machine-readable feed of them is redistribution.
 */

const PROTOCOL_VERSION = "2025-06-18";

type Tool = {
  name: string;
  description: string;
  schema: z.ZodType;
  run: (params: never) => Promise<unknown>;
};

const TOOLS: Tool[] = [
  {
    name: "search_lenses",
    description:
      "Search lenses by name, mount, brand, focal length, aperture or features. Returns a summary list; use get_lens_details for full specifications.",
    schema: searchLensesSchema,
    run: searchLenses as (p: never) => Promise<unknown>,
  },
  {
    name: "search_cameras",
    description:
      "Search camera bodies by name, mount, year, sensor size or body type. Returns a summary list; use get_camera_details for full specifications.",
    schema: searchCamerasSchema,
    run: searchCameras as (p: never) => Promise<unknown>,
  },
  {
    name: "get_lens_details",
    description: "Full details for one lens, by the slug in its page URL.",
    schema: getLensDetailsSchema,
    run: getLensDetails as (p: never) => Promise<unknown>,
  },
  {
    name: "get_camera_details",
    description: "Full details for one camera body, by the slug in its page URL.",
    schema: getCameraDetailsSchema,
    run: getCameraDetails as (p: never) => Promise<unknown>,
  },
  {
    name: "get_system_info",
    description:
      "A mount system: its flange focal distance, and how many lenses and bodies use it.",
    schema: getSystemInfoSchema,
    run: getSystemInfo as (p: never) => Promise<unknown>,
  },
  {
    name: "get_compatible_lenses",
    description: "The lenses that mount natively on a given camera body.",
    schema: getCompatibleLensesSchema,
    run: getCompatibleLenses as (p: never) => Promise<unknown>,
  },
];

const byName = new Map(TOOLS.map((t) => [t.name, t]));

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, MCP-Protocol-Version",
    "Cache-Control": "no-store",
  };
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/** A GET here is someone opening the URL, so say what it is. */
export function GET() {
  return NextResponse.json(
    {
      name: "lens-db",
      transport: "Streamable HTTP, stateless",
      protocolVersion: PROTOCOL_VERSION,
      usage: "POST JSON-RPC 2.0 messages to this URL.",
      tools: TOOLS.map((t) => t.name),
      documentation: "https://thelensdb.com/developers",
    },
    { headers: corsHeaders() },
  );
}

function rpcResult(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, { headers: corsHeaders() });
}

function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { headers: corsHeaders() },
  );
}

export async function POST(request: NextRequest) {
  let message: { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
  try {
    message = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { id = null, method, params } = message;
  if (typeof method !== "string") return rpcError(id, -32600, "Invalid Request");

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "lens-db", version: "1.0.0" },
        instructions:
          "The Lens DB: 9,257 lenses, 2,187 camera bodies and 132 mounts, including the flange focal distance that decides what adapts onto what. Used prices are not available here.",
      });

    // Notifications carry no id and expect no response body.
    case "notifications/initialized":
    case "notifications/cancelled":
      return new NextResponse(null, { status: 202, headers: corsHeaders() });

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: z.toJSONSchema(t.schema, { io: "input" }),
        })),
      });

    case "tools/call": {
      const call = params as { name?: string; arguments?: unknown } | undefined;
      const tool = call?.name ? byName.get(call.name) : undefined;
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${call?.name ?? "(none)"}`);

      const parsed = tool.schema.safeParse(call?.arguments ?? {});
      if (!parsed.success) {
        // A tool error is a result rather than a protocol error, so the model
        // sees what it got wrong instead of the conversation failing.
        return rpcResult(id, {
          isError: true,
          content: [
            { type: "text", text: `Invalid arguments: ${parsed.error.message}` },
          ],
        });
      }

      try {
        const out = await tool.run(parsed.data as never);
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        });
      } catch (error) {
        console.error(`MCP tool ${tool.name} failed:`, error);
        return rpcResult(id, {
          isError: true,
          content: [{ type: "text", text: "That query could not be run." }],
        });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}
