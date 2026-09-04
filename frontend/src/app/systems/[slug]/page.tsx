import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import { entityMetadata } from "@/lib/seo";
import { hubJsonLd } from "@/lib/jsonld";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { cameras, lenses, lensSystems, systemRedirects, systems } from "@/db/schema";
import ViewTracker from "@/components/ViewTracker";
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
  const rows = await db.select({ slug: systems.slug }).from(systems);
  return rows.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [result] = await db
    .select({ system: systems })
    .from(systems)
    .where(eq(systems.slug, slug))
    .limit(1);

  if (!result) return { title: "System Not Found" };

  const { system } = result;
  return entityMetadata({
    title: `${system.name} lenses and cameras`,
    description:
      system.description?.slice(0, 158) ??
      `Every lens and camera body made for the ${system.name} mount, with specifications, release years and used prices.`,
    path: `/systems/${system.slug}`,
  });
}

export default async function SystemDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [result] = await db
    .select({ system: systems })
    .from(systems)
    .where(eq(systems.slug, slug))
    .limit(1);

  if (!result) {
    // Merged-away system (see scripts/consolidate-systems.mjs): follow the
    // slug redirect so old links and search results still land somewhere.
    const [target] = await db
      .select({ slug: systems.slug })
      .from(systemRedirects)
      .innerJoin(systems, eq(systemRedirects.systemId, systems.id))
      .where(eq(systemRedirects.oldSlug, slug))
      .limit(1);
    if (target) permanentRedirect(`/systems/${target.slug}`);
    notFound();
  }

  const { system } = result;

  const [systemLenses, systemCameras] = await Promise.all([
    // Every lens sold in this mount (lens_systems), not only those whose
    // primary mount it is.
    db
      .select({ lens: lenses })
      .from(lensSystems)
      .innerJoin(lenses, eq(lensSystems.lensId, lenses.id))
      .where(and(eq(lensSystems.systemId, system.id), isNull(lenses.mergedIntoId)))
      .orderBy(asc(sql`regexp_replace(${lenses.name}, '\\d+(\\.\\d+)?mm.*$', '')`), asc(lenses.focalLengthMin), asc(lenses.apertureMin))
      .limit(500)
      .then((rows) => rows.map((r) => r.lens)),
    db
      .select()
      .from(cameras)
      .where(and(eq(cameras.systemId, system.id), isNull(cameras.mergedIntoId)))
      .orderBy(asc(cameras.name))
      .limit(500),
  ]);

  const crumbs = [
    { name: "Systems", path: "/systems" },
    { name: system.name },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <JsonLd
        data={hubJsonLd({
          path: `/systems/${system.slug}`,
          name: `${system.name} lenses and cameras`,
          description: system.description,
          items: systemLenses.map((l) => ({
            name: l.name,
            path: `/lenses/${l.slug}`,
          })),
          crumbs,
        })}
      />

      <Breadcrumb crumbs={crumbs} />

      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{system.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {system.manufacturer && <Badge variant="outline">{system.manufacturer}</Badge>}
          {system.mountType && <Badge variant="system">{system.mountType}</Badge>}
          <Badge variant="secondary">
            {systemLenses.length} lenses, {systemCameras.length} cameras
          </Badge>
          {system.flangeDistanceMm != null && (
            <Badge variant="outline">
              {system.flangeDistanceMm} mm register
            </Badge>
          )}
          {system.wikidataQid && (
            <a
              href={`https://www.wikidata.org/wiki/${system.wikidataQid}`}
              rel="noopener noreferrer external"
              target="_blank"
              className="font-mono text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
              title="This mount on Wikidata"
            >
              {system.wikidataQid}
            </a>
          )}
          {(system.viewCount ?? 0) > 0 && (
            <span className="text-muted-foreground">{(system.viewCount ?? 0).toLocaleString()} views</span>
          )}
        </div>
      </div>

      {system.description && <p className="leading-relaxed text-muted-foreground">{system.description}</p>}

      {system.flangeDistanceMm != null && (
        <p className="text-sm">
          <Link href="/adapters" className="underline underline-offset-2">
            What adapts onto {system.name}, and what {system.name} lenses adapt onto →
          </Link>
        </p>
      )}

      {systemLenses.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Lenses ({systemLenses.length})
          </h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Brand</TableHead>
                  <TableHead scope="col">Focal Length</TableHead>
                  <TableHead scope="col">Aperture</TableHead>
                  <TableHead scope="col">Type</TableHead>
                  <TableHead scope="col">Year</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {systemLenses.map((lens) => (
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
        </div>
      )}

      {systemCameras.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Cameras ({systemCameras.length})
          </h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Sensor Type</TableHead>
                  <TableHead scope="col">Sensor Size</TableHead>
                  <TableHead scope="col">Megapixels</TableHead>
                  <TableHead scope="col">Year</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {systemCameras.map((camera) => (
                  <TableRow key={camera.id}>
                    <TableCell>
                      <Link
                        href={`/cameras/${camera.slug}`}
                        className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {camera.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {camera.sensorType || "\u2014"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {camera.sensorSize || "\u2014"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {camera.megapixels ? `${camera.megapixels} MP` : "\u2014"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {camera.yearIntroduced || "\u2014"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <ViewTracker type="system" id={system.id} />
    </div>
  );
}
