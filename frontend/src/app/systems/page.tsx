import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { systems } from "@/db/schema";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";

export const revalidate = 604800;

export const metadata = {
  title: "Camera Systems | The Lens DB",
  description: "Browse camera systems by manufacturer and mount type.",
};

export default async function SystemsPage() {
  let allSystems: (typeof systems.$inferSelect)[] = [];

  try {
    allSystems = await db.select().from(systems).orderBy(asc(systems.name));
  } catch {
    // DB not connected yet
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            Camera Systems
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Browse {allSystems.length || "130+"} camera systems organized by
            manufacturer and mount type.
          </p>
        </div>

        {allSystems.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allSystems.map((system) => (
              <Link
                key={system.id}
                href={`/systems/${system.slug}`}
                className="rounded-lg border border-zinc-200 p-4 transition-all duration-200 hover:border-zinc-400 hover:shadow-md dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {system.name}
                </h2>
                {system.manufacturer && (
                  <div className="mt-2">
                    <Badge variant="outline">{system.manufacturer}</Badge>
                  </div>
                )}
                {system.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {system.description}
                  </p>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
            <p className="text-zinc-500">No data yet.</p>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
