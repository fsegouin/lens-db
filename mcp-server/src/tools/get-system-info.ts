import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";

const { systems, cameras, lenses } = schema;

export const getSystemInfoSchema = z.object({
  slug: z.string().describe("System slug, e.g. 'nikon-f'"),
});

export type GetSystemInfoParams = z.infer<typeof getSystemInfoSchema>;

export async function getSystemInfo(params: GetSystemInfoParams) {
  const db = getDb();

  const [system] = await db
    .select()
    .from(systems)
    .where(eq(systems.slug, params.slug))
    .limit(1);

  if (!system) {
    return { error: `System not found with slug: ${params.slug}` };
  }

  const [cameraCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(cameras)
    .where(eq(cameras.systemId, system.id));

  const [lensCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(lenses)
    .where(eq(lenses.systemId, system.id));

  return {
    name: system.name,
    slug: system.slug,
    description: system.description,
    mountType: system.mountType,
    manufacturer: system.manufacturer,
    cameraCount: Number(cameraCount.count),
    lensCount: Number(lensCount.count),
  };
}
