import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { collections, lensCollections, lenses, systems } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export const revalidate = 604800;

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
  return {
    title: result
      ? `${result.collection.name} | Lens DB`
      : "Collection Not Found",
  };
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

  // Fetch lenses in this collection
  const collectionLenses = await db
    .select({ lens: lenses, system: systems })
    .from(lensCollections)
    .innerJoin(lenses, eq(lensCollections.lensId, lenses.id))
    .leftJoin(systems, eq(lenses.systemId, systems.id))
    .where(eq(lensCollections.collectionId, collection.id))
    .orderBy(asc(lenses.name));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Link
        href="/collections"
        className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        &larr; Back to collections
      </Link>

      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          {collection.name}
        </h1>
        {collection.description && (
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            {collection.description}
          </p>
        )}
        <p className="mt-1 text-sm text-zinc-400">
          {collectionLenses.length}{" "}
          {collectionLenses.length === 1 ? "lens" : "lenses"}
        </p>
      </div>

      {collectionLenses.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="pb-3 pr-4 font-medium">Name</th>
                <th className="pb-3 pr-4 font-medium">Brand</th>
                <th className="pb-3 pr-4 font-medium">System</th>
                <th className="pb-3 pr-4 font-medium">Focal Length</th>
                <th className="pb-3 pr-4 font-medium">Aperture</th>
                <th className="pb-3 font-medium">Year</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {collectionLenses.map(({ lens, system }) => (
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
                  <td className="py-3 pr-4 text-zinc-500">
                    {system?.name || "\u2014"}
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
                  <td className="py-3 text-zinc-600 dark:text-zinc-400">
                    {lens.yearIntroduced || "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-zinc-500">
            No lenses in this collection yet.
          </p>
        </div>
      )}
    </div>
  );
}
