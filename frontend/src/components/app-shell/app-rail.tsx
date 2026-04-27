"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeSwitch } from "@/components/app-shell/theme-switch";
import { UserMenu } from "@/components/user-menu";

type NavItem = { href: string; label: string; count?: string };

const browseNav: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/lenses", label: "Lenses", count: "7,400+" },
  { href: "/cameras", label: "Cameras", count: "1,000+" },
  { href: "/systems", label: "Systems", count: "130+" },
  { href: "/collections", label: "Collections", count: "50+" },
  { href: "/compare", label: "Compare" },
];

const systemNav: NavItem[] = [
  { href: "/submit", label: "Submit" },
  { href: "/chat", label: "Chat" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function RailSection({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  return (
    <div>
      <div className="mono mb-1.5 px-2.5 text-[10px] uppercase tracking-[0.1em] text-[var(--fg-faint)]">
        {label}
      </div>
      <div className="flex flex-col gap-px">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                active
                  ? "bg-[var(--surface-soft)] font-medium text-foreground"
                  : "text-[var(--fg-mid)] hover:bg-[var(--surface-soft)] hover:text-foreground"
              }`}
            >
              <span>{item.label}</span>
              {item.count && (
                <span className="mono text-[10px] text-[var(--fg-faint)]">{item.count}</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function AppRail() {
  const pathname = usePathname();
  const buildDate = new Date();
  const buildLabel = `${buildDate.getFullYear()}.${String(buildDate.getMonth() + 1).padStart(2, "0")}.${String(buildDate.getDate()).padStart(2, "0")}`;
  const versionLabel = `v2 · ${buildDate.getFullYear()}.${String(buildDate.getMonth() + 1).padStart(2, "0")}`;

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-6 self-start border-r border-border bg-background px-4 py-5 lg:flex">
      <Link href="/" className="px-1 text-foreground">
        <div className="leading-tight">
          <div className="text-sm font-semibold -tracking-tight">The Lens DB</div>
          <div className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--fg-dim)]">
            {versionLabel}
          </div>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-5" aria-label="Main navigation">
        <RailSection label="Browse" items={browseNav} pathname={pathname} />
        <RailSection label="System" items={systemNav} pathname={pathname} />
      </nav>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <ThemeSwitch />
        <UserMenu />
        <div className="mono text-[10px] leading-[1.6] text-[var(--fg-faint)]">
          <div>
            <span className="text-[var(--fg-dim)]">Build</span> {buildLabel}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--fg-dim)]">Status</span>
            <span className="live-dot" aria-hidden="true" />
            <span className="text-[var(--pos)]">live</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
