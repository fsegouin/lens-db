import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/db";
import { issueReports, revisions } from "@/db/schema";
import { sql, eq, and } from "drizzle-orm";
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
  { href: "/admin/users", label: "Users" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  const [[{ count: reportCount }], [{ count: unpatrolledCount }]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(issueReports)
      .where(eq(issueReports.status, "pending")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(revisions)
      .where(eq(revisions.isPatrolled, false)),
  ]);

  return (
    <div className="fixed inset-0 z-50 flex bg-white dark:bg-zinc-950">
      <AdminSidebar
        pendingCount={Number(reportCount)}
        unpatrolledCount={Number(unpatrolledCount)}
        navItems={adminNav}
      />
      <main className="flex-1 overflow-y-auto pt-12 md:pt-0">{children}</main>
    </div>
  );
}
