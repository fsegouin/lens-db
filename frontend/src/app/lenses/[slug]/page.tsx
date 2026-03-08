import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { lenses, systems } from "@/db/schema";
import { eq } from "drizzle-orm";
import ViewTracker from "@/components/ViewTracker";
import RatingWidget from "@/components/RatingWidget";
import ImageGallery from "@/components/ImageGallery";
import { getImages } from "@/lib/images";

export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [result] = await db
    .select({ lens: lenses })
    .from(lenses)
    .where(eq(lenses.slug, slug))
    .limit(1);
  return {
    title: result ? `${result.lens.name} | Lens DB` : "Lens Not Found",
  };
}

export default async function LensDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [result] = await db
    .select({ lens: lenses, system: systems })
    .from(lenses)
    .leftJoin(systems, eq(lenses.systemId, systems.id))
    .where(eq(lenses.slug, slug))
    .limit(1);

  if (!result) notFound();

  const { lens, system } = result;
  const specs = (lens.specs ?? {}) as Record<string, string>;

  const specRows: [string, string | number | null | undefined][] = [
    ["Focal Length", lens.focalLengthMin
      ? lens.focalLengthMin === lens.focalLengthMax
        ? `${lens.focalLengthMin}mm`
        : `${lens.focalLengthMin}–${lens.focalLengthMax}mm`
      : null],
    ["Maximum Aperture", lens.apertureMin ? `f/${lens.apertureMin}` : null],
    ["Minimum Aperture", lens.apertureMax && lens.apertureMax !== lens.apertureMin ? `f/${lens.apertureMax}` : null],
    ["Weight", lens.weightG ? `${lens.weightG}g` : null],
    ["Filter Size", lens.filterSizeMm ? `${lens.filterSizeMm}mm` : null],
    ["Lens Elements", lens.lensElements],
    ["Lens Groups", lens.lensGroups],
    ["Diaphragm Blades", lens.diaphragmBlades],
    ["Year Introduced", lens.yearIntroduced],
    ["Year Discontinued", lens.yearDiscontinued],
    ["Min Focus Distance", lens.minFocusDistanceM ? `${lens.minFocusDistanceM}m` : null],
    ["Max Magnification", lens.maxMagnification ? `${lens.maxMagnification}x` : null],
    ["Autofocus", lens.hasAutofocus ? "Yes" : "No"],
    ["Stabilization", lens.hasStabilization ? "Yes" : "No"],
    ["Lens Hood", specs["Lens hood"] ?? null],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href="/lenses"
        className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        ← Back to lenses
      </Link>

      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          {lens.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {lens.brand && (
            <span className="rounded bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {lens.brand}
            </span>
          )}
          {system && (
            <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {system.name}
            </span>
          )}
          {lens.lensType && (
            <span className="rounded bg-green-50 px-2 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-300">
              {lens.lensType}
            </span>
          )}
          {lens.era && (
            <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              {lens.era}
            </span>
          )}
          {lens.productionStatus && (
            <span className="rounded bg-purple-50 px-2 py-0.5 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
              {lens.productionStatus}
            </span>
          )}
          {(lens.viewCount ?? 0) > 0 && (
            <span className="text-sm text-zinc-400">
              {lens.viewCount!.toLocaleString()} views
            </span>
          )}
        </div>
      </div>

      {lens.description && (
        <div>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {lens.description}
          </p>
        </div>
      )}

      <ImageGallery images={getImages("lenses", slug, lens.images as Array<{src: string; alt: string}> || [])} />

      <RatingWidget lensId={lens.id} />

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

      {lens.url && (
        <p className="text-xs text-zinc-400">
          Source:{" "}
          <a
            href={lens.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-zinc-600"
          >
            {lens.url}
          </a>
        </p>
      )}

      <ViewTracker type="lens" id={lens.id} />
    </div>
  );
}
