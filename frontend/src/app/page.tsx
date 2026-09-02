import Link from "next/link";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { cameras, collections, lenses, lensSystems, systems } from "@/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Aperture, Camera, Layers, BookOpen, Search } from "lucide-react";
import JsonLd from "@/components/JsonLd";
import { siteJsonLd } from "@/lib/jsonld";

export const revalidate = 604800;

export const metadata = {
  description:
    "An open reference for interchangeable camera lenses, camera bodies and lens mounts: specifications, what fits what, and used prices from real sales.",
  alternates: { canonical: "/" },
};

/**
 * Counts shown on the home page. Read from the database rather than hardcoded,
 * because the previous fixed figures (7,400+ lenses) had drifted well below
 * the real catalogue and contradicted the list pages.
 */
const getHomeData = unstable_cache(
  async () => {
    const [counts, topSystems, recentLenses] = await Promise.all([
      db
        .select({
          lenses: sql<number>`(select count(*)::int from ${lenses} where ${lenses.mergedIntoId} is null)`,
          cameras: sql<number>`(select count(*)::int from ${cameras} where ${cameras.mergedIntoId} is null)`,
          systems: sql<number>`(select count(*)::int from ${systems})`,
          collections: sql<number>`(select count(*)::int from ${collections})`,
        })
        .from(sql`(select 1) as t`),
      db
        .select({
          name: systems.name,
          slug: systems.slug,
          lensCount: sql<number>`count(${lensSystems.lensId})::int`,
        })
        .from(systems)
        .innerJoin(lensSystems, eq(lensSystems.systemId, systems.id))
        .innerJoin(lenses, eq(lensSystems.lensId, lenses.id))
        .where(isNull(lenses.mergedIntoId))
        .groupBy(systems.id, systems.name, systems.slug)
        .orderBy(desc(sql`count(${lensSystems.lensId})`))
        .limit(12),
      db
        .select({
          name: lenses.name,
          slug: lenses.slug,
          brand: lenses.brand,
          yearIntroduced: lenses.yearIntroduced,
        })
        .from(lenses)
        .where(and(isNull(lenses.mergedIntoId), sql`${lenses.createdAt} is not null`))
        .orderBy(desc(lenses.createdAt), desc(lenses.id))
        .limit(10),
    ]);

    return { counts: counts[0], topSystems, recentLenses };
  },
  ["home-data"],
  { revalidate: 86400, tags: ["lenses", "cameras"] },
);

export default async function Home() {
  const { counts, topSystems, recentLenses } = await getHomeData().catch(() => ({
    counts: { lenses: 0, cameras: 0, systems: 0, collections: 0 },
    topSystems: [],
    recentLenses: [],
  }));

  const sections = [
    {
      title: "Lenses",
      description:
        "Every interchangeable lens we have a record of, from 1930s screw mounts to this year's releases.",
      href: "/lenses",
      count: counts.lenses,
      icon: Aperture,
    },
    {
      title: "Cameras",
      description:
        "Bodies across SLR, mirrorless, rangefinder and medium format, film and digital.",
      href: "/cameras",
      count: counts.cameras,
      icon: Camera,
    },
    {
      title: "Mounts",
      description:
        "One page per physical mount: which lenses were made for it, and which bodies take them.",
      href: "/systems",
      count: counts.systems,
      icon: Layers,
    },
    {
      title: "Collections",
      description:
        "Curated lists: holy trinities, pancakes, ultra-fast primes, and other themes.",
      href: "/collections",
      count: counts.collections,
      icon: BookOpen,
    },
  ];

  return (
    <div className="space-y-16">
      <JsonLd data={siteJsonLd()} />

      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-b from-muted/50 to-transparent -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 pt-8 pb-12">
        <section className="space-y-5 text-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Every lens. Every mount. One reference.
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
            Specifications for {counts.lenses.toLocaleString()} lenses and{" "}
            {counts.cameras.toLocaleString()} camera bodies across{" "}
            {counts.systems} mounts — what fits what, when it was made, and what
            it sells for used.
          </p>
          {/* A plain GET form: works before JavaScript loads, and gives
              crawlers a real search endpoint to follow. */}
          <form
            action="/search"
            method="get"
            role="search"
            className="mx-auto flex max-w-xl items-center gap-2"
          >
            <label htmlFor="hero-search" className="sr-only">
              Search lenses, cameras and mounts
            </label>
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="hero-search"
                name="q"
                type="search"
                placeholder="Try “Summicron 35”, “Nikon F3” or “Micro Four Thirds”"
                className="h-11 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/80"
            >
              Search
            </button>
          </form>
          <div className="flex flex-wrap justify-center gap-3 pt-1">
            <Link
              href="/lenses"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-5 text-sm font-medium transition-all hover:bg-muted"
            >
              Browse all lenses
            </Link>
            <Link
              href="/compare"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-5 text-sm font-medium transition-all hover:bg-muted"
            >
              Compare two lenses
            </Link>
          </div>
        </section>
      </div>

      {/* Section Cards */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-xl border border-zinc-200 p-6 transition-all hover:border-zinc-400 hover:shadow-md dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <section.icon className="h-6 w-6 text-muted-foreground mb-3" />
            <div className="mb-2 text-2xl font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
              {section.count.toLocaleString()}
            </div>
            <h2 className="mb-1 text-lg font-semibold text-zinc-800 group-hover:text-zinc-900 dark:text-zinc-200 dark:group-hover:text-white">
              {section.title}
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {section.description}
            </p>
          </Link>
        ))}
      </section>

      {/* Mounts are how photographers actually navigate a lens catalogue. */}
      {topSystems.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              Start with your mount
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              The mounts with the deepest lens catalogues.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {topSystems.map((system) => (
              <Link
                key={system.slug}
                href={`/systems/${system.slug}`}
                className="group flex items-baseline justify-between rounded-lg border border-zinc-200 p-4 transition-all hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <span className="text-sm font-medium text-zinc-900 group-hover:underline dark:text-zinc-100">
                  {system.name}
                </span>
                <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                  {system.lensCount.toLocaleString()}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {recentLenses.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              Recently added
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              New entries as they are announced and catalogued.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {recentLenses.map((lens) => (
              <Link
                key={lens.slug}
                href={`/lenses/${lens.slug}`}
                className="group rounded-lg border border-zinc-200 p-4 transition-all hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <p className="text-sm font-medium text-zinc-900 group-hover:underline dark:text-zinc-100">
                  {lens.name}
                </p>
                <div className="mt-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{lens.brand}</span>
                  {lens.yearIntroduced && (
                    <span className="tabular-nums">{lens.yearIntroduced}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* About */}
      <section className="mx-auto max-w-3xl border-t border-border pt-8 text-center">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          About this project
        </h2>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          The Lens DB is a community reference for camera lenses, bodies and
          mounts. It continues the work of lens-db.com, a catalogue built from
          manufacturer booklets, datasheets and brochures between 2012 and 2025,
          and extends it with used-price data drawn from completed sales.
        </p>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Records are incomplete and some are wrong. Every lens and camera page
          has an <strong className="text-zinc-700 dark:text-zinc-300">Edit</strong>{" "}
          button for corrections and a{" "}
          <strong className="text-zinc-700 dark:text-zinc-300">Flag duplicate</strong>{" "}
          button for records that describe the same product twice — or{" "}
          <Link href="/submit" className="underline underline-offset-2">
            submit something missing
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
