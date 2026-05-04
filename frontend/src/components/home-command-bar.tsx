"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { trackEvent } from "@/lib/analytics";

type Chip = { label: string; href: string; active?: boolean };
type Result = { id: number; name: string; slug: string };
type Results = {
  lenses: Result[];
  cameras: Result[];
  systems: Result[];
  collections: Result[];
};

const SECTIONS: {
  key: keyof Results;
  label: string;
  href: (slug: string) => string;
  resultType: "lens" | "camera" | "system" | "collection";
}[] = [
  { key: "lenses", label: "Lenses", href: (s) => `/lenses/${s}`, resultType: "lens" },
  { key: "cameras", label: "Cameras", href: (s) => `/cameras/${s}`, resultType: "camera" },
  { key: "systems", label: "Systems", href: (s) => `/systems/${s}`, resultType: "system" },
  { key: "collections", label: "Collections", href: (s) => `/collections/${s}`, resultType: "collection" },
];

function highlight(text: string, q: string) {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded-[2px] bg-[var(--hot-soft)] px-0.5 text-foreground">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function HomeCommandBar({
  chips,
  totalsLine,
}: {
  chips: Chip[];
  totalsLine: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController | null>(null);

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
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      if (res.ok) setResults(await res.json());
    } catch {
      // aborted or network error
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    setResults(null);
    setActiveIndex(0);
    setDismissed(false);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(value.trim()), 300);
  }

  const flatResults = useMemo(() => {
    if (!results) return [];
    const out: { sectionKey: keyof Results; href: string; item: Result; resultType: string }[] = [];
    for (const s of SECTIONS) {
      for (const item of results[s.key]) {
        out.push({ sectionKey: s.key, href: s.href(item.slug), item, resultType: s.resultType });
      }
    }
    return out;
  }, [results]);

  function openResult(index: number) {
    const hit = flatResults[index];
    if (!hit) return;
    trackEvent("search_result_click", {
      query: query.trim(),
      result_type: hit.resultType,
      result_slug: hit.item.slug,
    });
    router.push(hit.href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(flatResults.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (flatResults.length > 0) {
        e.preventDefault();
        openResult(activeIndex);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDismissed(true);
      inputRef.current?.blur();
    }
  }

  // Global shortcut: ⌘K / Ctrl+K or "/" focuses the input
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setDismissed(false);
        return;
      }
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
        setDismissed(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Dismiss the dropdown on click outside the card
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setDismissed(true);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const shouldShow = !dismissed && query.trim().length >= 2 && (loading || results !== null);
  const hasResults =
    results &&
    (results.lenses.length > 0 ||
      results.cameras.length > 0 ||
      results.systems.length > 0 ||
      results.collections.length > 0);

  // Remember the card's collapsed height so the page below doesn't reflow when results expand
  useLayoutEffect(() => {
    if (shouldShow || !cardRef.current) return;
    setCollapsedHeight(cardRef.current.offsetHeight);
    const ro = new ResizeObserver(() => {
      if (!shouldShow && cardRef.current) setCollapsedHeight(cardRef.current.offsetHeight);
    });
    ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, [shouldShow]);

  let rollingIndex = 0;
  const q = query.trim();

  return (
    <div
      ref={wrapperRef}
      className="relative mt-9"
      style={{ height: shouldShow && collapsedHeight ? collapsedHeight : undefined }}
    >
      <div
        ref={cardRef}
        className={`overflow-hidden rounded-[14px] border border-[var(--line-strong)] bg-card shadow-[var(--shadow-panel),0_10px_30px_-15px_oklch(0_0_0_/_0.12)] ${
          shouldShow ? "absolute inset-x-0 top-0 z-30 shadow-[var(--shadow-panel),0_20px_50px_-10px_oklch(0_0_0_/_0.25)]" : ""
        }`}
      >
        <label className="flex items-center gap-3.5 border-b border-border px-5 py-4">
          <Search className="size-[18px] shrink-0 text-[var(--fg-dim)]" strokeWidth={1.75} />
          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setDismissed(false)}
            placeholder="Search lenses, cameras, systems, collections…"
            className="flex-1 bg-transparent text-[18px] -tracking-[0.01em] text-foreground outline-none placeholder:text-[var(--fg-faint)]"
          />
        </label>

        <div className="flex flex-wrap gap-2 border-b border-border bg-[var(--surface-soft)] px-5 py-3">
          {chips.map((chip) => (
            <Link
              key={chip.label}
              href={chip.href}
              className={`mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                chip.active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-[var(--fg-mid)] hover:border-[var(--line-strong)] hover:text-foreground"
              }`}
            >
              {chip.label}
            </Link>
          ))}
        </div>

        {shouldShow && (
          <div className="max-h-[340px] overflow-y-auto border-b border-border">
            {loading && !results && (
              <div className="space-y-2 px-5 py-4">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3.5 w-1/2" />
              </div>
            )}

            {!loading && !hasResults && (
              <div className="px-5 py-6 text-sm text-[var(--fg-dim)]">
                No results for <span className="mono text-foreground">“{q}”</span>
              </div>
            )}

            {hasResults &&
              results &&
              SECTIONS.map(({ key, label, href }) => {
                const items = results[key];
                if (items.length === 0) return null;
                const sectionStart = rollingIndex;
                rollingIndex += items.length;
                return (
                  <div key={key}>
                    <div className="mono flex items-center justify-between border-b border-border bg-[var(--surface-soft)] px-5 py-2 text-[10px] uppercase tracking-[0.1em] text-[var(--fg-faint)]">
                      <span>
                        {label} · {items.length} match{items.length === 1 ? "" : "es"}
                      </span>
                    </div>
                    {items.map((item, i) => {
                      const idx = sectionStart + i;
                      const isActive = idx === activeIndex;
                      return (
                        <Link
                          key={item.id}
                          href={href(item.slug)}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() =>
                            trackEvent("search_result_click", {
                              query: q,
                              result_type: SECTIONS.find((s) => s.key === key)!.resultType,
                              result_slug: item.slug,
                            })
                          }
                          className={`grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--line-soft)] px-5 py-2.5 text-[14px] last:border-b-0 ${
                            isActive
                              ? "bg-[var(--surface-soft)] text-foreground"
                              : "text-foreground hover:bg-[var(--surface-soft)]"
                          }`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="size-3.5 text-[var(--fg-dim)]"
                            fill="none"
                            aria-hidden="true"
                          >
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
                          </svg>
                          <span className="min-w-0 truncate font-medium">
                            {highlight(item.name, q)}
                          </span>
                          <span className="mono text-[11px] text-[var(--fg-dim)]">
                            {label.toLowerCase()}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
          </div>
        )}

        <div className="mono flex items-center justify-between gap-3 bg-[var(--surface-soft)] px-5 py-2.5 text-[10px] tracking-[0.04em] text-[var(--fg-dim)]">
          <div className="flex items-center gap-3.5">
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span className="hidden sm:inline">/ focus</span>
          </div>
          <div className="hidden sm:block">{totalsLine}</div>
        </div>
      </div>
    </div>
  );
}
