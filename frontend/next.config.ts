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
      // Camera slugs used to carry a literal "camera/" segment from the
      // original scrape (migration 0023 strips it). Every existing link and
      // search result points at the old path.
      {
        source: "/cameras/camera/:slug",
        destination: "/cameras/:slug",
        permanent: true,
      },
      // Merged Canon EOS system slugs → mount-named equivalents
      { source: "/systems/canon-eos", destination: "/systems/canon-ef", permanent: true },
      { source: "/systems/canon-eos-aps-c", destination: "/systems/canon-ef", permanent: true },
      { source: "/systems/canon-eos-m", destination: "/systems/canon-ef-m", permanent: true },
      { source: "/systems/canon-eos-r", destination: "/systems/canon-rf", permanent: true },
      { source: "/systems/canon-eos-r-aps-c", destination: "/systems/canon-rf", permanent: true },
      // Unified APS-C systems → full-frame parent mounts (drizzle 0012)
      { source: "/systems/canon-ef-s", destination: "/systems/canon-ef", permanent: true },
      { source: "/systems/canon-rf-s", destination: "/systems/canon-rf", permanent: true },
      { source: "/systems/nikon-z-aps-c", destination: "/systems/nikon-z", permanent: true },
      { source: "/systems/nikon-f-aps-c", destination: "/systems/nikon-f", permanent: true },
      { source: "/systems/sony-e-aps-c", destination: "/systems/sony-e", permanent: true },
      { source: "/systems/sony-a-aps-c", destination: "/systems/minoltasony-a", permanent: true },
      { source: "/systems/konica-minolta-a-aps-c", destination: "/systems/minoltasony-a", permanent: true },
      { source: "/systems/pentax-k-aps-c", destination: "/systems/pentax-k", permanent: true },
      { source: "/systems/sigma-sa-aps-c", destination: "/systems/sigma-sa", permanent: true },
      { source: "/systems/leica-l-aps-c", destination: "/systems/leica-l", permanent: true },
      // Collections that were really product lines or mounts, moved into
      // lens_series and systems by scripts/collections-to-series-and-systems.mjs.
      // These cannot live in collection_redirects: that table points at a
      // collection, and none of these destinations is one.
      { source: "/collections/canon-l-series-lenses", destination: "/lenses/series/canon-l", permanent: true },
      { source: "/collections/pentax-star-lenses", destination: "/lenses/series/pentax-star", permanent: true },
      { source: "/collections/sigma-ys-lenses", destination: "/lenses/series/sigma-xq-ys", permanent: true },
      { source: "/collections/tamron-f-system-lenses", destination: "/lenses/series/tamron-f", permanent: true },
      { source: "/collections/sigma-global-vision", destination: "/lenses/series/sigma-global-vision", permanent: true },
      { source: "/collections/t-mount-lenses", destination: "/systems/t-mount-t2", permanent: true },
      { source: "/collections/komura-unidapter", destination: "/systems/komura-unidapter", permanent: true },
      { source: "/collections/tamron-adaptall-2-lenses", destination: "/systems/tamron-adaptall-2", permanent: true },
      { source: "/collections/tamron-adaptall-lenses", destination: "/systems/tamron-adaptall", permanent: true },
      { source: "/collections/tamron-adapt-a-matic-lenses", destination: "/systems/tamron-adapt-a-matic", permanent: true },
      // The three Tamron slugs above were themselves merge targets, so these
      // older slugs redirected to them through collection_redirects. That row
      // cascaded away with the collection, so they are re-homed here rather
      // than left to 404.
      { source: "/collections/tamron-adaptall-2", destination: "/systems/tamron-adaptall-2", permanent: true },
      { source: "/collections/tamron-adaptall", destination: "/systems/tamron-adaptall", permanent: true },
      { source: "/collections/tamron-adapt-a-matic", destination: "/systems/tamron-adapt-a-matic", permanent: true },
      // same-optical-design became a lens-to-lens relation rather than a set,
      // because it was always a claim about pairs and a collection cannot say
      // which two. Each of its lenses now names its own twin on its own page,
      // so there is no single page to land on; the index is the honest target.
      { source: "/collections/same-optical-design", destination: "/collections", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // Account and tool pages are useful to visitors but must not compete
      // with entity pages in search results. Set as a header because these
      // are client components, which cannot export metadata.
      {
        source: "/:path(login|register|verify-email|submit|chat)",
        headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }],
      },
      {
        source: "/history/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }],
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
