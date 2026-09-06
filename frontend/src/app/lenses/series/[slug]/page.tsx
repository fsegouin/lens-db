import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import { entityMetadata, metaDescription } from "@/lib/seo";
import { hubJsonLd } from "@/lib/jsonld";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lensSeries } from "@/db/schema";
import { getSeriesLenses } from "@/lib/hub-lists";
import { cleanScrapedDescription } from "@/lib/scraped-description";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const revalidate = 604800;

export async function generateStaticParams() {
  if (process.env.VERCEL_ENV !== "production") return [];
  const rows = await db.select({ slug: lensSeries.slug }).from(lensSeries);
  return rows.map((r) => ({ slug: r.slug }));
}

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

  if (!result) return { title: "Series Not Found" };

  const { series } = result;
  const blurb = cleanScrapedDescription(series.description);
  return entityMetadata({
    title: `${series.name} lenses`,
    description:
      blurb ? metaDescription(blurb) :
      `${series.name}: Every lens in this product line, with specifications, release years and used prices.`,
    path: `/lenses/series/${series.slug}`,
  });
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
  const description = cleanScrapedDescription(series.description);

  const seriesLenses = await getSeriesLenses(series.id);

  const crumbs = [
    { name: "Series", path: "/lenses/series" },
    { name: series.name },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <JsonLd
        data={hubJsonLd({
          path: `/lenses/series/${series.slug}`,
          name: series.name,
          description,
          items: seriesLenses.map(({ lens }) => ({
            name: lens.name,
            path: `/lenses/${lens.slug}`,
          })),
          crumbs,
        })}
      />

      <Breadcrumb crumbs={crumbs} />

      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          {series.name}
        </h1>
        {description && (
          <p className="mt-2 text-muted-foreground">{description}</p>
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
                  <TableCell className="text-muted-foreground">{lens.brand || "\u2014"}</TableCell>
                  <TableCell className="text-muted-foreground">{system?.name || "\u2014"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {lens.focalLengthMin
                      ? lens.focalLengthMin === lens.focalLengthMax
                        ? `${lens.focalLengthMin}mm`
                        : `${lens.focalLengthMin}-${lens.focalLengthMax}mm`
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lens.apertureMin ? `f/${lens.apertureMin}` : "\u2014"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {lens.isZoom && <Badge variant="zoom">Zoom</Badge>}
                      {lens.isPrime && <Badge variant="prime">Prime</Badge>}
                      {lens.isMacro && <Badge variant="macro">Macro</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lens.yearIntroduced || "\u2014"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-muted-foreground">No lenses in this series yet.</p>
        </div>
      )}

    </div>
  );
}
