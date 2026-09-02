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
} from "./tools/index";
import { closeDb } from "./db";

const server = new McpServer({
  name: "lens-db",
  version: "0.1.0",
});

server.registerTool("search_cameras",
  {
    description: "Search for cameras by name, mount system, year, sensor size, or body type. Returns a summary list. Use get_camera_details for full specs.",
    inputSchema: searchCamerasSchema,
  },
  async (params) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await searchCameras(params), null, 2) }],
  })
);

server.registerTool("search_lenses",
  {
    description: "Search for lenses by name, mount system, brand, focal length, aperture, or features. Returns a summary list. Use get_lens_details for full specs.",
    inputSchema: searchLensesSchema,
  },
  async (params) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await searchLenses(params), null, 2) }],
  })
);

server.registerTool("get_camera_details",
  {
    description: "Get full details for a specific camera by slug, including the complete specs JSON. Use this to answer detailed technical questions.",
    inputSchema: getCameraDetailsSchema,
  },
  async (params) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await getCameraDetails(params), null, 2) }],
  })
);

server.registerTool("get_lens_details",
  {
    description: "Get full details for a specific lens by slug, including the complete specs JSON. Use this to answer detailed technical questions.",
    inputSchema: getLensDetailsSchema,
  },
  async (params) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await getLensDetails(params), null, 2) }],
  })
);

server.registerTool("get_price",
  {
    description: "Get second-hand market price estimates and recent sale history for a camera or lens.",
    inputSchema: getPriceSchema,
  },
  async (params) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await getPrice(params), null, 2) }],
  })
);

server.registerTool("get_system_info",
  {
    description: "Get details about a camera mount system, including camera and lens counts.",
    inputSchema: getSystemInfoSchema,
  },
  async (params) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await getSystemInfo(params), null, 2) }],
  })
);

server.registerTool("get_compatible_lenses",
  {
    description: "Find lenses compatible with a specific camera body.",
    inputSchema: getCompatibleLensesSchema,
  },
  async (params) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await getCompatibleLenses(params), null, 2) }],
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdin EOF is the only portable shutdown signal for stdio servers; the SDK
  // does not exit for us, and an open pg pool would otherwise keep the process
  // alive until the client escalates to SIGKILL.
  let shuttingDown = false;
  const shutdown = async (code: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await server.close();
      await closeDb();
    } catch (error) {
      console.error(error);
    } finally {
      process.exit(code);
    }
  };
  process.stdin.on("end", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));
  process.on("SIGINT", () => void shutdown(0));
}

main().catch(console.error);
