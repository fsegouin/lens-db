import { db } from "@/db";
import { systems } from "@/db/schema";
import { asc } from "drizzle-orm";
import { getDistinctLensTags } from "@/lib/lens-tags";
import SubmissionForm from "@/components/SubmissionForm";
import { PageTransition } from "@/components/page-transition";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return { title: "Submit a Missing Lens or Camera | The Lens DB" };
}

export default async function SubmitPage() {
  const [systemRows, tags] = await Promise.all([
    db
      .select({ id: systems.id, name: systems.name })
      .from(systems)
      .orderBy(asc(systems.name)),
    getDistinctLensTags(),
  ]);

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Submit a Missing Lens or Camera
        </h1>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">
          Can&apos;t find a lens or camera in our database? Help the community by adding it below.
        </p>
        <div className="mt-8">
          <SubmissionForm systems={systemRows} tags={tags} />
        </div>
      </div>
    </PageTransition>
  );
}
