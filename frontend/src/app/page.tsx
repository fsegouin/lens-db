import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { db } from "@/db";
import { lenses, systems } from "@/db/schema";
import { desc, eq, gt, sql } from "drizzle-orm";
import { PageTransition } from "@/components/page-transition";
import { TopBar } from "@/components/app-shell/top-bar";
import { HomeCommandBar } from "@/components/home-command-bar";

export const revalidate = 604800;

const STATS = [
  { label: "Lenses indexed", value: "7,412", delta: "+38 this month", href: "/lenses" },
  { label: "Cameras", value: "1,083", delta: "+12 this month", href: "/cameras" },
  { label: "Mount systems", value: "134", delta: "canonical", href: "/systems" },
  { label: "Collections", value: "52", delta: "curated", href: "/collections" },
];

const COMMAND_CHIPS = [
  { label: "Lenses", href: "/lenses", active: true },
  { label: "Cameras", href: "/cameras" },
  { label: "Systems", href: "/systems" },
  { label: "Collections", href: "/collections" },
  { label: "Primes", href: "/lenses?type=prime" },
  { label: "Full frame", href: "/lenses?coverage=full-frame" },
  { label: "Autofocus", href: "/lenses?hasAutofocus=true" },
];

function formatFocal(min: number | null, max: number | null) {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max}mm`;
  return `${min ?? max}mm`;
}

function formatAperture(ap: number | null) {
  if (ap == null) return null;
  return `ƒ/${ap}`;
}

function formatWeight(g: number | null) {
  if (g == null) return null;
  return `${Math.round(g)}g`;
}

function ApertureIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

export default async function Home() {
  const popularLenses = await db
    .select({ lens: lenses, system: systems })
    .from(lenses)
    .leftJoin(systems, eq(lenses.systemId, systems.id))
    .where(gt(lenses.viewCount, 0))
    .orderBy(desc(lenses.viewCount))
    .limit(10)
    .catch(() => []);

  const topComparisons = await db.execute(sql`
    (
      SELECT
        c.view_count,
        l1.name as item1_name, l1.slug as item1_slug,
        l2.name as item2_name, l2.slug as item2_slug,
        'lens' as type
      FROM lens_comparisons c
      JOIN lenses l1 ON c.lens_id_1 = l1.id
      JOIN lenses l2 ON c.lens_id_2 = l2.id
    )
    UNION ALL
    (
      SELECT
        c.view_count,
        c1.name as item1_name, c1.slug as item1_slug,
        c2.name as item2_name, c2.slug as item2_slug,
        'camera' as type
      FROM camera_comparisons c
      JOIN cameras c1 ON c.camera_id_1 = c1.id
      JOIN cameras c2 ON c.camera_id_2 = c2.id
    )
    ORDER BY view_count DESC
    LIMIT 10
  `).then(r => r.rows as Array<{ view_count: number; item1_name: string; item1_slug: string; item2_name: string; item2_slug: string; type: string }>).catch(() => []);

  return (
    <PageTransition>
      <TopBar crumbs={[{ label: "/", href: "/" }, { label: "home" }]}>
        <span className="hidden items-center gap-2 sm:inline-flex">
          <span className="live-dot" />
          <span>{popularLenses.length > 0 ? "live · continuously updated" : "reference"}</span>
        </span>
      </TopBar>

      <div className="mx-auto w-full max-w-[1320px] px-6 pb-24 pt-10 lg:px-10">
        {/* Hero */}
        <section className="max-w-[900px]">
          <div className="eyebrow mb-6">The Lens DB · Reference</div>
          <h1 className="text-[clamp(40px,5vw,68px)] font-medium leading-[0.98] -tracking-[0.03em]">
            Every{" "}
            <em className="hero-title-em">interchangeable</em>
            <br />
            lens ever made, indexed.
          </h1>
          <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-[var(--fg-mid)]">
            A precise reference for 7,400+ lenses across 130+ mount systems — specs, optics,
            compatibility, used-market prices and community ratings, cross-linked and
            continuously updated.
          </p>
        </section>

        {/* Command bar */}
        <HomeCommandBar
          chips={COMMAND_CHIPS}
          totalsLine="7,400+ lenses · 1,000+ cameras · 50+ collections"
        />

        {/* Stats */}
        <section className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
          {STATS.map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="group bg-background p-6 transition-colors hover:bg-[var(--surface-soft)]"
            >
              <div className="mono mb-3.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-[var(--fg-faint)]">
                <span className="size-[5px] rounded-full bg-foreground" />
                {stat.label}
              </div>
              <div className="text-[38px] font-medium leading-none -tracking-[0.03em]">
                {stat.value}
              </div>
              <div className="mono mt-1 text-[11px] text-[var(--fg-dim)]">
                {stat.delta.startsWith("+") ? (
                  <>
                    <span className="text-[var(--pos)]">{stat.delta.split(" ")[0]}</span>{" "}
                    {stat.delta.split(" ").slice(1).join(" ")}
                  </>
                ) : (
                  stat.delta
                )}
              </div>
            </Link>
          ))}
        </section>

        {/* Popular lenses */}
        {popularLenses.length > 0 && (
          <section className="mt-16">
            <div className="ldb-section-head mb-5">
              <h2>
                Popular this week
                <span className="section-n">/ top {popularLenses.length}</span>
              </h2>
              <Link href="/lenses" className="section-act">
                All lenses <ArrowRight className="size-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-5">
              {popularLenses.map(({ lens, system }, i) => {
                const focal = formatFocal(lens.focalLengthMin, lens.focalLengthMax);
                const ap = formatAperture(lens.apertureMin);
                const wt = formatWeight(lens.weightG);
                const spec = [focal, ap, wt].filter(Boolean).join(" · ");
                return (
                  <Link
                    key={lens.id}
                    href={`/lenses/${lens.slug}`}
                    className="group flex min-h-[220px] flex-col gap-3.5 bg-background p-4 transition-colors hover:bg-[var(--surface-soft)]"
                  >
                    <div className="mono flex justify-between text-[10px] tracking-[0.04em] text-[var(--fg-faint)]">
                      <span>#{String(i + 1).padStart(2, "0")}</span>
                      <span className="truncate pl-2">{system?.name || lens.brand || "—"}</span>
                    </div>
                    <div className="hatch relative flex min-h-[100px] flex-1 items-center justify-center rounded bg-[var(--surface-sunk)] text-[var(--fg-faint)]">
                      <ApertureIcon className="size-7 relative z-10" />
                    </div>
                    <div>
                      <div className="text-[13px] font-medium leading-tight -tracking-[0.01em] group-hover:underline">
                        {lens.name}
                      </div>
                      <div className="mono mt-2 flex items-center justify-between text-[10px] text-[var(--fg-dim)]">
                        <span className="truncate">{spec || "—"}</span>
                        {lens.averageRating != null && (
                          <span className="flex items-center gap-1 text-[var(--hot)]">
                            <Star className="size-2.5 fill-current" />
                            {lens.averageRating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div className="mono mt-1 flex items-center justify-between text-[10px] text-[var(--fg-faint)]">
                        <span>{lens.viewCount?.toLocaleString()} views</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Most compared */}
        {topComparisons.length > 0 && (
          <section className="mt-16">
            <div className="ldb-section-head mb-5">
              <h2>
                Most compared
                <span className="section-n">/ running 30d</span>
              </h2>
              <Link href="/compare" className="section-act">
                Start a comparison <ArrowRight className="size-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {topComparisons.map((c, i) => (
                <Link
                  key={i}
                  href={`/compare?type=${c.type}&item1=${c.item1_slug}&item2=${c.item2_slug}`}
                  className="group grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-[10px] border border-border bg-background px-4 py-3.5 transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-soft)]"
                >
                  <div className="mono text-[11px] text-[var(--fg-faint)]">
                    #{String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="flex min-w-0 items-center gap-2.5 text-[13px] font-medium">
                    <span className="truncate">{c.item1_name}</span>
                    <span className="mono rounded border border-border bg-[var(--surface-soft)] px-1.5 py-0.5 text-[10px] text-[var(--fg-dim)]">
                      VS
                    </span>
                    <span className="truncate">{c.item2_name}</span>
                  </div>
                  <div className="mono text-[10px] text-[var(--fg-faint)]">
                    {c.view_count.toLocaleString()}×
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* About */}
        <section className="mt-20">
          <div className="ldb-section-head mb-6">
            <h2>About the project</h2>
          </div>
          <div className="max-w-[720px] space-y-3.5 text-[14.5px] leading-[1.7] text-[var(--fg-mid)]">
            <p>
              The Lens DB is a community reference for interchangeable camera lenses, rebuilding
              and extending the dataset originally compiled at lens-db.com (2012–2025). Every
              entry is sourced from manufacturer booklets, catalogues and datasheets, with specs
              normalized into a single schema.
            </p>
            <p>
              Spot an inaccuracy? Each lens, camera and system page carries a{" "}
              <span className="mono text-foreground">Report</span> action — community edits get
              reviewed and merged weekly.
            </p>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
