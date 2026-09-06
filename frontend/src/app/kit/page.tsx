import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import Breadcrumb from "@/components/Breadcrumb";
import DigestToggle from "@/components/DigestToggle";
import KitManager from "@/components/KitManager";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getKitItems, kitValue } from "@/lib/kit";
import { getCurrentUser } from "@/lib/user-auth";

// A person's own kit is theirs alone, so it is rendered per request and never
// cached or indexed.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your kit",
  description: "The lenses and cameras you own, and what they are worth used.",
  robots: { index: false, follow: false },
};

export default async function KitPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/kit");

  const [items, [prefs]] = await Promise.all([
    getKitItems(user.id),
    db
      .select({ digestOptIn: users.digestOptIn, kitShowsPaid: users.kitShowsPaid })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
  ]);

  return (
    <div className="w-full max-w-6xl">
      <Breadcrumb crumbs={[{ name: "Your kit" }]} />

      <h1 className="mt-4 text-3xl font-bold tracking-tight">Your kit</h1>

      <KitManager
        initialItems={items}
        initialValue={kitValue(items)}
        initialIsPublic={user.kitIsPublic}
        initialShowsPaid={prefs?.kitShowsPaid ?? false}
        initialCurrency={user.kitCurrency}
        handle={user.handle}
      />

      <section className="mt-12 max-w-xl">
        <h2 className="mb-3 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Email
        </h2>
        <DigestToggle initialOptIn={prefs?.digestOptIn ?? false} />
      </section>
    </div>
  );
}
