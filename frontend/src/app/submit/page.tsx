import { db } from "@/db";
import { systems } from "@/db/schema";
import { asc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/user-auth";
import { redirect } from "next/navigation";
import SubmitForm from "./SubmitForm";
import { PageTransition } from "@/components/page-transition";
import { TopBar } from "@/components/app-shell/top-bar";

export const metadata = {
  title: "Submit New Entry | The Lens DB",
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
    <PageTransition>
      <TopBar
        crumbs={[
          { label: "home", href: "/" },
          { label: "contribute" },
          { label: "submit entry" },
        ]}
      >
        <span>signed in as {user.email}</span>
      </TopBar>

      <div className="mx-auto w-full max-w-[1200px] px-6 pb-24 pt-10 lg:px-10">
        <div className="mb-8 border-b border-border pb-6">
          <h1 className="text-[36px] font-medium leading-none -tracking-[0.025em]">
            Submit an <em className="hero-title-em">entry</em>
          </h1>
          <div className="mono mt-3 text-[12px] text-[var(--fg-dim)]">
            Add a lens or camera to the DB. Submissions are queued for admin review —
            approved entries merge into the public index.
          </div>
        </div>
        <SubmitForm systems={allSystems} />
      </div>
    </PageTransition>
  );
}
