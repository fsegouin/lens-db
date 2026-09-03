import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import { getKitItems, getPublicKitOwner, kitValue } from "@/lib/kit";
import { entityMetadata } from "@/lib/seo";

export const revalidate = 300;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const owner = await getPublicKitOwner(handle);
  if (!owner) return { title: "Kit Not Found", robots: { index: false } };

  return entityMetadata({
    title: `${owner.displayName}'s kit`,
    description: `The lenses and cameras ${owner.displayName} owns, on The Lens DB.`,
    path: `/kit/${handle}`,
  });
}

function money(n: number): string {
  return `$${n.toLocaleString()}`;
}

export default async function PublicKitPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const owner = await getPublicKitOwner(handle);
  // A private kit and a handle that does not exist look the same from outside,
  // so that publishing and unpublishing is not observable.
  if (!owner) notFound();

  const items = await getKitItems(owner.id);
  const value = kitValue(items);

  // Counted the same way as the total, so owning two of one lens does not
  // read as "3 items: 1 lens and 1 body".
  const countOf = (type: "lens" | "camera") =>
    items.filter((i) => i.entityType === type).reduce((n, i) => n + i.quantity, 0);
  const lensCount = countOf("lens");
  const cameraCount = countOf("camera");

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Breadcrumb crumbs={[{ name: `${owner.displayName}'s kit` }]} />

      <h1 className="mt-4 text-3xl font-bold tracking-tight text-balance">
        {owner.displayName}&rsquo;s kit
      </h1>

      {items.length === 0 ? (
        <p className="mt-3 text-lg text-muted-foreground">
          Nothing listed yet.
        </p>
      ) : (
        <>
          <p className="mt-3 text-lg leading-relaxed">
            {value.totalItems} {value.totalItems === 1 ? "item" : "items"}:{" "}
            {lensCount} {lensCount === 1 ? "lens" : "lenses"} and {cameraCount}{" "}
            {cameraCount === 1 ? "body" : "bodies"}
            {value.pricedItems > 0 && (
              <>
                , worth about {money(value.estimatedUsd)} used across the{" "}
                {value.pricedItems} with a recorded price
              </>
            )}
            .
          </p>

          <ul className="mt-8 divide-y divide-border border-y border-border">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/${item.entityType === "lens" ? "lenses" : "cameras"}/${item.slug}`}
                  className="flex items-baseline justify-between gap-4 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="font-medium leading-snug">{item.name}</span>
                    {item.quantity > 1 && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        &times;{item.quantity}
                      </span>
                    )}
                    <span className="block font-mono text-xs text-muted-foreground">
                      {[
                        item.entityType === "lens" ? "Lens" : "Camera",
                        item.yearIntroduced,
                        item.condition,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                    {item.estimatedUsd != null ? money(item.estimatedUsd) : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-sm text-muted-foreground">
            Values are the midpoint of the used range this site records for each
            item, from completed sales rather than asking prices. What the owner
            paid, their serial numbers and their notes are not shown.
          </p>
        </>
      )}
    </div>
  );
}
