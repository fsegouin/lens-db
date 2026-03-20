"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/user-context";
import { User, LogOut } from "lucide-react";

export function UserMenu() {
  const { user, loading } = useUser();
  const router = useRouter();

  if (loading) return null;

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        Sign in
      </Link>
    );
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
    // Trigger full page reload to clear user state
    window.location.href = "/";
  }

  return (
    <div className="flex items-center gap-1">
      <span className="hidden items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 sm:flex">
        <User className="h-3.5 w-3.5" />
        {user.displayName}
      </span>
      <button
        onClick={handleLogout}
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
