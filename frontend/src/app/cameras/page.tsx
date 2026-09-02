import { db } from "@/db";
import { cameras, systems } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import CameraList from "@/components/CameraList";
import { listCameras, type CameraListItem } from "@/lib/camera-list";

const getCachedDropdownData = unstable_cache(
  async () => {
    const [systemRows, allCameras] = await Promise.all([
      db
        .selectDistinct({ name: systems.name, slug: systems.slug })
        .from(systems)
        .innerJoin(cameras, eq(cameras.systemId, systems.id))
        .orderBy(asc(systems.name)),
      db
        .select({ specs: cameras.specs, sensorType: cameras.sensorType, sensorSize: cameras.sensorSize })
        .from(cameras),
    ]);

    const typeSet = new Set<string>();
    const modelSet = new Set<string>();
    const filmTypeSet = new Set<string>();
    const cropFactorSet = new Set<string>();
    const sensorTypeSet = new Set<string>();
    const sensorSizeSet = new Set<string>();

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
      if (s["Film type"]) {
        for (const part of s["Film type"].split(";")) {
          const v = part.trim();
          if (v) filmTypeSet.add(v);
        }
      }
      if (s["Crop factor"]) cropFactorSet.add(s["Crop factor"]);
      if (r.sensorType) sensorTypeSet.add(r.sensorType);
      if (r.sensorSize) sensorSizeSet.add(r.sensorSize);
    }

    return {
      systems: systemRows,
      types: [...typeSet].sort(),
      models: [...modelSet].sort(),
      filmTypes: [...filmTypeSet].sort(),
      cropFactors: [...cropFactorSet].sort(),
      sensorTypes: [...sensorTypeSet].sort(),
      sensorSizes: [...sensorSizeSet].sort(),
    };
  },
  ["cameras-dropdown-data"],
  { revalidate: 86400 }
);

export const metadata = {
  title: "Cameras",
  description: "Browse camera bodies by system and specifications.",
};

type SearchParams = Promise<{
  q?: string;
  system?: string;
  sensorSize?: string;
  type?: string;
  model?: string;
  filmType?: string;
  sensorType?: string;
  cropFactor?: string;
  year?: string;
  priceMin?: string;
  priceMax?: string;
  sort?: string;
  order?: string;
}>;

export default async function CamerasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  let initialItems: CameraListItem[] = [];
  let total = 0;
  let nextCursor: number | null = null;
  let systemList: { name: string; slug: string }[] = [];
  let types: string[] = [];
  let models: string[] = [];
  let filmTypes: string[] = [];
  let sensorTypes: string[] = [];
  let sensorSizes: string[] = [];
  let cropFactors: string[] = [];

  try {
    const dropdownData = await getCachedDropdownData();
    systemList = dropdownData.systems;
    types = dropdownData.types;
    models = dropdownData.models;
    filmTypes = dropdownData.filmTypes;
    sensorTypes = dropdownData.sensorTypes;
    sensorSizes = dropdownData.sensorSizes;
    cropFactors = dropdownData.cropFactors;

    const result = await listCameras({
      q: params.q,
      system: params.system,
      type: params.type,
      model: params.model,
      filmType: params.filmType,
      sensorSize: params.sensorSize,
      sensorType: params.sensorType,
      cropFactor: params.cropFactor,
      year: params.year,
      priceMin: params.priceMin,
      priceMax: params.priceMax,
      sort: params.sort,
      order: params.order,
      cursor: 0,
    });
    initialItems = result.items;
    total = result.total;
    nextCursor = result.nextCursor;
  } catch {
    // DB not connected
  }

  return (
    <div className="space-y-8">
    <div>
      <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
        Cameras
      </h1>
      <p className="mt-2 text-zinc-600">
        {total > 0 ? `${total} cameras found` : "Browse camera bodies"}
      </p>
    </div>

    <CameraList
      initialItems={initialItems}
      initialTotal={total}
      initialNextCursor={nextCursor}
      systems={systemList}
      sensorSizes={sensorSizes}
      types={types}
      models={models}
      filmTypes={filmTypes}
      sensorTypes={sensorTypes}
      cropFactors={cropFactors}
    />
    </div>
  );
}
