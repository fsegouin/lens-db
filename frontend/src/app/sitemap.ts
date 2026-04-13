import type { MetadataRoute } from "next";
import { db } from "@/db";
import { lenses, cameras, systems, collections, lensSeries } from "@/db/schema";
import { isNull } from "drizzle-orm";

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
    { url: `${baseUrl}/compare`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/search`, changeFrequency: "monthly", priority: 0.6 },
  ];

  // Fetch all slugs in parallel (only non-merged entities)
  const [lensRows, cameraRows, systemRows, collectionRows, seriesRows] =
    await Promise.all([
      db
        .select({ slug: lenses.slug })
        .from(lenses)
        .where(isNull(lenses.mergedIntoId)),
      db
        .select({ slug: cameras.slug })
        .from(cameras)
        .where(isNull(cameras.mergedIntoId)),
      db.select({ slug: systems.slug }).from(systems),
      db.select({ slug: collections.slug }).from(collections),
      db.select({ slug: lensSeries.slug }).from(lensSeries),
    ]);

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
    ...systemPages,
    ...collectionPages,
    ...seriesPages,
  ];
}
