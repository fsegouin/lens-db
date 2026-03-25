import { db } from "@/db";
import { systems } from "@/db/schema";
import { asc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/user-auth";
import { redirect } from "next/navigation";
import SubmitForm from "./SubmitForm";

export const metadata = {
  title: "Submit New Entry",
};

export default async function SubmitPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/submit");
  }

  const allSystems = await db
    .select({ id: systems.id, name: systems.name })
    .from(systems)
    .orderBy(asc(systems.name));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Submit New Entry
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Add a new lens or camera to the database. Your submission will be
        reviewed by an admin before being published.
      </p>
      <SubmitForm systems={allSystems} />
    </div>
  );
}
