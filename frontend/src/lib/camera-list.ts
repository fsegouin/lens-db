import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { cameras, systems, priceEstimates } from "@/db/schema";
import { asc, desc, eq, and, or, sql, isNull, type AnyColumn } from "drizzle-orm";
import { escapeLikeMetachars, parseMultiValueParam } from "@/lib/api-utils";

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
      const words = p.q.trim().split(/\s+/).filter(Boolean).slice(0, 10);
      for (const word of words) {
        const clean = word.replace(/[^a-zA-Z0-9.]/g, "");
        if (!clean) continue;
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
    const sortKey = p.sort || "";
    const sortCol = sortColumns[sortKey] || cameras.name;
    const orderFn = p.order === "desc" ? desc : asc;
    // For price sorting, push NULLs to the end
    const nullsLast = sortKey === "price"
      ? [sql`${avgPrice} IS NULL`, orderFn(sortCol)]
      : [orderFn(sortCol)];

    const itemsPromise = db
      .select({ camera: cameras, system: systems, avgPrice: avgPrice })
      .from(cameras)
      .leftJoin(systems, eq(cameras.systemId, systems.id))
      .leftJoin(priceEstimates, and(
        eq(priceEstimates.entityType, "camera"),
        eq(priceEstimates.entityId, cameras.id),
      ))
      .where(where)
      .orderBy(...nullsLast)
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
  ["camera-list"],
  { revalidate: 3600, tags: ["cameras"] }
);
