import { db } from "@/db";
import { lenses, lensSystems, systems } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import LensForm from "@/components/admin/LensForm";
import EditPageWithReport from "@/components/admin/EditPageWithReport";
import { requireAdmin } from "@/lib/admin-auth";
import { getDistinctLensTags } from "@/lib/lens-tags";

export const dynamic = "force-dynamic";

export default async function EditLensPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const lens = await db
    .select()
    .from(lenses)
    .where(eq(lenses.id, parseInt(id, 10)))
    .then((r) => r[0]);

  if (!lens) notFound();

  const [allSystems, tags, mountRows] = await Promise.all([
    db
      .select({ id: systems.id, name: systems.name })
      .from(systems)
      .orderBy(asc(systems.name)),
    getDistinctLensTags(),
    db
      .select({ systemId: lensSystems.systemId })
      .from(lensSystems)
      .where(eq(lensSystems.lensId, lens.id)),
  ]);

  return (
    <EditPageWithReport title="Edit Lens">
      <LensForm
        lens={{ ...lens, systemIds: mountRows.map((r) => r.systemId) }}
        systems={allSystems}
        tags={tags}
      />
    </EditPageWithReport>
  );
}
