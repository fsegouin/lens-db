"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useUser } from "@/components/user-context";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/systems", label: "Systems" },
  { href: "/lenses", label: "Lenses" },
  { href: "/cameras", label: "Cameras" },
  { href: "/collections", label: "Collections" },
  { href: "/compare", label: "Compare" },
  { href: "/submit", label: "Submit" },
  { href: "/search", label: "Search" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useUser();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" className="h-9 w-9 lg:hidden" aria-label="Open menu" />}
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="right" className="w-72 p-0">
        <div className="px-4 pt-12 pb-4">
          <SheetTitle className="text-lg font-bold">Menu</SheetTitle>
          <nav className="mt-4 flex flex-col gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="mt-2 border-t border-border pt-2">
              {user ? (
                <>
                  <div className="px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {user.displayName}
                  </div>
                  {user.role === "admin" && (
                    <Link
                      href="/admin"
                      onClick={() => setOpen(false)}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Shield className="h-4 w-4" />
                      Admin panel
                    </Link>
                  )}
                  <button
                    onClick={async () => {
                      await fetch("/api/auth/logout", { method: "POST" });
                      setOpen(false);
                      window.location.href = "/";
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="block rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setOpen(false)}
                    className="block rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    Create account
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
}
