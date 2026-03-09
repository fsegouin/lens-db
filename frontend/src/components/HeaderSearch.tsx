"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

export default function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);
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
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(value.trim()), 300);
  }

  function handleOpen() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
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
      handleClose();
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  // Close on click outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
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

  const hasResults =
    results &&
    (results.lenses.length > 0 ||
      results.cameras.length > 0 ||
      results.systems.length > 0 ||
      results.collections.length > 0);

  return (
    <div ref={wrapperRef} className="relative">
      {!open ? (
        <button
          onClick={handleOpen}
          className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          aria-label="Search"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
        </button>
      ) : (
        <div className="relative" ref={inputWrapperRef}>
          <svg
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search lenses, cameras, systems..."
            className="w-64 rounded-lg border border-zinc-300 py-1.5 pl-9 pr-3 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500"
          />

          {/* Dropdown results */}
          {query.trim().length >= 2 && (
            <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              {loading && !results && (
                <div className="px-4 py-3 text-sm text-zinc-400">Searching...</div>
              )}

              {results && !hasResults && (
                <div className="px-4 py-3 text-sm text-zinc-400">
                  No results for &ldquo;{query.trim()}&rdquo;
                </div>
              )}

              {hasResults &&
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
                          onClick={handleClose}
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
                  onClick={handleClose}
                  className="block border-t border-zinc-100 px-4 py-2 text-center text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                >
                  View all results
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
