import Link from "next/link";
import { Search } from "lucide-react";

export const metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

const destinations = [
  { href: "/lenses", label: "Browse lenses" },
  { href: "/cameras", label: "Browse cameras" },
  { href: "/systems", label: "Browse mounts" },
  { href: "/collections", label: "Collections" },
];

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-6 py-16 text-center">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          Page not found
        </h1>
        <p className="mt-2 text-muted-foreground">
          This record may have been merged into another, renamed, or never
          existed. Searching by name is usually the fastest way back.
        </p>
      </div>

      <form
        action="/search"
        method="get"
        role="search"
        className="flex items-center gap-2"
      >
        <label htmlFor="notfound-search" className="sr-only">
          Search lenses, cameras and mounts
        </label>
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="notfound-search"
            name="q"
            type="search"
            placeholder="Search lenses, cameras and mounts"
            className="h-11 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/80"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap justify-center gap-2">
        {destinations.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            {d.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
