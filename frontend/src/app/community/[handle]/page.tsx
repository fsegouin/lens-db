import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import ChangeList from "@/components/ChangeList";
import { formatMoney, getKitItems, getProfile, kitValue } from "@/lib/kit";
import type { KitEntityType, KitItem } from "@/lib/kit-shared";
import { getRecentChangesByUser } from "@/lib/recent-changes";
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
    path: `/community/${handle}`,
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

/** Counted like the total, so two of one lens is two items in both places. */
function countOf(items: KitItem[], type: KitEntityType): number {
  return items.filter((i) => i.entityType === type).reduce((n, i) => n + i.quantity, 0);
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
  const [items, changes] = await Promise.all([
    profile.kitIsPublic ? getKitItems(profile.id) : Promise.resolve([]),
    getRecentChangesByUser(profile.id, 10).catch(() => []),
  ]);
  const editCount = profile.editCount ?? 0;

  // Public means what they own; what they paid is a second, separate choice.
  const showsPaid = profile.kitIsPublic && profile.kitShowsPaid;
  const value = kitValue(items);
  const unpriced = value.totalItems - value.pricedItems;

  const since = monthYear(profile.createdAt);

  return (
    <div className="w-full max-w-3xl">
      <Breadcrumb
        crumbs={[{ name: "Community", path: "/community" }, { name: profile.displayName }]}
      />

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-balance">
          {profile.displayName}
        </h1>
        {since && (
          <p className="text-sm text-muted-foreground">Here since {since}</p>
        )}
      </div>

      <h2 className="mt-8 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Kit
      </h2>

      {!profile.kitIsPublic ? (
        <p className="mt-3 text-muted-foreground">Not public.</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-muted-foreground">Nothing listed yet.</p>
      ) : (
        <>
          {/* The same figures the owner sees on their own kit page, with the
              same coverage attached: a total that quietly skipped the unpriced
              third of a kit would read as authoritative and be wrong. */}
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Estimated value
              </p>
              <p className="mt-1 font-mono text-2xl tabular-nums">
                {value.pricedItems > 0
                  ? formatMoney(value.estimatedUsd, "USD")
                  : "Not priced yet"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {value.pricedItems === 0
                  ? "No recorded sales for these"
                  : unpriced === 0
                    ? "All items priced"
                    : `${value.pricedItems} of ${value.totalItems} items priced`}
              </p>
            </div>
            {showsPaid && value.paidItems > 0 && (
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  What they paid
                </p>
                <p className="mt-1 font-mono text-2xl tabular-nums">
                  {formatMoney(value.paid, profile.kitCurrency)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {`${value.paidItems} of ${value.totalItems} items filled in`}
                </p>
              </div>
            )}
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Items
              </p>
              <p className="mt-1 font-mono text-2xl tabular-nums">{value.totalItems}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {countOf(items, "lens")} {countOf(items, "lens") === 1 ? "lens" : "lenses"},{" "}
                {countOf(items, "camera")} {countOf(items, "camera") === 1 ? "body" : "bodies"}
              </p>
            </div>
          </div>

          {(
            [
              ["lens", "Lenses they own"],
              ["camera", "Cameras they own"],
            ] as const
          ).map(([type, label]) => {
            const section = items.filter((i) => i.entityType === type);
            if (section.length === 0) return null;
            return (
              <section key={type} className="mt-6">
                <h3 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
                  {label}
                </h3>
                <ul className="divide-y divide-border border-y border-border">
                  {section.map((item) => (
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
                          {showsPaid && item.acquiredPrice != null && (
                            <span className="block text-xs">
                              paid {formatMoney(item.acquiredPrice, profile.kitCurrency)}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <p className="mt-6 text-sm text-muted-foreground">
            Values are the midpoint of recorded sales.
          </p>
        </>
      )}

      {/* Edits are public by nature: they are already on the record's history
          page under this name. Gathering them here is the credit. */}
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Contributions
          </h2>
          <p className="font-mono text-sm tabular-nums text-muted-foreground">
            {editCount.toLocaleString()} {editCount === 1 ? "approved edit" : "approved edits"}
          </p>
        </div>
        <div className="mt-3">
          <ChangeList changes={changes} showEditor={false} />
        </div>
      </section>
    </div>
  );
}
