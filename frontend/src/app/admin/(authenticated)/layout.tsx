import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/db";
import { pendingEdits, revisions, duplicateFlags } from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import AdminSidebar from "@/components/admin/AdminSidebar";

const adminNav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/lenses", label: "Lenses" },
  { href: "/admin/cameras", label: "Cameras" },
  { href: "/admin/systems", label: "Systems" },
  { href: "/admin/collections", label: "Collections" },
  { href: "/admin/series", label: "Series" },
  { href: "/admin/compatibility", label: "Compatibility" },
  { href: "/admin/recent-changes", label: "Recent Changes" },
  { href: "/admin/pending-edits", label: "Pending Edits" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/duplicates", label: "Duplicates" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  const [[{ count: pendingEditCount }], [{ count: unpatrolledCount }], [{ count: pendingDuplicateCount }]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(pendingEdits)
      .where(eq(pendingEdits.status, "pending")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(revisions)
      .where(eq(revisions.isPatrolled, false)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(duplicateFlags)
      .where(eq(duplicateFlags.status, "pending")),
  ]);

  return (
    <div className="fixed inset-0 z-50 flex bg-white dark:bg-zinc-950">
      <AdminSidebar
        pendingEditCount={Number(pendingEditCount)}
        unpatrolledCount={Number(unpatrolledCount)}
        pendingDuplicateCount={Number(pendingDuplicateCount)}
        navItems={adminNav}
      />
      <main className="flex-1 overflow-y-auto pt-12 md:pt-0">{children}</main>
    </div>
  );
}
