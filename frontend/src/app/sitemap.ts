import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { lenses, cameras, systems, collections, lensSeries } from "@/db/schema";
import { getBrands } from "@/lib/brands";
import { isNull } from "drizzle-orm";

const getSitemapSlugs = unstable_cache(
  async () => {
    const [lensRows, cameraRows, systemRows, collectionRows, seriesRows] =
      await Promise.all([
        db
          .select({ slug: lenses.slug })
          .from(lenses)
          .where(isNull(lenses.mergedIntoId)),
        db
          .select({ slug: cameras.slug, systemId: cameras.systemId })
          .from(cameras)
          .where(isNull(cameras.mergedIntoId)),
        db.select({ slug: systems.slug }).from(systems),
        db.select({ slug: collections.slug }).from(collections),
        db.select({ slug: lensSeries.slug }).from(lensSeries),
      ]);
    return { lensRows, cameraRows, systemRows, collectionRows, seriesRows };
  },
  ["sitemap-slugs"],
  { revalidate: 604800, tags: ["lenses"] },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://thelensdb.com";

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: "weekly", priority: 1.0 },
    { url: `${baseUrl}/lenses`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/cameras`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/systems`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/collections`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/lenses/series`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/brands`, changeFrequency: "monthly", priority: 0.8 },
  ];

  const [{ lensRows, cameraRows, systemRows, collectionRows, seriesRows }, brands] =
    await Promise.all([getSitemapSlugs(), getBrands()]);

  const brandPages: MetadataRoute.Sitemap = brands.map((b) => ({
    url: `${baseUrl}/brands/${b.slug}`,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const lensPages: MetadataRoute.Sitemap = lensRows.map((r) => ({
    url: `${baseUrl}/lenses/${r.slug}`,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const cameraPages: MetadataRoute.Sitemap = cameraRows.map((r) => ({
    url: `${baseUrl}/cameras/${r.slug}`,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  // "Lenses for <camera>" exists only where a mount is recorded.
  const cameraLensPages: MetadataRoute.Sitemap = cameraRows
    .filter((r) => r.systemId != null)
    .map((r) => ({
      url: `${baseUrl}/cameras/${r.slug}/lenses`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  const systemPages: MetadataRoute.Sitemap = systemRows.map((r) => ({
    url: `${baseUrl}/systems/${r.slug}`,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const collectionPages: MetadataRoute.Sitemap = collectionRows.map((r) => ({
    url: `${baseUrl}/collections/${r.slug}`,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const seriesPages: MetadataRoute.Sitemap = seriesRows.map((r) => ({
    url: `${baseUrl}/lenses/series/${r.slug}`,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    ...staticPages,
    ...lensPages,
    ...cameraPages,
    ...cameraLensPages,
    ...systemPages,
    ...collectionPages,
    ...seriesPages,
    ...brandPages,
  ];
}
