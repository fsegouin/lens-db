import { db } from "@/db";
import { lenses, systems } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import LensForm from "@/components/admin/LensForm";
import { requireAdmin } from "@/lib/admin-auth";

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

  const allSystems = await db
    .select({ id: systems.id, name: systems.name })
    .from(systems)
    .orderBy(asc(systems.name));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Edit Lens
      </h1>
      <LensForm lens={lens} systems={allSystems} />
    </div>
  );
}
