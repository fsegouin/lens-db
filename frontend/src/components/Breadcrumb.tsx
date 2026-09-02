import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type Crumb = { name: string; path?: string };

/**
 * Where you are in the catalogue, on every entity page. Replaces the
 * history-dependent "Back to lenses" button as the primary orientation cue.
 */
export default function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={`${crumb.name}-${i}`} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              {crumb.path && !isLast ? (
                <Link
                  href={crumb.path}
                  className="underline-offset-2 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                >
                  {crumb.name}
                </Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined}>{crumb.name}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
