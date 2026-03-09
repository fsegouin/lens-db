import { db } from "@/db";
import { cameras, systems } from "@/db/schema";
import { asc, desc, eq, and, or, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import CameraList from "@/components/CameraList";
import { PageTransition } from "@/components/page-transition";

const getCachedDropdownData = unstable_cache(
  async () => {
    const [systemRows, allCameras] = await Promise.all([
      db
        .select({ name: systems.name, slug: systems.slug })
        .from(systems)
        .orderBy(asc(systems.name)),
      db
        .select({ specs: cameras.specs, sensorType: cameras.sensorType })
        .from(cameras),
    ]);

    const typeSet = new Set<string>();
    const modelSet = new Set<string>();
    const filmTypeSet = new Set<string>();
    const cropFactorSet = new Set<string>();
    const sensorTypeSet = new Set<string>();

    for (const r of allCameras) {
      const s = (r.specs || {}) as Record<string, string>;
      if (s["Type"]) typeSet.add(s["Type"]);
      if (s["Model"]) {
        if (s["Model"].startsWith("Electronically controlled"))
          modelSet.add("Electronically controlled");
        else if (s["Model"].startsWith("Mechanical"))
          modelSet.add("Mechanical");
        else modelSet.add(s["Model"]);
      }
      if (s["Film type"]) filmTypeSet.add(s["Film type"]);
      if (s["Crop factor"]) cropFactorSet.add(s["Crop factor"]);
      if (r.sensorType) sensorTypeSet.add(r.sensorType);
    }

    return {
      systems: systemRows,
      types: [...typeSet].sort(),
      models: [...modelSet].sort(),
      filmTypes: [...filmTypeSet].sort(),
      cropFactors: [...cropFactorSet].sort(),
      sensorTypes: [...sensorTypeSet].sort(),
    };
  },
  ["cameras-dropdown-data"],
  { revalidate: 86400 }
);

export const metadata = {
  title: "Cameras | The Lens DB",
  description: "Browse camera bodies by system and specifications.",
};

type SearchParams = Promise<{
  q?: string;
  system?: string;
  type?: string;
  model?: string;
  filmType?: string;
  sensorType?: string;
  cropFactor?: string;
  year?: string;
  sort?: string;
  order?: string;
}>;

const PAGE_SIZE = 50;

export default async function CamerasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  let initialItems: {
    camera: typeof cameras.$inferSelect;
    system: typeof systems.$inferSelect | null;
  }[] = [];
  let total = 0;
  let systemList: { name: string; slug: string }[] = [];
  let types: string[] = [];
  let models: string[] = [];
  let filmTypes: string[] = [];
  let sensorTypes: string[] = [];
  let cropFactors: string[] = [];

  try {
    const dropdownData = await getCachedDropdownData();
    systemList = dropdownData.systems;
    types = dropdownData.types;
    models = dropdownData.models;
    filmTypes = dropdownData.filmTypes;
    sensorTypes = dropdownData.sensorTypes;
    cropFactors = dropdownData.cropFactors;

    const conditions = [];

    if (params.q) {
      const words = params.q.trim().split(/\s+/).filter(Boolean);
      for (const word of words) {
        const clean = word.replace(/[^a-zA-Z0-9.]/g, "");
        const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const startsWithDigit = /^\d/.test(clean);
        const pattern = startsWithDigit ? `\\m${escaped}` : escaped;
        conditions.push(
          or(
            sql`regexp_replace(${cameras.name}, '[^a-zA-Z0-9. ]', '', 'g') ~* ${pattern}`,
            sql`regexp_replace(${cameras.alias}, '[^a-zA-Z0-9. ]', '', 'g') ~* ${pattern}`
          )
        );
      }
    }
    if (params.system) {
      conditions.push(eq(systems.slug, params.system));
    }
    if (params.type) {
      conditions.push(
        sql`${cameras.specs}->>'Type' = ${params.type}`
      );
    }
    if (params.model) {
      conditions.push(
        sql`${cameras.specs}->>'Model' LIKE ${params.model + "%"}`
      );
    }
    if (params.filmType) {
      conditions.push(
        sql`${cameras.specs}->>'Film type' = ${params.filmType}`
      );
    }
    if (params.sensorType) {
      conditions.push(eq(cameras.sensorType, params.sensorType));
    }
    if (params.cropFactor) {
      conditions.push(
        sql`${cameras.specs}->>'Crop factor' = ${params.cropFactor}`
      );
    }
    if (params.year) {
      conditions.push(eq(cameras.yearIntroduced, parseInt(params.year)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortColumns: Record<string, any> = {
      name: cameras.name,
      system: systems.name,
      year: cameras.yearIntroduced,
      megapixels: cameras.megapixels,
      weight: cameras.weightG,
    };
    const sortCol = sortColumns[params.sort || ""] || cameras.name;
    const orderFn = params.order === "desc" ? desc : asc;

    // When filtering by system, we need a join for the WHERE clause
    const needsSystemJoin = !!params.system;

    const [countResult] = needsSystemJoin
      ? await db
          .select({ count: sql<number>`count(*)` })
          .from(cameras)
          .leftJoin(systems, eq(cameras.systemId, systems.id))
          .where(where)
      : await db
          .select({ count: sql<number>`count(*)` })
          .from(cameras)
          .where(where);
    total = Number(countResult.count);

    initialItems = await db
      .select({ camera: cameras, system: systems })
      .from(cameras)
      .leftJoin(systems, eq(cameras.systemId, systems.id))
      .where(where)
      .orderBy(orderFn(sortCol))
      .limit(PAGE_SIZE)
      .offset(0);
  } catch {
    // DB not connected
  }

  const nextCursor = PAGE_SIZE < total ? PAGE_SIZE : null;

  return (
    <PageTransition>
      <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          Cameras
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          {total > 0 ? `${total} cameras found` : "Browse camera bodies"}
        </p>
      </div>

      <CameraList
        initialItems={initialItems}
        initialTotal={total}
        initialNextCursor={nextCursor}
        systems={systemList}
        types={types}
        models={models}
        filmTypes={filmTypes}
        sensorTypes={sensorTypes}
        cropFactors={cropFactors}
      />
      </div>
    </PageTransition>
  );
}
