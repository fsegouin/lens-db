import Link from "next/link";
import React from "react";

export type CrumbItem = { label: string; href?: string };

export function TopBar({
  crumbs,
  children,
}: {
  crumbs: CrumbItem[];
  children?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 flex items-center gap-4 border-b border-border bg-background/80 px-6 py-3.5 backdrop-blur-xl lg:px-10">
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="mono flex items-center gap-2 truncate text-[11px] tracking-[0.02em] text-[var(--fg-dim)]">
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            const content = crumb.href && !isLast ? (
              <Link href={crumb.href} className="hover:text-foreground">
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? "text-foreground" : undefined}>{crumb.label}</span>
            );
            return (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-2">
                {content}
                {!isLast && <span className="text-[var(--fg-faint)]">·</span>}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="flex-1" />
      {children && (
        <div className="mono flex items-center gap-3.5 text-[11px] text-[var(--fg-dim)]">
          {children}
        </div>
      )}
    </div>
  );
}
