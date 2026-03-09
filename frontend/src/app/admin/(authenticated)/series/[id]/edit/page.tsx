import { notFound } from "next/navigation";
import { db } from "@/db";
import { lensSeries, lensSeriesMemberships, lenses } from "@/db/schema";
import { eq } from "drizzle-orm";
import SeriesForm from "@/components/admin/SeriesForm";
import SeriesLensManager from "@/components/admin/SeriesLensManager";
import EditPageWithReport from "@/components/admin/EditPageWithReport";

export const dynamic = "force-dynamic";

export default async function EditSeriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const series = await db
    .select()
    .from(lensSeries)
    .where(eq(lensSeries.id, parseInt(id)))
    .then((r) => r[0]);

  if (!series) notFound();

  const seriesLenses = await db
    .select({
      id: lenses.id,
      name: lenses.name,
      brand: lenses.brand,
    })
    .from(lensSeriesMemberships)
    .innerJoin(lenses, eq(lensSeriesMemberships.lensId, lenses.id))
    .where(eq(lensSeriesMemberships.seriesId, parseInt(id)));

  return (
    <EditPageWithReport title="Edit Series">
      <SeriesForm series={series} />
      <SeriesLensManager
        seriesId={series.id}
        initialLenses={seriesLenses}
      />
    </EditPageWithReport>
  );
}
