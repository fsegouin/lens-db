import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { cameras, lenses, lensSystems, systems } from "@/db/schema";

export type Mount = {
  id: number;
  name: string;
  slug: string;
  flangeDistanceMm: number | null;
  wikidataQid?: string | null;
};

export type AdaptVerdict =
  | { kind: "native"; summary: string; detail: string }
  | { kind: "adapts"; gapMm: number; summary: string; detail: string }
  | { kind: "tight"; gapMm: number; summary: string; detail: string }
  | { kind: "optics"; gapMm: number; summary: string; detail: string }
  | { kind: "unknown"; summary: string; detail: string };

/**
 * A plain adapter is a spacer: it can only ever add distance between lens and
 * sensor. So a lens reaches infinity focus on another mount when its own
 * register is the longer one, and the difference is the room the adapter has
 * to occupy. Less room than a mount flange needs and no adapter can be built;
 * a negative difference needs corrective glass, which costs image quality.
 *
 * This is the reasoning photographers re-derive by hand in every forum thread.
 * It is stated here from the registers rather than left as folklore.
 */
const MIN_ADAPTER_THICKNESS_MM = 1;

export function adaptVerdict(lensMount: Mount, bodyMount: Mount): AdaptVerdict {
  if (lensMount.id === bodyMount.id) {
    return {
      kind: "native",
      summary: "Fits natively",
      detail: `Same mount, so no adapter is involved.`,
    };
  }

  const a = lensMount.flangeDistanceMm;
  const b = bodyMount.flangeDistanceMm;
  if (a == null || b == null) {
    const missing = a == null ? lensMount.name : bodyMount.name;
    return {
      kind: "unknown",
      summary: "Not enough data",
      detail: `The register for ${missing} is not recorded, so this cannot be answered from measurements.`,
    };
  }

  const gap = Math.round((a - b) * 100) / 100;

  if (gap >= MIN_ADAPTER_THICKNESS_MM) {
    return {
      kind: "adapts",
      gapMm: gap,
      summary: "Adapts, with infinity focus",
      detail:
        `${lensMount.name} sits ${a} mm from the film or sensor and ${bodyMount.name} ` +
        `sits ${b} mm, leaving ${gap} mm for a plain adapter. Focus to infinity is ` +
        `retained. Whether autofocus and the aperture still work depends on the ` +
        `adapter’s electronics, which this database does not model.`,
    };
  }

  if (gap > 0) {
    return {
      kind: "tight",
      gapMm: gap,
      summary: "Only with a very thin adapter",
      detail:
        `The registers differ by just ${gap} mm (${a} mm against ${b} mm), which is ` +
        `less than most adapters can be built to. In practice this pairing is rare ` +
        `and usually needs a machined or modified mount.`,
    };
  }

  return {
    kind: "optics",
    gapMm: gap,
    summary: "Not without corrective optics",
    detail:
      `${lensMount.name} sits ${a} mm from the film or sensor, closer than ` +
      `${bodyMount.name} at ${b} mm, so a plain adapter cannot reach infinity ` +
      `focus. An adapter with corrective glass can, at some cost to image ` +
      `quality; without one, focus is limited to close range.`,
  };
}

/** Mounts with a known register, with how much glass and how many bodies each has. */
export const getMountsWithFlange = unstable_cache(
  async (): Promise<(Mount & { lensCount: number; cameraCount: number })[]> => {
    const rows = await db
      .select({
        id: systems.id,
        name: systems.name,
        slug: systems.slug,
        flangeDistanceMm: systems.flangeDistanceMm,
        wikidataQid: systems.wikidataQid,
        lensCount: sql<number>`(
          select count(*)::int from ${lensSystems} ls
          join ${lenses} l on l.id = ls.lens_id
          where ls.system_id = ${systems}."id" and l.merged_into_id is null
        )`,
        cameraCount: sql<number>`(
          select count(*)::int from ${cameras} c
          where c.system_id = ${systems}."id" and c.merged_into_id is null
        )`,
      })
      .from(systems)
      .where(isNotNull(systems.flangeDistanceMm))
      .orderBy(systems.name);

    return rows;
  },
  ["mounts-with-flange"],
  { revalidate: 604800, tags: ["lenses", "cameras"] },
);

/**
 * The pairs worth publishing a page for: mounts with enough glass to be worth
 * adapting, against the short-register bodies people adapt onto. Shared by the
 * matrix and the sitemap so the two cannot drift apart.
 */
export async function getAdapterMatrix() {
  const mounts = await getMountsWithFlange();

  // Mirrorless bodies are what people adapt onto, and short registers are why.
  const targets = [...mounts]
    .filter((m) => m.cameraCount > 0)
    .sort((a, b) => (a.flangeDistanceMm ?? 0) - (b.flangeDistanceMm ?? 0))
    .slice(0, 8);

  const sources = [...mounts]
    .filter((m) => m.lensCount >= 40)
    .sort((a, b) => b.lensCount - a.lensCount);

  return { mounts, sources, targets };
}

/** A sample of a mount's lenses, most-viewed first: what people actually adapt. */
export const getPopularLensesForMount = unstable_cache(
  async (systemId: number) => {
    return db
      .select({
        id: lenses.id,
        name: lenses.name,
        slug: lenses.slug,
        focalLengthMin: lenses.focalLengthMin,
        focalLengthMax: lenses.focalLengthMax,
        apertureMin: lenses.apertureMin,
        yearIntroduced: lenses.yearIntroduced,
      })
      .from(lensSystems)
      .innerJoin(lenses, eq(lensSystems.lensId, lenses.id))
      .where(and(eq(lensSystems.systemId, systemId), isNull(lenses.mergedIntoId)))
      .orderBy(desc(lenses.viewCount), asc(lenses.name))
      .limit(12);
  },
  ["popular-lenses-for-mount"],
  { revalidate: 604800, tags: ["lenses"] },
);
