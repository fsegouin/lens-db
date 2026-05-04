import Link from "next/link";
import { sql, isNull } from "drizzle-orm";
import { db } from "@/db";
import { systems, lenses, cameras } from "@/db/schema";
import { PageTransition } from "@/components/page-transition";
import { TopBar } from "@/components/app-shell/top-bar";

export const revalidate = 604800;

export const metadata = {
  title: "Mount Systems | The Lens DB",
  description: "Browse camera mount systems by manufacturer, with lens and body counts.",
};

type SystemRow = {
  id: number;
  name: string;
  slug: string;
  manufacturer: string | null;
  lensCount: number;
  cameraCount: number;
  makerCount: number;
};

function deriveMountEm(name: string): string {
  const trimmed = name.trim();
  const tokens = trimmed.split(/\s+/);
  const last = tokens[tokens.length - 1];
  if (last.length <= 4) return last;
  const initials = trimmed
    .split(/[\s/]+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join("");
  return initials.length <= 4
    ? initials.toUpperCase()
    : initials.slice(0, 3).toUpperCase();
}

function splitTitleEm(name: string): { main: string; em: string } {
  const trimmed = name.trim();
  const spaceIdx = trimmed.lastIndexOf(" ");
  if (spaceIdx > 0) {
    return { main: trimmed.slice(0, spaceIdx + 1), em: trimmed.slice(spaceIdx + 1) };
  }
  const slashIdx = trimmed.lastIndexOf("/");
  if (slashIdx > 0) {
    return { main: trimmed.slice(0, slashIdx + 1), em: trimmed.slice(slashIdx + 1) };
  }
  return { main: "", em: trimmed };
}

export default async function SystemsPage() {
  let rows: SystemRow[] = [];

  try {
    const lensAgg = db
      .select({
        systemId: lenses.systemId,
        lensCount: sql<number>`count(*)`.as("lens_count"),
        makerCount: sql<number>`count(distinct ${lenses.brand})`.as("maker_count"),
      })
      .from(lenses)
      .where(isNull(lenses.mergedIntoId))
      .groupBy(lenses.systemId)
      .as("lens_agg");

    const cameraAgg = db
      .select({
        systemId: cameras.systemId,
        cameraCount: sql<number>`count(*)`.as("camera_count"),
      })
      .from(cameras)
      .where(isNull(cameras.mergedIntoId))
      .groupBy(cameras.systemId)
      .as("camera_agg");

    const result = await db
      .select({
        id: systems.id,
        name: systems.name,
        slug: systems.slug,
        manufacturer: systems.manufacturer,
        lensCount: sql<number>`coalesce(${lensAgg.lensCount}, 0)`,
        cameraCount: sql<number>`coalesce(${cameraAgg.cameraCount}, 0)`,
        makerCount: sql<number>`coalesce(${lensAgg.makerCount}, 0)`,
      })
      .from(systems)
      .leftJoin(lensAgg, sql`${lensAgg.systemId} = ${systems.id}`)
      .leftJoin(cameraAgg, sql`${cameraAgg.systemId} = ${systems.id}`)
      .orderBy(
        sql`coalesce(${lensAgg.lensCount}, 0) desc`,
        sql`${systems.name} asc`,
      );

    rows = result.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      manufacturer: r.manufacturer,
      lensCount: Number(r.lensCount),
      cameraCount: Number(r.cameraCount),
      makerCount: Number(r.makerCount),
    }));
  } catch {
    // DB not connected
  }

  const totalLenses = rows.reduce((acc, r) => acc + r.lensCount, 0);
  const totalCameras = rows.reduce((acc, r) => acc + r.cameraCount, 0);

  return (
    <PageTransition>
      <TopBar crumbs={[{ label: "home", href: "/" }, { label: "systems" }]}>
        <span>{rows.length.toLocaleString()} mount systems</span>
      </TopBar>

      <div className="mx-auto w-full max-w-[1320px] px-6 pb-24 pt-10 lg:px-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-border pb-6">
          <div>
            <h1 className="text-[36px] font-medium leading-none -tracking-[0.025em]">
              Mount <em className="hero-title-em">systems</em>
            </h1>
            <div className="mono mt-3 text-[12px] text-[var(--fg-dim)]">
              <span className="text-foreground">{rows.length.toLocaleString()}</span>{" "}
              mounts · from{" "}
              <span className="text-foreground">{totalLenses.toLocaleString()}</span>{" "}
              indexed lenses +{" "}
              <span className="text-foreground">{totalCameras.toLocaleString()}</span>{" "}
              cameras
            </div>
          </div>
        </div>

        {rows.length > 0 ? (
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((s) => (
              <SystemCard key={s.id} system={s} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-[var(--fg-dim)]">
            No data yet.
          </div>
        )}
      </div>
    </PageTransition>
  );
}

function SystemCard({ system }: { system: SystemRow }) {
  const ldbId = `LDB SYS-${String(system.id).padStart(3, "0")}`;
  const em = deriveMountEm(system.name);
  const title = splitTitleEm(system.name);
  const fontSize = em.length > 3 ? 5 : 7;

  return (
    <Link
      href={`/systems/${system.slug}`}
      className="flex min-h-[220px] flex-col gap-3.5 bg-background p-[20px_22px] transition-colors hover:bg-[var(--surface-soft)]"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="mono truncate text-[9.5px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
            {ldbId}
            {system.manufacturer && (
              <>
                {" · "}
                <span>{system.manufacturer.toUpperCase()}</span>
              </>
            )}
          </div>
          <div className="text-[17px] font-medium leading-[1.15] -tracking-[0.015em]">
            {title.main}
            <em className="hero-title-em">{title.em}</em>
          </div>
        </div>
        <svg
          viewBox="0 0 60 60"
          width="58"
          height="58"
          className="flex-shrink-0"
          aria-hidden="true"
        >
          <circle cx="30" cy="30" r="26" fill="none" stroke="var(--line-strong)" strokeWidth="0.7" />
          <circle cx="30" cy="30" r="20" fill="var(--surface-soft)" stroke="var(--line)" strokeWidth="0.4" />
          <circle cx="30" cy="30" r="12" fill="var(--surface-sunk)" stroke="var(--line-strong)" strokeWidth="0.4" />
          <text
            x="30"
            y="33"
            fontFamily="Geist Mono, monospace"
            fontSize={fontSize}
            fill="var(--fg)"
            textAnchor="middle"
            fontWeight="600"
          >
            {em}
          </text>
        </svg>
      </div>

      <div className="mono mt-auto grid grid-cols-3 gap-3 border-t border-border pt-2.5">
        <Stat n={system.lensCount} label="Lenses" />
        <Stat n={system.cameraCount} label="Cameras" />
        <Stat n={system.makerCount} label="Makers" />
      </div>
    </Link>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="text-[16px] font-medium tabular-nums text-foreground">
        {n.toLocaleString()}
      </div>
      <div className="mt-[1px] text-[9px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
        {label}
      </div>
    </div>
  );
}
