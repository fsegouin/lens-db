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
} from "./tools/index";

export const mcpTools = {
  search_cameras: tool({
    description:
      "Search for cameras by name, mount system, year, sensor size, or body type. Returns a summary list. Use get_camera_details for full specs.",
    inputSchema: searchCamerasSchema,
    execute: async (params) => searchCameras(params),
  }),
  search_lenses: tool({
    description:
      "Search for lenses by name, mount system, brand, focal length, aperture, or features. Returns a summary list. Use get_lens_details for full specs.",
    inputSchema: searchLensesSchema,
    execute: async (params) => searchLenses(params),
  }),
  get_camera_details: tool({
    description:
      "Get full details for a specific camera by slug, including the complete specs JSON. Use this to answer detailed technical questions.",
    inputSchema: getCameraDetailsSchema,
    execute: async (params) => getCameraDetails(params),
  }),
  get_lens_details: tool({
    description:
      "Get full details for a specific lens by slug, including the complete specs JSON. Use this to answer detailed technical questions.",
    inputSchema: getLensDetailsSchema,
    execute: async (params) => getLensDetails(params),
  }),
  get_price: tool({
    description:
      "Get second-hand market price estimates and recent sale history for a camera or lens.",
    inputSchema: getPriceSchema,
    execute: async (params) => getPrice(params),
  }),
  get_system_info: tool({
    description:
      "Get details about a camera mount system, including camera and lens counts.",
    inputSchema: getSystemInfoSchema,
    execute: async (params) => getSystemInfo(params),
  }),
  get_compatible_lenses: tool({
    description:
      "Find lenses compatible with a specific camera body.",
    inputSchema: getCompatibleLensesSchema,
    execute: async (params) => getCompatibleLenses(params),
  }),
};
