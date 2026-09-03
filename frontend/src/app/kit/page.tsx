import { redirect } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import KitManager from "@/components/KitManager";
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

  const items = await getKitItems(user.id);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Breadcrumb crumbs={[{ name: "Your kit" }]} />

      <h1 className="mt-4 text-3xl font-bold tracking-tight">Your kit</h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed">
        The lenses and cameras you own, valued against the completed sales this
        site records. Add what you paid and the two figures sit side by side.
      </p>

      <KitManager
        initialItems={items}
        initialValue={kitValue(items)}
        initialIsPublic={user.kitIsPublic}
        handle={user.handle}
      />
    </div>
  );
}
