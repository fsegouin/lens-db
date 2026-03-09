import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { lensSeries, lensSeriesMemberships, lenses, systems } from "@/db/schema";
import ReportIssueButton from "@/components/ReportIssueButton";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [result] = await db
    .select({ series: lensSeries })
    .from(lensSeries)
    .where(eq(lensSeries.slug, slug))
    .limit(1);

  return {
    title: result ? `${result.series.name} | The Lens DB` : "Series Not Found",
  };
}

export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [result] = await db
    .select({ series: lensSeries })
    .from(lensSeries)
    .where(eq(lensSeries.slug, slug))
    .limit(1);

  if (!result) notFound();

  const { series } = result;

  const seriesLenses = await db
    .select({ lens: lenses, system: systems })
    .from(lensSeriesMemberships)
    .innerJoin(lenses, eq(lensSeriesMemberships.lensId, lenses.id))
    .leftJoin(systems, eq(lenses.systemId, systems.id))
    .where(eq(lensSeriesMemberships.seriesId, series.id))
    .orderBy(asc(sql`regexp_replace(${lenses.name}, '\\d+(\\.\\d+)?mm.*$', '')`), asc(lenses.focalLengthMin), asc(lenses.apertureMin));

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl space-y-8">
        <Link href="/lenses/series" className="inline-flex h-7 items-center gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] font-medium hover:bg-muted">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to series
          </Link>

        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {series.name}
          </h1>
          {series.description && (
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">{series.description}</p>
          )}
          <div className="mt-2">
            <Badge variant="secondary">
              {seriesLenses.length} {seriesLenses.length === 1 ? "lens" : "lenses"}
            </Badge>
          </div>
        </div>

        {seriesLenses.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Brand</TableHead>
                  <TableHead scope="col">System</TableHead>
                  <TableHead scope="col">Focal Length</TableHead>
                  <TableHead scope="col">Aperture</TableHead>
                  <TableHead scope="col">Type</TableHead>
                  <TableHead scope="col">Year</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seriesLenses.map(({ lens, system }) => (
                  <TableRow key={lens.id}>
                    <TableCell>
                      <Link
                        href={`/lenses/${lens.slug}`}
                        className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {lens.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-zinc-500">{lens.brand || "\u2014"}</TableCell>
                    <TableCell className="text-zinc-500">{system?.name || "\u2014"}</TableCell>
                    <TableCell className="text-zinc-600 dark:text-zinc-400">
                      {lens.focalLengthMin
                        ? lens.focalLengthMin === lens.focalLengthMax
                          ? `${lens.focalLengthMin}mm`
                          : `${lens.focalLengthMin}-${lens.focalLengthMax}mm`
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-zinc-600 dark:text-zinc-400">
                      {lens.apertureMin ? `f/${lens.apertureMin}` : "\u2014"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {lens.isZoom && <Badge variant="zoom">Zoom</Badge>}
                        {lens.isPrime && <Badge variant="prime">Prime</Badge>}
                        {lens.isMacro && <Badge variant="macro">Macro</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-zinc-600 dark:text-zinc-400">
                      {lens.yearIntroduced || "\u2014"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
            <p className="text-zinc-500">No lenses in this series yet.</p>
          </div>
        )}

        <ReportIssueButton
          entityType="series"
          entityId={series.id}
          entityName={series.name}
          entitySlug={series.slug}
        />
      </div>
    </PageTransition>
  );
}
