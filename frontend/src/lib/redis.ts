import { Redis } from "@upstash/redis";

const isDev = process.env.NODE_ENV === "development";

export const redis = isDev
  ? null
  : new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });
