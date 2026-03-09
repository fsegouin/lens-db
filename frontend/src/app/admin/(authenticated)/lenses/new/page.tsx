import { db } from "@/db";
import { systems } from "@/db/schema";
import { asc } from "drizzle-orm";
import LensForm from "@/components/admin/LensForm";
import { requireAdmin } from "@/lib/admin-auth";
import { getDistinctLensTags } from "@/lib/lens-tags";

export const dynamic = "force-dynamic";

export default async function NewLensPage() {
  await requireAdmin();

  const [allSystems, tags] = await Promise.all([
    db
      .select({ id: systems.id, name: systems.name })
      .from(systems)
      .orderBy(asc(systems.name)),
    getDistinctLensTags(),
  ]);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        New Lens
      </h1>
      <LensForm systems={allSystems} tags={tags} />
    </div>
  );
}
