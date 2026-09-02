import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import { entityMetadata } from "@/lib/seo";
import { hubJsonLd } from "@/lib/jsonld";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { collections, lensCollections, lenses, systems } from "@/db/schema";
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
  const rows = await db.select({ slug: collections.slug }).from(collections);
  return rows.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [result] = await db
    .select({ collection: collections })
    .from(collections)
    .where(eq(collections.slug, slug))
    .limit(1);

  if (!result) return { title: "Collection Not Found" };

  const { collection } = result;
  return entityMetadata({
    title: `${collection.name}`,
    description:
      collection.description?.slice(0, 158) ??
      `${collection.name}: A curated list of lenses with specifications, release years and used prices.`,
    path: `/collections/${collection.slug}`,
  });
}

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [result] = await db
    .select({ collection: collections })
    .from(collections)
    .where(eq(collections.slug, slug))
    .limit(1);

  if (!result) notFound();

  const { collection } = result;

  const collectionLenses = await db
    .select({ lens: lenses, system: systems })
    .from(lensCollections)
    .innerJoin(lenses, eq(lensCollections.lensId, lenses.id))
    .leftJoin(systems, eq(lenses.systemId, systems.id))
    .where(eq(lensCollections.collectionId, collection.id))
    .orderBy(asc(sql`regexp_replace(${lenses.name}, '\\d+(\\.\\d+)?mm.*$', '')`), asc(lenses.focalLengthMin), asc(lenses.apertureMin));

  const crumbs = [
    { name: "Collections", path: "/collections" },
    { name: collection.name },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <JsonLd
        data={hubJsonLd({
          path: `/collections/${collection.slug}`,
          name: collection.name,
          description: collection.description,
          items: collectionLenses.map(({ lens }) => ({
            name: lens.name,
            path: `/lenses/${lens.slug}`,
          })),
          crumbs,
        })}
      />

      <Breadcrumb crumbs={crumbs} />

      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          {collection.name}
        </h1>
        {collection.description && (
          <p className="mt-2 text-zinc-600">{collection.description}</p>
        )}
        <div className="mt-2">
          <Badge variant="secondary">
            {collectionLenses.length} {collectionLenses.length === 1 ? "lens" : "lenses"}
          </Badge>
        </div>
      </div>

      {collectionLenses.length > 0 ? (
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
              {collectionLenses.map(({ lens, system }) => (
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
                  <TableCell className="text-zinc-600">
                    {lens.focalLengthMin
                      ? lens.focalLengthMin === lens.focalLengthMax
                        ? `${lens.focalLengthMin}mm`
                        : `${lens.focalLengthMin}-${lens.focalLengthMax}mm`
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-zinc-600">
                    {lens.apertureMin ? `f/${lens.apertureMin}` : "\u2014"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {lens.isZoom && <Badge variant="zoom">Zoom</Badge>}
                      {lens.isPrime && <Badge variant="prime">Prime</Badge>}
                      {lens.isMacro && <Badge variant="macro">Macro</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-600">
                    {lens.yearIntroduced || "\u2014"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-muted-foreground">No lenses in this collection yet.</p>
        </div>
      )}

    </div>
  );
}
