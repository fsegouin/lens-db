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
        Their kit
      </h2>

      {!profile.kitIsPublic ? (
        <p className="mt-3 text-muted-foreground">Not public.</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-muted-foreground">Nothing listed yet.</p>
      ) : (
        <>
          {(
            [
              ["lens", "Lenses"],
              ["camera", "Cameras"],
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
              </section>
            );
          })}

          <p className="mt-6 text-sm text-muted-foreground">
            Values are the midpoint of recorded sales.
          </p>
        </>
      )}
    </div>
  );
}
