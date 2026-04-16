import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' https://pub-452f806914084c1384d3fafe70f6be32.r2.dev https://web.archive.org https://i.ebayimg.com data:; font-src 'self'; connect-src 'self' https://va.vercel-scripts.com; frame-ancestors 'none';",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  transpilePackages: ["lens-db-mcp-server"],
  async redirects() {
    return [
      // Merged Canon EOS system slugs → mount-named equivalents
      { source: "/systems/canon-eos", destination: "/systems/canon-ef", permanent: true },
      { source: "/systems/canon-eos-aps-c", destination: "/systems/canon-ef-s", permanent: true },
      { source: "/systems/canon-eos-m", destination: "/systems/canon-ef-m", permanent: true },
      { source: "/systems/canon-eos-r", destination: "/systems/canon-rf", permanent: true },
      { source: "/systems/canon-eos-r-aps-c", destination: "/systems/canon-rf-s", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-452f806914084c1384d3fafe70f6be32.r2.dev",
      },
    ],
  },
};

export default withBotId(nextConfig);
