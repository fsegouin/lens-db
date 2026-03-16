import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/db";
import { issueReports } from "@/db/schema";
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
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(issueReports)
    .where(eq(issueReports.status, "pending"));
  const pendingCount = Number(count);

  return (
    <div className="fixed inset-0 z-50 flex bg-white dark:bg-zinc-950">
      <AdminSidebar pendingCount={pendingCount} navItems={adminNav} />
      <main className="flex-1 overflow-y-auto pt-12 md:pt-0">{children}</main>
    </div>
  );
}
