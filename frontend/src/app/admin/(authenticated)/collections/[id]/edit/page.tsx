import { notFound } from "next/navigation";
import { db } from "@/db";
import { collections, lensCollections, lenses } from "@/db/schema";
import { eq } from "drizzle-orm";
import CollectionForm from "@/components/admin/CollectionForm";
import CollectionLensManager from "@/components/admin/CollectionLensManager";
import EditPageWithReport from "@/components/admin/EditPageWithReport";

export const dynamic = "force-dynamic";

export default async function EditCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const collection = await db
    .select()
    .from(collections)
    .where(eq(collections.id, parseInt(id)))
    .then((r) => r[0]);

  if (!collection) notFound();

  const collectionLenses = await db
    .select({
      id: lenses.id,
      name: lenses.name,
      brand: lenses.brand,
    })
    .from(lensCollections)
    .innerJoin(lenses, eq(lensCollections.lensId, lenses.id))
    .where(eq(lensCollections.collectionId, parseInt(id)));

  return (
    <EditPageWithReport title="Edit Collection">
      <CollectionForm collection={collection} />
      <CollectionLensManager
        collectionId={collection.id}
        initialLenses={collectionLenses}
      />
    </EditPageWithReport>
  );
}
