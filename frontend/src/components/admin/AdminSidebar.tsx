"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import LogoutButton from "./LogoutButton";

interface AdminSidebarProps {
  pendingCount: number;
  navItems: { href: string; label: string }[];
}

export default function AdminSidebar({ pendingCount, navItems }: AdminSidebarProps) {
  const [open, setOpen] = useState(false);

  // Close on escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [open]);

  function close() {
    setOpen(false);
  }

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed top-3 left-3 z-[60] rounded-md border border-zinc-200 bg-white p-2 shadow-sm md:hidden dark:border-zinc-700 dark:bg-zinc-900"
        aria-label="Open menu"
      >
        <svg className="h-5 w-5 text-zinc-700 dark:text-zinc-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 md:hidden"
          onClick={close}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-[70] w-56 shrink-0 border-r border-zinc-200 bg-zinc-50 transition-transform duration-200 ease-in-out md:static md:translate-x-0 dark:border-zinc-800 dark:bg-zinc-950 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-4">
          <div>
            <Link href="/admin" onClick={close} className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Admin
            </Link>
            <Link href="/" onClick={close} className="ml-2 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
              &larr; Site
            </Link>
          </div>
          {/* Mobile close button */}
          <button
            type="button"
            onClick={close}
            className="rounded-md p-1 text-zinc-400 hover:text-zinc-600 md:hidden dark:hover:text-zinc-300"
            aria-label="Close menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="space-y-1 px-2">
          {navItems.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={close}
              className="block rounded-md px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/admin/reports"
            onClick={close}
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
    </>
  );
}
