import { db } from "@/db";
import { cameras, systems } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import CameraForm from "@/components/admin/CameraForm";
import EditPageWithReport from "@/components/admin/EditPageWithReport";

export const dynamic = "force-dynamic";

export default async function EditCameraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [camera, allSystems] = await Promise.all([
    db
      .select()
      .from(cameras)
      .where(eq(cameras.id, parseInt(id)))
      .then((r) => r[0]),
    db
      .select({ id: systems.id, name: systems.name })
      .from(systems)
      .orderBy(asc(systems.name)),
  ]);

  if (!camera) notFound();

  return (
    <EditPageWithReport title="Edit Camera">
      <CameraForm camera={camera} systems={allSystems} />
    </EditPageWithReport>
  );
}
