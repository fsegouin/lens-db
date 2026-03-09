import { notFound } from "next/navigation";
import { db } from "@/db";
import { systems } from "@/db/schema";
import { eq } from "drizzle-orm";
import SystemForm from "@/components/admin/SystemForm";

export const dynamic = "force-dynamic";

export default async function EditSystemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const system = await db
    .select()
    .from(systems)
    .where(eq(systems.id, parseInt(id)))
    .then((r) => r[0]);

  if (!system) notFound();

  return <SystemForm system={system} />;
}
