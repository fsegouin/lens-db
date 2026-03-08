import Link from "next/link";
import { db } from "@/db";
import { systems } from "@/db/schema";
import { asc } from "drizzle-orm";

export const revalidate = 604800;

export const metadata = {
  title: "Camera Systems | Lens DB",
  description: "Browse camera systems by manufacturer and mount type.",
};

export default async function SystemsPage() {
  let allSystems: (typeof systems.$inferSelect)[] = [];

  try {
    allSystems = await db.select().from(systems).orderBy(asc(systems.name));
  } catch {
    // DB not connected yet - show empty state
  }

  return (
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
              className="rounded-lg border border-zinc-200 p-4 transition-all hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-600"
            >
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
                {system.name}
              </h2>
              {system.manufacturer && (
                <p className="mt-1 text-sm text-zinc-500">
                  {system.manufacturer}
                </p>
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
          <p className="text-zinc-500">
            No data yet. Run the scraper and import script to populate the
            database.
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            See <code>scraper/README.md</code> for instructions.
          </p>
        </div>
      )}
    </div>
  );
}
