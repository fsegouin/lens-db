import Link from "next/link";
import { db } from "@/db";
import { lenses, cameras, systems, collections, lensCompatibility } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [lensCount, cameraCount, systemCount, collectionCount, compatCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)::integer` }).from(lenses).then((r) => r[0].count),
    db.select({ count: sql<number>`count(*)::integer` }).from(cameras).then((r) => r[0].count),
    db.select({ count: sql<number>`count(*)::integer` }).from(systems).then((r) => r[0].count),
    db.select({ count: sql<number>`count(*)::integer` }).from(collections).then((r) => r[0].count),
    db.select({ count: sql<number>`count(*)::integer` }).from(lensCompatibility).then((r) => r[0].count),
  ]);

  const cards = [
    { label: "Lenses", count: lensCount, href: "/admin/lenses" },
    { label: "Cameras", count: cameraCount, href: "/admin/cameras" },
    { label: "Systems", count: systemCount, href: "/admin/systems" },
    { label: "Collections", count: collectionCount, href: "/admin/collections" },
    { label: "Compatibility", count: compatCount, href: "/admin/compatibility" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-lg border border-zinc-200 p-6 transition-all hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {card.count.toLocaleString()}
            </div>
            <div className="mt-1 text-sm text-zinc-500">{card.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
