import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { systems, lenses, cameras } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import ViewTracker from "@/components/ViewTracker";
import ReportIssueButton from "@/components/ReportIssueButton";

export const revalidate = 604800;

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
    title: result
      ? `${result.system.name} | Lens DB`
      : "System Not Found",
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
    .orderBy(asc(lenses.name))
    .limit(500);

  const systemCameras = await db
    .select()
    .from(cameras)
    .where(eq(cameras.systemId, system.id))
    .orderBy(asc(cameras.name))
    .limit(500);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Link
        href="/systems"
        className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        &larr; Back to systems
      </Link>

      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          {system.name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {system.manufacturer && (
            <span className="rounded bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {system.manufacturer}
            </span>
          )}
          {system.mountType && (
            <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {system.mountType}
            </span>
          )}
          <span className="text-zinc-400">
            {systemLenses.length} lenses, {systemCameras.length} cameras
          </span>
          {(system.viewCount ?? 0) > 0 && (
            <span className="text-zinc-400">
              {system.viewCount!.toLocaleString()} views
            </span>
          )}
        </div>
      </div>

      {system.description && (
        <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {system.description}
        </p>
      )}

      {/* Lenses */}
      {systemLenses.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Lenses ({systemLenses.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">Brand</th>
                  <th className="pb-3 pr-4 font-medium">Focal Length</th>
                  <th className="pb-3 pr-4 font-medium">Aperture</th>
                  <th className="pb-3 pr-4 font-medium">Type</th>
                  <th className="pb-3 font-medium">Year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {systemLenses.map((lens) => (
                  <tr
                    key={lens.id}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <td className="py-3 pr-4">
                      <Link
                        href={`/lenses/${lens.slug}`}
                        className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {lens.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-zinc-500">
                      {lens.brand || "\u2014"}
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {lens.focalLengthMin
                        ? lens.focalLengthMin === lens.focalLengthMax
                          ? `${lens.focalLengthMin}mm`
                          : `${lens.focalLengthMin}-${lens.focalLengthMax}mm`
                        : "\u2014"}
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {lens.apertureMin ? `f/${lens.apertureMin}` : "\u2014"}
                    </td>
                    <td className="py-3 pr-4">
                      {lens.isZoom && (
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                          Zoom
                        </span>
                      )}
                      {lens.isPrime && (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
                          Prime
                        </span>
                      )}
                      {lens.isMacro && (
                        <span className="ml-1 rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                          Macro
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">
                      {lens.yearIntroduced || "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cameras */}
      {systemCameras.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Cameras ({systemCameras.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">Sensor</th>
                  <th className="pb-3 pr-4 font-medium">Megapixels</th>
                  <th className="pb-3 font-medium">Year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {systemCameras.map((camera) => (
                  <tr
                    key={camera.id}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <td className="py-3 pr-4">
                      <Link
                        href={`/cameras/${camera.slug}`}
                        className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {camera.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-zinc-500">
                      {camera.sensorType || camera.sensorSize || "\u2014"}
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {camera.megapixels ? `${camera.megapixels} MP` : "\u2014"}
                    </td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">
                      {camera.yearIntroduced || "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ViewTracker type="system" id={system.id} />
      <ReportIssueButton entityType="system" entityId={system.id} entityName={system.name} />
    </div>
  );
}
