import Link from "next/link";
import { getPublicKits } from "@/lib/kit";

export const revalidate = 300;

export const metadata = {
  title: "Community",
  description:
    "The people here and the gear they own, as far as they have chosen to show it.",
  alternates: { canonical: "/community" },
};

export default async function CommunityPage() {
  const people = await getPublicKits().catch(() => []);

  return (
    <div className="w-full max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Community</h1>
      <p className="mt-2 text-muted-foreground">
        Everyone who has published what they own.
      </p>

      {people.length === 0 ? (
        <div className="mt-8 rounded-lg border border-border p-8 text-center">
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
        <ul className="mt-8 divide-y divide-border border-y border-border">
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
    </div>
  );
}
