import Link from "next/link";
import { getPublicKits } from "@/lib/kit";
import { getTopContributors } from "@/lib/recent-changes";

export const revalidate = 300;

export const metadata = {
  title: "Community",
  description:
    "The people here: the gear they own, as far as they have chosen to show it, and the edits they have made.",
  alternates: { canonical: "/community" },
};

export default async function CommunityPage() {
  const [people, contributors] = await Promise.all([
    getPublicKits().catch(() => []),
    getTopContributors(10).catch(() => []),
  ]);

  return (
    <div className="w-full max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Community</h1>
      <p className="mt-2 text-muted-foreground">
        The people who have published what they own, and the people who keep
        the catalogue right. Every edit is on the{" "}
        <Link href="/changes" className="underline underline-offset-2 hover:text-foreground">
          recent changes
        </Link>{" "}
        page.
      </p>

      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Published kits
        </h2>

        {people.length === 0 ? (
          <div className="mt-3 rounded-lg border border-border p-8 text-center">
            <p className="text-lg font-semibold">
              Nobody has published one yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">
              Record what you own and publish it.
            </p>
            <div className="mt-4">
              <Link
                href="/kit"
                className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:border-zinc-400 dark:hover:border-zinc-600"
              >
                Start your kit
              </Link>
            </div>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {people.map((person) => (
              <li key={person.handle}>
                <Link
                  href={`/community/${person.handle}`}
                  className="flex items-baseline justify-between gap-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0 font-medium leading-snug">
                    {person.displayName}
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                    {person.lensCount} {person.lensCount === 1 ? "lens" : "lenses"},{" "}
                    {person.cameraCount} {person.cameraCount === 1 ? "body" : "bodies"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Most active editors
        </h2>
        {contributors.length === 0 ? (
          <p className="mt-3 text-muted-foreground">No approved edits yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {contributors.map((c) => (
              <li key={c.handle}>
                <Link
                  href={`/community/${c.handle}`}
                  className="flex items-baseline justify-between gap-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0 font-medium leading-snug">{c.displayName}</span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                    {c.editCount.toLocaleString()} {c.editCount === 1 ? "edit" : "edits"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          Every lens and camera page has an Edit button. Approved edits are
          credited here and on the page.
        </p>
      </section>
    </div>
  );
}
