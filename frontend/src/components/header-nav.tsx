"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useSearch } from "@/components/search-context";
import { HeaderSearchExpanded } from "@/components/HeaderSearch";

const navLinks: { href: string; label: string; badge?: string }[] = [
  { href: "/", label: "Home" },
  { href: "/systems", label: "Systems" },
  { href: "/lenses", label: "Lenses" },
  { href: "/cameras", label: "Cameras" },
  { href: "/collections", label: "Collections" },
  { href: "/compare", label: "Compare" },
  { href: "/submit", label: "Submit" },
  { href: "/chat", label: "Chat", badge: "New" },
];

export function HeaderNav() {
  const pathname = usePathname();
  const { open } = useSearch();

  return (
    <AnimatePresence mode="wait" initial={false}>
      {open ? (
        <HeaderSearchExpanded key="search" />
      ) : (
        <motion.nav
          key="nav"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="hidden gap-1 lg:flex"
          aria-label="Main navigation"
        >
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {link.label}
                {link.badge && (
                  <span className={`ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none align-middle ${
                    isActive
                      ? "bg-zinc-400/40 dark:bg-zinc-500/40 text-accent-foreground"
                      : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
                  }`}>
                    {link.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
