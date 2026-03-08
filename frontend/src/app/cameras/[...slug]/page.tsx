import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { cameras, systems } from "@/db/schema";
import { eq } from "drizzle-orm";
import ViewTracker from "@/components/ViewTracker";
import ImageGallery from "@/components/ImageGallery";
import { getImages } from "@/lib/images";

export const revalidate = 604800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const fullSlug = slug.join("/");
  const [result] = await db
    .select({ camera: cameras })
    .from(cameras)
    .where(eq(cameras.slug, fullSlug))
    .limit(1);
  return {
    title: result ? `${result.camera.name} | Lens DB` : "Camera Not Found",
  };
}

export default async function CameraDetailPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const fullSlug = slug.join("/");

  const [result] = await db
    .select({ camera: cameras, system: systems })
    .from(cameras)
    .leftJoin(systems, eq(cameras.systemId, systems.id))
    .where(eq(cameras.slug, fullSlug))
    .limit(1);

  if (!result) notFound();

  const { camera, system } = result;
  const specs = (camera.specs ?? {}) as Record<string, string>;

  const specRows: [string, string | number | null | undefined][] = [
    ["System", system?.name],
    ["Sensor Type", camera.sensorType],
    ["Sensor Size", camera.sensorSize],
    ["Megapixels", camera.megapixels ? `${camera.megapixels} MP` : null],
    ["Resolution", camera.resolution],
    ["Year Introduced", camera.yearIntroduced],
    ["Weight", camera.weightG ? `${camera.weightG}g` : null],
    ["Body Type", camera.bodyType],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href="/cameras"
        className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        ← Back to cameras
      </Link>

      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          {camera.name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {system && (
            <span className="text-zinc-500">{system.name}</span>
          )}
          {(camera.viewCount ?? 0) > 0 && (
            <span className="text-sm text-zinc-400">
              {camera.viewCount!.toLocaleString()} views
            </span>
          )}
        </div>
      </div>

      {camera.description && (
        <div>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {camera.description}
          </p>
        </div>
      )}

      <ImageGallery images={getImages("cameras", fullSlug, camera.images as Array<{src: string; alt: string}> || [])} />

      {/* Specs table */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Specifications
        </h2>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {specRows
              .filter(([, value]) => value != null && value !== "")
              .map(([label, value]) => (
                <tr key={label}>
                  <td className="py-2 pr-4 font-medium text-zinc-500 dark:text-zinc-400">
                    {label}
                  </td>
                  <td className="py-2 text-zinc-900 dark:text-zinc-100">
                    {String(value)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Raw specs */}
      {Object.keys(specs).length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400">
            Raw specs JSON ({Object.keys(specs).length} fields)
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-zinc-50 p-4 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {JSON.stringify(specs, null, 2)}
          </pre>
        </details>
      )}

      {camera.url && (
        <p className="text-xs text-zinc-400">
          Source:{" "}
          <a
            href={camera.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-zinc-600"
          >
            {camera.url}
          </a>
        </p>
      )}

      <ViewTracker type="camera" id={camera.id} />
    </div>
  );
}
