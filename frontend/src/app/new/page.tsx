import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { getNewEntities, groupByDay, type NewEntity } from "@/lib/new-entities";
import { entityMetadata } from "@/lib/seo";

export const revalidate = 3600;

export const metadata: Metadata = {
  ...entityMetadata({
    title: "New in the catalogue",
    description:
      "Lenses and cameras recently added to The Lens DB, newest first, with an RSS feed and a weekly email for members.",
    path: "/new",
  }),
  alternates: {
    canonical: "/new",
    types: { "application/rss+xml": "/feed.xml" },
  },
};

/** Rows shown per day before the rest fold behind "Show all". */
const DAY_FOLD = 25;

function EntryList({ entries }: { entries: NewEntity[] }) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {entries.map((e) => (
        <li key={`${e.type}-${e.id}`}>
          <Link
            href={e.href}
            className="flex items-baseline justify-between gap-4 py-2.5 transition-colors hover:bg-muted/50"
          >
            <span className="min-w-0">
              <span className="font-medium leading-snug">{e.name}</span>
              {(e.brand || e.yearIntroduced) && (
                <span className="block font-mono text-xs text-muted-foreground">
                  {[e.brand, e.yearIntroduced].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
            <Badge variant="outline" className="shrink-0">
              {e.type === "lens" ? "Lens" : "Camera"}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function NewPage() {
  const entries = await getNewEntities().catch(() => []);
  const days = groupByDay(entries);

  return (
    <div className="w-full max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">New in the catalogue</h1>
      <p className="mt-2 text-muted-foreground">
        Lenses and bodies added to the database, newest first. Most arrive from
        watching announcements; the rest are submitted by members.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        <Link href="/feed.xml" className="underline underline-offset-2 hover:text-foreground">
          Subscribe by RSS
        </Link>
        <span aria-hidden="true"> · </span>
        Members can get this weekly by email from their{" "}
        <Link href="/kit" className="underline underline-offset-2 hover:text-foreground">
          kit page
        </Link>
        .
      </p>

      {days.length === 0 ? (
        <div className="mt-8 rounded-lg border border-border p-8 text-center">
          <p className="text-lg font-semibold">Nothing recorded yet</p>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            New lenses and cameras will appear here as they are added.
          </p>
        </div>
      ) : (
        days.map(({ day, entries }) => {
          const lensCount = entries.filter((e) => e.type === "lens").length;
          const cameraCount = entries.length - lensCount;
          const counts = [
            lensCount > 0 && `${lensCount} ${lensCount === 1 ? "lens" : "lenses"}`,
            cameraCount > 0 && `${cameraCount} ${cameraCount === 1 ? "camera" : "cameras"}`,
          ]
            .filter(Boolean)
            .join(", ");
          // A bulk import lands hundreds of rows on one day. Show enough to
          // scan and fold the rest, so the days before it stay reachable.
          const shown = entries.slice(0, DAY_FOLD);
          const folded = entries.slice(DAY_FOLD);
          return (
            <section key={day} className="mt-8">
              <h2 className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
                <span>{formatDay(day)}</span>
                <span className="font-mono text-xs font-normal normal-case tracking-normal tabular-nums">
                  {counts}
                </span>
              </h2>
              <EntryList entries={shown} />
              {folded.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer list-none py-2.5 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
                    <span className="group-open:hidden">Show all {entries.length}</span>
                    <span className="hidden group-open:inline">Show fewer</span>
                  </summary>
                  <EntryList entries={folded} />
                </details>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
