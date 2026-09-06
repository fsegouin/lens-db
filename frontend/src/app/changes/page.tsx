import Link from "next/link";
import ChangeList from "@/components/ChangeList";
import { getRecentChanges } from "@/lib/recent-changes";

export const revalidate = 300;

export const metadata = {
  title: "Recent changes",
  description:
    "The last hundred edits to the catalogue: what changed, why, and who made the change.",
  alternates: { canonical: "/changes" },
};

/**
 * Every wiki has this page and it does two jobs at once: it shows a reader
 * that the reference is alive, and it shows an editor their name in public.
 */
export default async function ChangesPage() {
  const changes = await getRecentChanges(100).catch(() => []);

  return (
    <div className="w-full max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Recent changes</h1>
      <p className="mt-2 text-muted-foreground">
        The last hundred edits to the catalogue. Every entry links to the full
        history of the record it changed. See who edits most on the{" "}
        <Link href="/community" className="underline underline-offset-2 hover:text-foreground">
          community page
        </Link>
        .
      </p>

      <div className="mt-8">
        <ChangeList changes={changes} />
      </div>
    </div>
  );
}
