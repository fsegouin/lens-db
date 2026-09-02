import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { cameras, systems, priceEstimates } from "@/db/schema";
import { asc, desc, eq, and, or, sql, isNull, type AnyColumn } from "drizzle-orm";
import { escapeLikeMetachars, parseMultiValueParam } from "@/lib/api-utils";
import { buildNameSearch } from "@/lib/search";

const PAGE_SIZE = 50;

export type CameraListParams = {
  q?: string;
  slug?: string;
  system?: string;
  type?: string;
  model?: string;
  filmType?: string;
  sensorSize?: string;
  sensorType?: string;
  cropFactor?: string;
  year?: string;
  priceMin?: string;
  priceMax?: string;
  sort?: string;
  order?: string;
  cursor: number;
};

export type CameraListItem = {
  camera: typeof cameras.$inferSelect;
  system: typeof systems.$inferSelect | null;
  avgPrice: number | null;
};

export type CameraListResult = {
  items: CameraListItem[];
  nextCursor: number | null;
  total: number;
};

// Shared by the /cameras page and /api/cameras. Cached for an hour so
// repeated identical requests don't each hit Postgres; admin edits bust
// the "cameras" tag.
export const listCameras = unstable_cache(
  async (p: CameraListParams): Promise<CameraListResult> => {
    const cursor = p.cursor;
    const avgPrice = priceEstimates.medianPrice;

    const conditions: ReturnType<typeof and>[] = [isNull(cameras.mergedIntoId)];

    if (p.q) {
      // Each token must appear in the name or the alias.
      const nameConditions = buildNameSearch(cameras.name, p.q);
      const aliasConditions = buildNameSearch(cameras.alias, p.q);
      nameConditions.forEach((nameCondition, i) => {
        conditions.push(or(nameCondition, aliasConditions[i]));
      });
    }
    if (p.slug) {
      conditions.push(eq(cameras.slug, p.slug));
    }
    if (p.system) {
      conditions.push(eq(systems.slug, p.system));
    }
    if (p.type) {
      conditions.push(sql`${cameras.specs}->>'Type' = ${p.type}`);
    }
    if (p.model) {
      conditions.push(
        sql`${cameras.specs}->>'Model' LIKE ${p.model + "%"}`
      );
    }
    const filmTypeList = parseMultiValueParam(p.filmType ?? null);
    if (filmTypeList.length > 0) {
      conditions.push(
        or(
          ...filmTypeList.map(
            (v) =>
              sql`${cameras.specs}->>'Film type' ILIKE ${"%" + escapeLikeMetachars(v) + "%"}`,
          ),
        ),
      );
    }
    if (p.sensorSize) {
      conditions.push(eq(cameras.sensorSize, p.sensorSize));
    }
    if (p.sensorType) {
      conditions.push(eq(cameras.sensorType, p.sensorType));
    }
    if (p.cropFactor) {
      conditions.push(
        sql`${cameras.specs}->>'Crop factor' = ${p.cropFactor}`
      );
    }
    if (p.year) {
      const val = parseInt(p.year);
      if (Number.isFinite(val))
        conditions.push(eq(cameras.yearIntroduced, val));
    }
    if (p.priceMin) {
      const val = parseInt(p.priceMin);
      if (Number.isFinite(val))
        conditions.push(sql`${avgPrice} >= ${val}`);
    }
    if (p.priceMax) {
      const val = parseInt(p.priceMax);
      if (Number.isFinite(val))
        conditions.push(sql`${avgPrice} <= ${val}`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumns: Record<string, AnyColumn> = {
      name: cameras.name,
      system: systems.name,
      year: cameras.yearIntroduced,
      megapixels: cameras.megapixels,
      weight: cameras.weightG,
      price: avgPrice,
    };
    // Default: newest first, unknown years last, then alphabetical. Year sorts
    // descend unless the caller asks otherwise; every other column ascends.
    const sortKey = p.sort || "year";
    const sortCol = sortColumns[sortKey] || cameras.name;
    const defaultOrder = sortKey === "year" ? "desc" : "asc";
    const orderFn = (p.order || defaultOrder) === "desc" ? desc : asc;
    // Other sorts break ties alphabetically so equal years / prices / weights
    // come out in a stable, readable order.
    const nameTieBreak = sortCol === cameras.name ? [] : [asc(cameras.name)];
    // For price and year sorting, push NULLs to the end regardless of direction
    const orderClauses =
      sortKey === "price" || sortKey === "year"
        ? [sql`${sortCol} IS NULL`, orderFn(sortCol), ...nameTieBreak]
        : [orderFn(sortCol), ...nameTieBreak];

    const itemsPromise = db
      .select({ camera: cameras, system: systems, avgPrice: avgPrice })
      .from(cameras)
      .leftJoin(systems, eq(cameras.systemId, systems.id))
      .leftJoin(priceEstimates, and(
        eq(priceEstimates.entityType, "camera"),
        eq(priceEstimates.entityId, cameras.id),
      ))
      .where(where)
      .orderBy(...orderClauses)
      .limit(PAGE_SIZE)
      .offset(cursor);

    // Total only matters for the SSR-rendered first page (cursor=0).
    // Cursor pagination from the client already has total from SSR.
    const countPromise =
      cursor === 0
        ? db
            .select({ count: sql<number>`count(*)` })
            .from(cameras)
            .leftJoin(systems, eq(cameras.systemId, systems.id))
            .leftJoin(priceEstimates, and(
              eq(priceEstimates.entityType, "camera"),
              eq(priceEstimates.entityId, cameras.id),
            ))
            .where(where)
        : null;

    const [items, countRows] = await Promise.all([itemsPromise, countPromise]);
    const total = countRows ? Number(countRows[0].count) : -1;
    const nextCursor =
      items.length === PAGE_SIZE ? cursor + PAGE_SIZE : null;

    return { items, nextCursor, total };
  },
  ["camera-list-v2"],
  { revalidate: 3600, tags: ["cameras"] }
);
