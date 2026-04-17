"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearch } from "@/components/search-context";
import { trackEvent } from "@/lib/analytics";

interface SearchResult {
  id: number;
  name: string;
  slug: string;
}

interface SearchResults {
  lenses: SearchResult[];
  cameras: SearchResult[];
  systems: SearchResult[];
  collections: SearchResult[];
}

const SECTIONS: {
  key: keyof SearchResults;
  label: string;
  href: (slug: string) => string;
}[] = [
  { key: "lenses", label: "Lenses", href: (s) => `/lenses/${s}` },
  { key: "cameras", label: "Cameras", href: (s) => `/cameras/${s}` },
  { key: "systems", label: "Systems", href: (s) => `/systems/${s}` },
  { key: "collections", label: "Collections", href: (s) => `/collections/${s}` },
];

const SECTION_RESULT_TYPE: Record<keyof SearchResults, "lens" | "camera" | "system" | "collection"> = {
  lenses: "lens",
  cameras: "camera",
  systems: "system",
  collections: "collection",
};

function useSearchLogic() {
  const { open, setOpen } = useSearch();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  const fetchResults = useCallback(async (q: string) => {
    if (abortRef.current) abortRef.current.abort();
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}`,
        { signal: controller.signal }
      );
      if (res.ok) {
        setResults(await res.json());
      }
    } catch {
      // aborted or network error
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    setResults(null);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(value.trim()), 300);
  }

  function handleClose() {
    setOpen(false);
    setQuery("");
    setResults(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      handleClose();
    } else if (e.key === "Enter" && query.trim()) {
      const q = query.trim();
      trackEvent("search_submit", { query: q, source: "header" });
      handleClose();
      router.push(`/search?q=${encodeURIComponent(q)}`);
    }
  }

  const hasResults =
    results &&
    (results.lenses.length > 0 ||
      results.cameras.length > 0 ||
      results.systems.length > 0 ||
      results.collections.length > 0);
  const shouldShowDropdown = query.trim().length >= 2 && (loading || results !== null);

  return {
    open, setOpen, query, results, loading,
    hasResults, shouldShowDropdown,
    handleChange, handleClose, handleKeyDown,
  };
}

function SearchDropdown({
  loading, results, hasResults, query, handleClose,
}: {
  loading: boolean;
  results: SearchResults | null;
  hasResults: boolean | SearchResults | null;
  query: string;
  handleClose: () => void;
}) {
  return (
    <>
      {loading && !results && (
        <div className="space-y-2 px-4 py-3">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      )}

      {results && !hasResults && (
        <div className="px-4 py-3 text-sm text-zinc-400">
          No results for &ldquo;{query.trim()}&rdquo;
        </div>
      )}

      {hasResults && results &&
        SECTIONS.map(({ key, label, href }) => {
          const items = results[key];
          if (items.length === 0) return null;
          return (
            <div key={key}>
              <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                {label}
              </div>
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={href(item.slug)}
                  onClick={() => {
                    trackEvent("search_result_click", {
                      query: query.trim(),
                      result_type: SECTION_RESULT_TYPE[key],
                      result_slug: item.slug,
                    });
                    handleClose();
                  }}
                  className="block px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {item.name}
                </Link>
              ))}
            </div>
          );
        })}

      {hasResults && (
        <Link
          href={`/search?q=${encodeURIComponent(query.trim())}`}
          onClick={() => {
            trackEvent("search_submit", { query: query.trim(), source: "header" });
            handleClose();
          }}
          className="block border-t border-zinc-100 px-4 py-2 text-center text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
        >
          View all results
        </Link>
      )}
    </>
  );
}

/** Search icon button + mobile overlay */
export default function HeaderSearch() {
  const {
    open, setOpen, query, results, loading,
    hasResults, shouldShowDropdown,
    handleChange, handleClose, handleKeyDown,
  } = useSearchLogic();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  function handleOpen() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  // Close on click outside (check both mobile overlay and desktop expanded search)
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const searchElements = document.querySelectorAll("[data-search-area]");
      const insideAny = Array.from(searchElements).some((el) => el.contains(target));
      if (!insideAny) {
        handleClose();
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // Keyboard shortcut: "/" to open search
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !open &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        handleOpen();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div ref={wrapperRef} data-search-area className="relative h-9 w-9">
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          /* Mobile-only full-width overlay — desktop uses HeaderSearchExpanded in nav area */
          <motion.div
            key="search-input"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-x-0 top-0 z-50 h-16 border-b border-border bg-background/80 backdrop-blur-xl px-4 sm:px-6 lg:hidden"
          >
            <div className="relative mx-auto flex h-full max-w-7xl items-center">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search lenses, cameras, systems..."
                className="h-9 w-full pl-9"
              />

            {shouldShowDropdown && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-[60vh] overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                <SearchDropdown
                  loading={loading}
                  results={results}
                  hasResults={hasResults}
                  query={query}
                  handleClose={handleClose}
                />
              </div>
            )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="search-icon"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
          >
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleOpen} aria-label="Search">
              <Search className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Expanded search bar rendered in the nav area on desktop (replaces nav links) */
export function HeaderSearchExpanded() {
  const {
    open, query, results, loading,
    hasResults, shouldShowDropdown,
    handleChange, handleClose, handleKeyDown,
  } = useSearchLogic();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  return (
    <div data-search-area className="relative mx-auto hidden flex-1 px-8 lg:block">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="relative mx-auto max-w-lg"
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search lenses, cameras, systems..."
          className="h-9 w-full pl-9"
        />
      </motion.div>

      {shouldShowDropdown && (
        <div className="absolute inset-x-0 z-50 mx-auto mt-1 max-h-[60vh] max-w-lg overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <SearchDropdown
            loading={loading}
            results={results}
            hasResults={hasResults}
            query={query}
            handleClose={handleClose}
          />
        </div>
      )}
    </div>
  );
}
