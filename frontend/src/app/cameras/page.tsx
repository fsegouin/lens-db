import { db } from "@/db";
import { cameras, systems } from "@/db/schema";
import { asc, eq, ilike, and, sql } from "drizzle-orm";
import CameraList from "@/components/CameraList";

export const metadata = {
  title: "Cameras | Lens DB",
  description: "Browse camera bodies by system and specifications.",
};

type SearchParams = Promise<{
  q?: string;
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

  try {
    const conditions = [];
    if (params.q) {
      conditions.push(ilike(cameras.name, `%${params.q}%`));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(cameras)
      .where(where);
    total = Number(countResult.count);

    initialItems = await db
      .select({ camera: cameras, system: systems })
      .from(cameras)
      .leftJoin(systems, eq(cameras.systemId, systems.id))
      .where(where)
      .orderBy(asc(cameras.name))
      .limit(PAGE_SIZE)
      .offset(0);
  } catch {
    // DB not connected
  }

  const nextCursor = PAGE_SIZE < total ? PAGE_SIZE : null;

  return (
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
      />
    </div>
  );
}
