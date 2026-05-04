import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, isNull, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { cameras, lenses, systems } from "@/db/schema";
import ViewTracker from "@/components/ViewTracker";
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
    .select({ system: systems })
    .from(systems)
    .where(eq(systems.slug, slug))
    .limit(1);

  return {
    title: result ? `${result.system.name} | The Lens DB` : "System Not Found",
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

const FOCAL_BUCKETS = 42;
const FOCAL_MIN = 8;
const FOCAL_MAX = 800;
const FOCAL_LOG_RATIO = Math.log(FOCAL_MAX / FOCAL_MIN);
const FOCAL_LABEL_POINTS: number[] = [8, 14, 24, 35, 50, 85, 135, 200, 400, 800];

function focalToBucket(focal: number): number {
  const idx = Math.floor((Math.log(focal / FOCAL_MIN) / FOCAL_LOG_RATIO) * FOCAL_BUCKETS);
  return Math.max(0, Math.min(FOCAL_BUCKETS - 1, idx));
}

function computeFocalDistribution(
  rows: { min: number | null; max: number | null }[],
): { heights: number[]; total: number } {
  const counts = new Array<number>(FOCAL_BUCKETS).fill(0);
  let total = 0;
  for (const r of rows) {
    if (!r.min) continue;
    const max = r.max ?? r.min;
    if (max <= 0) continue;
    const repFocal = Math.sqrt(r.min * max);
    const bucket = focalToBucket(repFocal);
    counts[bucket]++;
    total++;
  }
  const peak = Math.max(1, ...counts);
  const heights = counts.map((c) => c / peak);
  return { heights, total };
}

type Tab = "lenses" | "cameras";
const TABS: Tab[] = ["lenses", "cameras"];

export default async function SystemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab: rawTab } = await searchParams;

  const [result] = await db
    .select({ system: systems })
    .from(systems)
    .where(eq(systems.slug, slug))
    .limit(1);

  if (!result) notFound();
  const { system } = result;

  const [lensRows, cameraRows, focalRows, makerRows] = await Promise.all([
    db
      .select()
      .from(lenses)
      .where(and(eq(lenses.systemId, system.id), isNull(lenses.mergedIntoId)))
      .orderBy(
        asc(sql`regexp_replace(${lenses.name}, '\\d+(\\.\\d+)?mm.*$', '')`),
        asc(lenses.focalLengthMin),
        asc(lenses.apertureMin),
      )
      .limit(500),
    db
      .select()
      .from(cameras)
      .where(and(eq(cameras.systemId, system.id), isNull(cameras.mergedIntoId)))
      .orderBy(asc(cameras.name))
      .limit(500),
    db
      .select({ min: lenses.focalLengthMin, max: lenses.focalLengthMax })
      .from(lenses)
      .where(and(eq(lenses.systemId, system.id), isNull(lenses.mergedIntoId))),
    db
      .selectDistinct({ brand: lenses.brand })
      .from(lenses)
      .where(and(eq(lenses.systemId, system.id), isNull(lenses.mergedIntoId))),
  ]);

  const lensCount = lensRows.length;
  const cameraCount = cameraRows.length;
  const makerCount = makerRows.filter((m) => m.brand).length;
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "lenses";

  const ldbId = `LDB SYS-${String(system.id).padStart(3, "0")}`;
  const title = splitTitleEm(system.name);
  const { heights: focalHeights, total: focalTotal } = computeFocalDistribution(focalRows);
  const peakBuckets = new Set(
    focalHeights
      .map((h, i) => ({ h, i }))
      .sort((a, b) => b.h - a.h)
      .slice(0, 3)
      .filter((x) => x.h > 0)
      .map((x) => x.i),
  );

  return (
    <PageTransition>
      <TopBar
        crumbs={[
          { label: "home", href: "/" },
          { label: "systems", href: "/systems" },
          { label: system.name.toLowerCase() },
        ]}
      >
        <span>entry {String(system.id).padStart(5, "0")}</span>
      </TopBar>

      <div className="mx-auto w-full max-w-[1200px] px-6 pb-24 pt-10 lg:px-10">
        <header className="mb-10 border-b border-border pb-7">
          <div className="mono mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tracking-[0.02em] text-[var(--fg-dim)]">
            <span>
              <span className="text-[var(--fg-faint)]">LDB</span> {ldbId.replace("LDB ", "")}
            </span>
            {(system.viewCount ?? 0) > 0 && (
              <>
                <span className="text-[var(--fg-faint)]">·</span>
                <span>{system.viewCount!.toLocaleString()} views</span>
              </>
            )}
          </div>
          <h1 className="text-[44px] font-medium leading-[1.05] -tracking-[0.025em]">
            {title.main}
            <em className="hero-title-em">{title.em}</em>{" "}
            <span className="text-[var(--fg-mid)]">mount system</span>
          </h1>
          <div className="mt-5 flex flex-wrap gap-2">
            {system.manufacturer && (
              <span className="mono rounded border border-border bg-[var(--surface-soft)] px-2 py-1 text-[10px] uppercase tracking-[0.06em] text-[var(--fg-dim)]">
                {system.manufacturer}
              </span>
            )}
            {system.mountType && (
              <span className="mono rounded border border-border bg-[var(--surface-soft)] px-2 py-1 text-[10px] uppercase tracking-[0.06em] text-[var(--fg-dim)]">
                {system.mountType}
              </span>
            )}
          </div>
        </header>

        <div className="mb-10 space-y-6">
          {system.description && (
            <p className="max-w-[720px] text-[15px] leading-[1.65] text-[var(--fg-mid)]">
              {system.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-border bg-border md:grid-cols-3">
            <Stat label="Lenses" value={lensCount.toLocaleString()} />
            <Stat label="Cameras" value={cameraCount.toLocaleString()} />
            <Stat label="Manufacturers" value={makerCount.toLocaleString()} />
          </div>

          {focalTotal > 0 && (
            <div className="overflow-hidden rounded-[10px] border border-border">
              <div className="flex items-center justify-between border-b border-border bg-[var(--surface-soft)] px-4 py-2.5">
                <h3 className="text-[13px] font-medium">Focal length distribution</h3>
                <span className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
                  {focalTotal.toLocaleString()} indexed
                </span>
              </div>
              <FocalChart heights={focalHeights} peakBuckets={peakBuckets} />
            </div>
          )}
        </div>

        <div className="mb-6 flex gap-0.5 border-b border-border">
          <TabLink slug={system.slug} value="lenses" label="Lenses" count={lensCount} active={tab === "lenses"} />
          <TabLink slug={system.slug} value="cameras" label="Cameras" count={cameraCount} active={tab === "cameras"} />
        </div>

        {tab === "lenses" ? (
          <LensTable rows={lensRows} />
        ) : (
          <CameraTable rows={cameraRows} />
        )}

        <ViewTracker type="system" id={system.id} />
      </div>
    </PageTransition>
  );
}

function FocalChart({
  heights,
  peakBuckets,
}: {
  heights: number[];
  peakBuckets: Set<number>;
}) {
  const labelOrder = FOCAL_LABEL_POINTS.map((f) => focalToBucket(f));
  return (
    <div className="px-4 py-4">
      <div className="flex h-[110px] items-end gap-[2px]">
        {heights.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-[1px]"
            style={{
              height: `${Math.max(3, h * 100)}%`,
              minHeight: 2,
              background: peakBuckets.has(i) ? "var(--hot)" : "var(--fg)",
            }}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="mono relative mt-2 text-[10px] tracking-[0.04em] text-[var(--fg-faint)]">
        {FOCAL_LABEL_POINTS.map((label, idx) => {
          const bucket = labelOrder[idx];
          const left = (bucket / (FOCAL_BUCKETS - 1)) * 100;
          return (
            <span
              key={label}
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${left}%` }}
            >
              {label}
            </span>
          );
        })}
        <span className="invisible block">8</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background p-4">
      <div className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
        {label}
      </div>
      <div className="mt-1 text-[28px] font-medium leading-none -tracking-[0.02em] tabular-nums">
        {value}
      </div>
    </div>
  );
}

function TabLink({
  slug,
  value,
  label,
  count,
  active,
}: {
  slug: string;
  value: Tab;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={value === "lenses" ? `/systems/${slug}` : `/systems/${slug}?tab=${value}`}
      scroll={false}
      className={`-mb-px flex items-center gap-2 px-4 pb-2.5 pt-2.5 text-[13px] font-medium transition-colors ${
        active
          ? "border-b-2 border-foreground text-foreground"
          : "border-b-2 border-transparent text-[var(--fg-dim)] hover:text-[var(--fg-mid)]"
      }`}
    >
      {label}
      <span className="mono rounded bg-[var(--surface-sunk)] px-1.5 py-[1px] text-[10px] text-[var(--fg-faint)]">
        {count.toLocaleString()}
      </span>
    </Link>
  );
}

function LensTable({ rows }: { rows: (typeof lenses.$inferSelect)[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center text-[var(--fg-dim)]">
        No lenses indexed yet.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-background">
      <div className="mono grid grid-cols-[56px_2.6fr_1fr_0.9fr_0.6fr_0.7fr_0.7fr_36px] items-center gap-3 border-b border-border bg-[var(--surface-soft)] px-3.5 py-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--fg-dim)]">
        <span />
        <span>Lens</span>
        <span>Brand</span>
        <span>Focal</span>
        <span>ƒ</span>
        <span>Year</span>
        <span>Rating</span>
        <span />
      </div>
      {rows.map((lens) => {
        const focal = lens.focalLengthMin
          ? lens.focalLengthMin === lens.focalLengthMax
            ? `${lens.focalLengthMin}mm`
            : `${lens.focalLengthMin}–${lens.focalLengthMax}mm`
          : null;
        const aperture = lens.apertureMin ? `f/${lens.apertureMin}` : null;
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
                LDB 06-{String(lens.id).padStart(5, "0")}
              </div>
            </div>
            <span className="mono truncate text-[12px] text-[var(--fg-mid)]">
              {lens.brand ?? "—"}
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

function CameraTable({ rows }: { rows: (typeof cameras.$inferSelect)[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center text-[var(--fg-dim)]">
        No cameras indexed yet.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-background">
      <div className="mono grid grid-cols-[56px_2.4fr_1.1fr_0.9fr_0.7fr_0.7fr_36px] items-center gap-3 border-b border-border bg-[var(--surface-soft)] px-3.5 py-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--fg-dim)]">
        <span />
        <span>Camera</span>
        <span>Sensor</span>
        <span>Size</span>
        <span>MP</span>
        <span>Year</span>
        <span />
      </div>
      {rows.map((camera) => (
        <Link
          key={camera.id}
          href={`/cameras/${camera.slug}`}
          className="grid cursor-pointer grid-cols-[56px_2.4fr_1.1fr_0.9fr_0.7fr_0.7fr_36px] items-center gap-3 border-b border-[var(--line-soft)] px-3.5 py-3 transition-colors last:border-b-0 hover:bg-[var(--surface-soft)]"
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
              {camera.name}
            </div>
            <div className="mono mt-0.5 text-[10px] tracking-[0.02em] text-[var(--fg-faint)]">
              LDB 02-{String(camera.id).padStart(5, "0")}
            </div>
          </div>
          <span className="mono truncate text-[12px] text-[var(--fg-mid)]">
            {camera.sensorType ?? "—"}
          </span>
          <span className="mono truncate text-[12px] text-[var(--fg-mid)]">
            {camera.sensorSize ?? "—"}
          </span>
          <span className="mono text-[12px] text-foreground">
            {camera.megapixels ? `${camera.megapixels}` : "—"}
          </span>
          <span className="mono text-[12px] text-[var(--fg-mid)]">
            {camera.yearIntroduced ?? "—"}
          </span>
          <span aria-hidden="true" className="text-[var(--fg-faint)]">›</span>
        </Link>
      ))}
    </div>
  );
}
