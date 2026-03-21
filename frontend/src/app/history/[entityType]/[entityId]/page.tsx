import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { lenses, cameras, systems, collections, lensSeries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getRevisionHistory, type EntityType } from "@/lib/revisions";
import BackButton from "@/components/BackButton";
import { PageTransition } from "@/components/page-transition";
import RevisionList from "@/components/RevisionList";

export const revalidate = 0; // Always fresh

const validTypes = new Set(["lens", "camera", "system", "collection", "series"]);

const entityTables = {
  lens: lenses,
  camera: cameras,
  system: systems,
  collection: collections,
  series: lensSeries,
} as const;

async function getEntityName(
  entityType: EntityType,
  entityId: number
): Promise<{ name: string; slug: string } | null> {
  const table = entityTables[entityType];
  const [row] = await db
    .select({ name: table.name, slug: table.slug })
    .from(table)
    .where(eq(table.id, entityId))
    .limit(1);
  return row ?? null;
}

function entityBackLink(entityType: EntityType, slug: string): string {
  switch (entityType) {
    case "lens": return `/lenses/${slug}`;
    case "camera": return `/cameras/${slug}`;
    case "system": return `/systems/${slug}`;
    case "collection": return `/collections/${slug}`;
    case "series": return `/series/${slug}`;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ entityType: string; entityId: string }>;
}) {
  const { entityType, entityId } = await params;
  if (!validTypes.has(entityType)) return { title: "Not Found" };
  const entity = await getEntityName(entityType as EntityType, parseInt(entityId, 10));
  return {
    title: entity
      ? `Revision History: ${entity.name} | The Lens DB`
      : "Revision History | The Lens DB",
  };
}

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ entityType: string; entityId: string }>;
}) {
  const { entityType, entityId: entityIdStr } = await params;
  if (!validTypes.has(entityType)) notFound();

  const type = entityType as EntityType;
  const entityId = parseInt(entityIdStr, 10);
  if (isNaN(entityId)) notFound();

  const entity = await getEntityName(type, entityId);
  if (!entity) notFound();

  const { revisions, total } = await getRevisionHistory(type, entityId, 1, 100);

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-6">
        <BackButton
          fallbackHref={entityBackLink(type, entity.slug)}
          label={`Back to ${entity.name}`}
        />

        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Revision History
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link
              href={entityBackLink(type, entity.slug)}
              className="hover:underline"
            >
              {entity.name}
            </Link>
            {" "}— {total} revision{total !== 1 ? "s" : ""}
          </p>
        </div>

        {revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No revision history available yet.
          </p>
        ) : (
          <RevisionList
            revisions={revisions}
            entityType={type}
            entityId={entityId}
          />
        )}
      </div>
    </PageTransition>
  );
}
