import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { collections, lensCollections, lenses, systems } from "@/db/schema";
import { PageTransition } from "@/components/page-transition";
import { TopBar } from "@/components/app-shell/top-bar";

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
    title: result ? `${result.collection.name} | The Lens DB` : "Collection Not Found",
  };
}

function splitTitleEm(name: string): { main: string; em: string } {
  const trimmed = name.trim();
  const spaceIdx = trimmed.lastIndexOf(" ");
  if (spaceIdx > 0) {
    return { main: trimmed.slice(0, spaceIdx + 1), em: trimmed.slice(spaceIdx + 1) };
  }
  return { main: "", em: trimmed };
}

function formatCuratedDate(date: Date | null): string | null {
  if (!date) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
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

  const collectionLenses = await db
    .select({ lens: lenses, system: systems })
    .from(lensCollections)
    .innerJoin(lenses, eq(lensCollections.lensId, lenses.id))
    .leftJoin(systems, eq(lenses.systemId, systems.id))
    .where(eq(lensCollections.collectionId, collection.id))
    .orderBy(
      asc(sql`regexp_replace(${lenses.name}, '\\d+(\\.\\d+)?mm.*$', '')`),
      asc(lenses.focalLengthMin),
      asc(lenses.apertureMin),
    );

  const ldbId = `LDB COL-${String(collection.id).padStart(3, "0")}`;
  const curated = formatCuratedDate(collection.createdAt);
  const title = splitTitleEm(collection.name);

  const systemCounts = new Map<string, number>();
  for (const { system } of collectionLenses) {
    if (!system) continue;
    systemCounts.set(system.name, (systemCounts.get(system.name) ?? 0) + 1);
  }
  const topSystems = [...systemCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <PageTransition>
      <TopBar
        crumbs={[
          { label: "home", href: "/" },
          { label: "collections", href: "/collections" },
          { label: collection.name.toLowerCase() },
        ]}
      >
        <span>collection · {collectionLenses.length} {collectionLenses.length === 1 ? "lens" : "lenses"}</span>
      </TopBar>

      <div className="mx-auto w-full max-w-[1320px] px-6 pb-24 pt-10 lg:px-10">
        <header className="mb-10 border-b border-border pb-7">
          <div className="mono mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tracking-[0.02em] text-[var(--fg-dim)]">
            <span>
              <span className="text-[var(--fg-faint)]">LDB</span> {ldbId.replace("LDB ", "")}
            </span>
            {curated && (
              <>
                <span className="text-[var(--fg-faint)]">·</span>
                <span>curated {curated}</span>
              </>
            )}
          </div>
          <h1 className="text-[44px] font-medium leading-[1.05] -tracking-[0.025em]">
            {title.main}
            <em className="hero-title-em">{title.em}</em>
          </h1>
          {collection.description && (
            <p className="mt-5 max-w-[720px] text-[14.5px] leading-[1.65] text-[var(--fg-mid)]">
              {collection.description}
            </p>
          )}
          {topSystems.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {topSystems.map(([name, count]) => (
                <span
                  key={name}
                  className="mono rounded border border-border bg-[var(--surface-soft)] px-2 py-1 text-[10px] uppercase tracking-[0.06em] text-[var(--fg-dim)]"
                >
                  {name}{" "}
                  <span className="text-[var(--fg-faint)]">· {count}</span>
                </span>
              ))}
            </div>
          )}
        </header>

        {collectionLenses.length > 0 ? (
          <>
            <div className="mb-3 flex items-end justify-between gap-4">
              <h2 className="text-[20px] font-medium -tracking-[0.015em]">
                Lenses in this collection
                <span className="mono ml-3 text-[12px] text-[var(--fg-faint)]">
                  / {collectionLenses.length} across {systemCounts.size}{" "}
                  {systemCounts.size === 1 ? "mount" : "mounts"}
                </span>
              </h2>
              <Link
                href={`/lenses/compare`}
                className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--fg-dim)] hover:text-foreground"
              >
                Compare all →
              </Link>
            </div>

            <LensTable rows={collectionLenses} />
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-[var(--fg-dim)]">
            No lenses in this collection yet.
          </div>
        )}
      </div>
    </PageTransition>
  );
}

type LensRow = {
  lens: typeof lenses.$inferSelect;
  system: typeof systems.$inferSelect | null;
};

function LensTable({ rows }: { rows: LensRow[] }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-background">
      <div className="mono grid grid-cols-[56px_2.6fr_1fr_0.9fr_0.6fr_0.7fr_0.7fr_36px] items-center gap-3 border-b border-border bg-[var(--surface-soft)] px-3.5 py-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--fg-dim)]">
        <span />
        <span>Lens</span>
        <span>System</span>
        <span>Focal</span>
        <span>ƒ</span>
        <span>Year</span>
        <span>Rating</span>
        <span />
      </div>
      {rows.map(({ lens, system }) => {
        const focal = lens.focalLengthMin
          ? lens.focalLengthMin === lens.focalLengthMax
            ? `${lens.focalLengthMin}mm`
            : `${lens.focalLengthMin}–${lens.focalLengthMax}mm`
          : null;
        const aperture = lens.apertureMin ? `f/${lens.apertureMin}` : null;
        const lensIdLabel = `LDB 06-${String(lens.id).padStart(5, "0")}`;
        return (
          <Link
            key={lens.id}
            href={`/lenses/${lens.slug}`}
            className="grid cursor-pointer grid-cols-[56px_2.6fr_1fr_0.9fr_0.6fr_0.7fr_0.7fr_36px] items-center gap-3 border-b border-[var(--line-soft)] px-3.5 py-3 transition-colors last:border-b-0 hover:bg-[var(--surface-soft)]"
          >
            <div
              className="relative h-11 w-11 overflow-hidden rounded bg-[var(--surface-sunk)]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(-45deg, transparent 0 4px, color-mix(in oklch, var(--fg) 5%, transparent) 4px 5px)",
              }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-medium leading-[1.3] -tracking-[0.01em]">
                {lens.name}
              </div>
              <div className="mono mt-0.5 text-[10px] tracking-[0.02em] text-[var(--fg-faint)]">
                {lensIdLabel}
              </div>
            </div>
            <span className="mono truncate text-[12px] text-[var(--fg-mid)]">
              {system?.name ?? "—"}
            </span>
            <span className="mono text-[12px] text-foreground">{focal ?? "—"}</span>
            <span className="mono text-[12px] text-foreground">{aperture ?? "—"}</span>
            <span className="mono text-[12px] text-[var(--fg-mid)]">
              {lens.yearIntroduced ?? "—"}
            </span>
            <span className="mono text-[12px] text-[var(--hot)]">
              {lens.averageRating ? `★ ${lens.averageRating.toFixed(1)}` : "—"}
            </span>
            <span aria-hidden="true" className="text-[var(--fg-faint)]">›</span>
          </Link>
        );
      })}
    </div>
  );
}
