import { db } from "@/db";
import { lenses, systems } from "@/db/schema";
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
    .where(eq(lenses.id, parseInt(id)))
    .then((r) => r[0]);

  if (!lens) notFound();

  const [allSystems, tags] = await Promise.all([
    db
      .select({ id: systems.id, name: systems.name })
      .from(systems)
      .orderBy(asc(systems.name)),
    getDistinctLensTags(),
  ]);

  return (
    <EditPageWithReport title="Edit Lens">
      <LensForm lens={lens} systems={allSystems} tags={tags} />
    </EditPageWithReport>
  );
}
