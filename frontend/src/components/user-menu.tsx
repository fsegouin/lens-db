"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/user-context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, User } from "lucide-react";

const ITEM =
  "block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground";

/**
 * Everything to do with the account behind one control.
 *
 * The name used to sit beside a shield and a sign-out icon, which cost three
 * slots in a header that had run out of room and made signing out a
 * single mis-click. One menu holds the lot.
 */
export function UserMenu() {
  const { user, loading } = useUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);

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
    // A full reload so no stale user state survives the sign-out.
    window.location.href = "/";
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-accent hover:text-accent-foreground dark:text-zinc-300"
        aria-label="Account menu"
      >
        <User className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{user.displayName}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <div className="border-b border-border px-2 py-1.5">
          <p className="truncate text-sm font-medium">{user.displayName}</p>
          <p className="text-xs text-muted-foreground">
            {user.kitIsPublic ? "Kit is public" : "Kit is private"}
          </p>
        </div>

        <div className="pt-1">
          <Link href="/kit" className={ITEM} onClick={() => setOpen(false)}>
            Your kit
          </Link>

          {user.handle && (
            <Link
              href={`/community/${user.handle}`}
              className={ITEM}
              onClick={() => setOpen(false)}
            >
              Your profile
            </Link>
          )}

          <Link href="/submit" className={ITEM} onClick={() => setOpen(false)}>
            Submit a lens or camera
          </Link>

          {user.role === "admin" && (
            <Link href="/admin" className={ITEM} onClick={() => setOpen(false)}>
              Admin panel
            </Link>
          )}
        </div>

        <div className="mt-1 border-t border-border pt-1">
          <button type="button" onClick={handleLogout} className={ITEM}>
            Sign out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
