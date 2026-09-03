import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import { formatMoney, getKitItems, getProfile } from "@/lib/kit";
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
  const profile = await getProfile(handle);
  if (!profile) return { title: "Profile Not Found", robots: { index: false } };

  return entityMetadata({
    title: `${profile.displayName} on The Lens DB`,
    description: profile.kitIsPublic
      ? `The lenses and cameras ${profile.displayName} owns.`
      : `${profile.displayName} on The Lens DB.`,
    path: `/people/${handle}`,
  });
}

/**
 * The cache serialises Dates to strings on the way back out, so this takes
 * either and refuses anything it cannot read rather than throwing.
 */
function monthYear(
  value: Date | string | null,
  month: "long" | "short" = "long",
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { month, year: "numeric" }).format(date);
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const profile = await getProfile(handle);
  if (!profile) notFound();

  // Everyone has a profile; the kit on it is shown only if its owner said so.
  const items = profile.kitIsPublic ? await getKitItems(profile.id) : [];

  const since = monthYear(profile.createdAt);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Breadcrumb
        crumbs={[{ name: "People", path: "/people" }, { name: profile.displayName }]}
      />

      <h1 className="mt-4 text-3xl font-bold tracking-tight text-balance">
        {profile.displayName}
      </h1>
      {since && (
        <p className="mt-1 text-sm text-muted-foreground">Here since {since}</p>
      )}

      <h2 className="mt-8 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Their kit
      </h2>

      {!profile.kitIsPublic ? (
        <p className="mt-3 text-muted-foreground">Not public.</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-muted-foreground">Nothing listed yet.</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-border border-y border-border">
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
                        item.acquiredYear && `bought ${item.acquiredYear}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-mono text-sm tabular-nums text-muted-foreground">
                    {item.estimatedUsd != null
                      ? formatMoney(item.estimatedUsd, "USD")
                      : ""}
                    {item.acquiredPrice != null && (
                      <span className="block text-xs">
                        paid {formatMoney(item.acquiredPrice, profile.kitCurrency)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-sm text-muted-foreground">
            Values are the midpoint of recorded sales.
          </p>
        </>
      )}
    </div>
  );
}
