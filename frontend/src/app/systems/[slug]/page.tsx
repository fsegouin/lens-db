import Link from "next/link";
import { notFound } from "next/navigation";
import BackButton from "@/components/BackButton";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cameras, lenses, systems } from "@/db/schema";
import ViewTracker from "@/components/ViewTracker";
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

  return {
    title: result ? `${result.system.name} | The Lens DB` : "System Not Found",
  };
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

  if (!result) notFound();

  const { system } = result;

  const systemLenses = await db
    .select()
    .from(lenses)
    .where(eq(lenses.systemId, system.id))
    .orderBy(asc(sql`regexp_replace(${lenses.name}, '\\d+(\\.\\d+)?mm.*$', '')`), asc(lenses.focalLengthMin), asc(lenses.apertureMin))
    .limit(500);

  const systemCameras = await db
    .select()
    .from(cameras)
    .where(eq(cameras.systemId, system.id))
    .orderBy(asc(cameras.name))
    .limit(500);

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl space-y-8">
        <BackButton fallbackHref="/systems" label="Back to systems" />

        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{system.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {system.manufacturer && <Badge variant="outline">{system.manufacturer}</Badge>}
            {system.mountType && <Badge variant="system">{system.mountType}</Badge>}
            <Badge variant="secondary">
              {systemLenses.length} lenses, {systemCameras.length} cameras
            </Badge>
            {(system.viewCount ?? 0) > 0 && (
              <span className="text-zinc-400">{system.viewCount!.toLocaleString()} views</span>
            )}
          </div>
        </div>

        {system.description && <p className="leading-relaxed text-zinc-600 dark:text-zinc-400">{system.description}</p>}

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
                      <TableCell className="text-zinc-500">{lens.brand || "\u2014"}</TableCell>
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
                      <TableCell className="text-zinc-500">
                        {camera.sensorType || "\u2014"}
                      </TableCell>
                      <TableCell className="text-zinc-500">
                        {camera.sensorSize || "\u2014"}
                      </TableCell>
                      <TableCell className="text-zinc-600 dark:text-zinc-400">
                        {camera.megapixels ? `${camera.megapixels} MP` : "\u2014"}
                      </TableCell>
                      <TableCell className="text-zinc-600 dark:text-zinc-400">
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
    </PageTransition>
  );
}
