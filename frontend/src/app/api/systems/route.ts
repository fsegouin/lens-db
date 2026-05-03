import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { systems } from "@/db/schema";

const getSystems = unstable_cache(
  async () => {
    return db
      .select({ id: systems.id, name: systems.name })
      .from(systems)
      .orderBy(asc(systems.name));
  },
  ["api-systems-list"],
  { revalidate: 604800, tags: ["systems"] },
);

export async function GET() {
  const rows = await getSystems();
  return NextResponse.json({ systems: rows });
}
