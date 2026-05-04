import Link from "next/link";
import { asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { collections, lensCollections } from "@/db/schema";
import { PageTransition } from "@/components/page-transition";
import { TopBar } from "@/components/app-shell/top-bar";

export const revalidate = 604800;

export const metadata = {
  title: "Collections | The Lens DB",
  description: "Curated thematic lens collections.",
};

type CollectionRow = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  lensCount: number;
};

export default async function CollectionsPage() {
  let allCollections: CollectionRow[] = [];

  try {
    allCollections = await db
      .select({
        id: collections.id,
        name: collections.name,
        slug: collections.slug,
        description: collections.description,
        lensCount: sql<number>`count(${lensCollections.lensId})::integer`,
      })
      .from(collections)
      .leftJoin(lensCollections, eq(collections.id, lensCollections.collectionId))
      .groupBy(collections.id)
      .having(gt(sql`count(${lensCollections.lensId})`, 0))
      .orderBy(asc(collections.name));
  } catch {
    // DB not connected
  }

  const totalLenses = allCollections.reduce((acc, c) => acc + c.lensCount, 0);

  return (
    <PageTransition>
      <TopBar crumbs={[{ label: "home", href: "/" }, { label: "collections" }]}>
        <span>{allCollections.length.toLocaleString()} curated lists</span>
      </TopBar>

      <div className="mx-auto w-full max-w-[1320px] px-6 pb-24 pt-10 lg:px-10">
        <div className="mb-8 border-b border-border pb-6">
          <h1 className="text-[36px] font-medium leading-none -tracking-[0.025em]">
            Collections
          </h1>
          <div className="mono mt-3 text-[12px] text-[var(--fg-dim)]">
            <span className="text-foreground">{allCollections.length.toLocaleString()}</span>{" "}
            curated sets · {" "}
            <span className="text-foreground">{totalLenses.toLocaleString()}</span>{" "}
            lens references · grouping by use case, rarity, form factor, or cult status
          </div>
        </div>

        {allCollections.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {allCollections.map((c) => (
              <CollectionCard key={c.id} collection={c} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-[var(--fg-dim)]">
            No collections yet.
          </div>
        )}
      </div>
    </PageTransition>
  );
}

function CollectionCard({ collection: c }: { collection: CollectionRow }) {
  const ldbId = `LDB COL-${String(c.id).padStart(3, "0")}`;
  const countLabel = String(c.lensCount).padStart(2, "0");

  return (
    <Link
      href={`/collections/${c.slug}`}
      className="group relative block overflow-hidden rounded-xl border border-border bg-background p-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)]"
    >
      <span className="mono absolute right-3.5 top-3.5 rounded border border-border bg-[var(--surface-soft)] px-[7px] py-[3px] text-[10px] text-[var(--fg-dim)]">
        {countLabel} {c.lensCount === 1 ? "lens" : "lenses"}
      </span>

      <div className="mb-[18px] flex">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="relative h-11 w-11 overflow-hidden rounded-md border border-border bg-[var(--surface-sunk)]"
            style={{
              marginLeft: i === 0 ? 0 : -8,
              backgroundImage:
                "repeating-linear-gradient(-45deg, transparent 0 4px, color-mix(in oklch, var(--fg) 6%, transparent) 4px 5px)",
            }}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className="mb-1.5 text-[16px] font-medium -tracking-[0.015em]">
        {c.name}
      </div>
      {c.description && (
        <p className="line-clamp-2 text-[13px] leading-[1.5] text-[var(--fg-mid)]">
          {c.description}
        </p>
      )}

      <div className="mono mt-3 flex items-center justify-between border-t border-border pt-3 text-[10px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
        <span>{ldbId}</span>
        <span aria-hidden="true">→</span>
      </div>
    </Link>
  );
}
