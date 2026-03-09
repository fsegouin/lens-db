import Link from "next/link";
import LogoutButton from "@/components/admin/LogoutButton";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/db";
import { issueReports } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

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
      <aside className="w-56 shrink-0 border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="p-4">
          <Link href="/admin" className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Admin
          </Link>
          <Link href="/" className="ml-2 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            &larr; Site
          </Link>
        </div>
        <nav className="space-y-1 px-2">
          {adminNav.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/admin/reports"
            className="flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            Reports
            {pendingCount > 0 && (
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                {pendingCount}
              </span>
            )}
          </Link>
        </nav>
        <div className="p-4">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
