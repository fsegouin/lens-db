"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatMagnification } from "@/lib/format-magnification";

type Lens = {
  id: number;
  name: string;
  slug: string;
  brand: string | null;
  focalLengthMin: number | null;
  focalLengthMax: number | null;
  apertureMin: number | null;
  apertureMax: number | null;
  weightG: number | null;
  filterSizeMm: number | null;
  minFocusDistanceM: number | null;
  maxMagnification: number | null;
  lensElements: number | null;
  lensGroups: number | null;
  diaphragmBlades: number | null;
  yearIntroduced: number | null;
  yearDiscontinued: number | null;
  isZoom: boolean | null;
  isMacro: boolean | null;
  isPrime: boolean | null;
  hasStabilization: boolean | null;
  hasAutofocus: boolean | null;
  lensType: string | null;
  era: string | null;
  productionStatus: string | null;
  specs: Record<string, string> | null;
};

type SearchResult = {
  lens: Lens;
  system: { name: string } | null;
};

function LensSearch({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: Lens | null;
  onSelect: (lens: Lens) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/lenses?q=${encodeURIComponent(q)}&cursor=0`
      );
      const data = await res.json();
      setResults(data.items?.slice(0, 8) || []);
      setOpen(true);
    } catch {
      setResults([]);
    }
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => search(value), 300);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (selected) {
    return (
      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">
              {selected.name}
            </p>
          </div>
          <button
            onClick={() => {
              onSelect(null as unknown as Lens);
              setQuery("");
            }}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-xs text-zinc-500">{label}</label>
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search for a lens..."
        className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          {results.map(({ lens }) => (
            <button
              key={lens.id}
              onClick={() => {
                onSelect(lens);
                setOpen(false);
                setQuery("");
              }}
              className="block w-full px-4 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
            >
              <span className="text-zinc-900 dark:text-zinc-100">
                {lens.name}
              </span>
              {lens.brand && (
                <span className="ml-2 text-zinc-500">{lens.brand}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SPEC_ROWS: { label: string; getValue: (l: Lens) => string }[] = [
  { label: "Brand", getValue: (l) => l.brand || "\u2014" },
  { label: "Type", getValue: (l) => l.lensType || "\u2014" },
  {
    label: "Focal Length",
    getValue: (l) =>
      l.focalLengthMin
        ? l.focalLengthMin === l.focalLengthMax
          ? `${l.focalLengthMin}mm`
          : `${l.focalLengthMin}\u2013${l.focalLengthMax}mm`
        : "\u2014",
  },
  {
    label: "Max Aperture",
    getValue: (l) => (l.apertureMin ? `f/${l.apertureMin}` : "\u2014"),
  },
  {
    label: "Min Aperture",
    getValue: (l) =>
      l.apertureMax && l.apertureMax !== l.apertureMin
        ? `f/${l.apertureMax}`
        : "\u2014",
  },
  {
    label: "Weight",
    getValue: (l) => (l.weightG ? `${l.weightG}g` : "\u2014"),
  },
  {
    label: "Filter Size",
    getValue: (l) => (l.filterSizeMm ? `${l.filterSizeMm}mm` : "\u2014"),
  },
  {
    label: "Lens Elements",
    getValue: (l) => l.lensElements?.toString() || "\u2014",
  },
  {
    label: "Lens Groups",
    getValue: (l) => l.lensGroups?.toString() || "\u2014",
  },
  {
    label: "Diaphragm Blades",
    getValue: (l) => l.diaphragmBlades?.toString() || "\u2014",
  },
  {
    label: "Min Focus Distance",
    getValue: (l) =>
      l.minFocusDistanceM ? `${l.minFocusDistanceM}m` : "\u2014",
  },
  {
    label: "Max Magnification",
    getValue: (l) => formatMagnification(l.maxMagnification),
  },
  {
    label: "Autofocus",
    getValue: (l) => (l.hasAutofocus ? "Yes" : "No"),
  },
  {
    label: "Stabilization",
    getValue: (l) => (l.hasStabilization ? "Yes" : "No"),
  },
  {
    label: "Year Introduced",
    getValue: (l) => l.yearIntroduced?.toString() || "\u2014",
  },
  {
    label: "Status",
    getValue: (l) => l.productionStatus || "\u2014",
  },
  { label: "Era", getValue: (l) => l.era || "\u2014" },
  {
    label: "Lens Hood",
    getValue: (l) =>
      (l.specs as Record<string, string>)?.["Lens hood"] || "\u2014",
  },
];

export default function CompareClient() {
  const [lens1, setLens1] = useState<Lens | null>(null);
  const [lens2, setLens2] = useState<Lens | null>(null);
  const trackedRef = useRef<string | null>(null);
  const searchParams = useSearchParams();

  // Load lenses from URL search params (e.g. ?lens1=slug1&lens2=slug2)
  useEffect(() => {
    const slug1 = searchParams.get("lens1");
    const slug2 = searchParams.get("lens2");

    async function fetchBySlug(slug: string): Promise<Lens | null> {
      try {
        const res = await fetch(`/api/lenses?slug=${encodeURIComponent(slug)}&cursor=0`);
        const data = await res.json();
        return data.items?.[0]?.lens || null;
      } catch {
        return null;
      }
    }

    if (slug1 && !lens1) {
      fetchBySlug(slug1).then((l) => l && setLens1(l));
    }
    if (slug2 && !lens2) {
      fetchBySlug(slug2).then((l) => l && setLens2(l));
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track comparison when both lenses selected
  useEffect(() => {
    if (!lens1 || !lens2) return;
    const key = `${Math.min(lens1.id, lens2.id)}-${Math.max(lens1.id, lens2.id)}`;
    if (trackedRef.current === key) return;
    trackedRef.current = key;

    fetch("/api/comparisons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lensId1: lens1.id, lensId2: lens2.id }),
    }).catch(() => {});
  }, [lens1, lens2]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <LensSearch label="Lens 1" selected={lens1} onSelect={setLens1} />
        <LensSearch label="Lens 2" selected={lens2} onSelect={setLens2} />
      </div>

      {lens1 && lens2 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="py-3 pr-4 text-left font-medium text-zinc-500">
                  Spec
                </th>
                <th className="py-3 pr-4 text-left font-medium text-zinc-500">
                  <Link
                    href={`/lenses/${lens1.slug}`}
                    className="hover:underline"
                  >
                    {lens1.name}
                  </Link>
                </th>
                <th className="py-3 text-left font-medium text-zinc-500">
                  <Link
                    href={`/lenses/${lens2.slug}`}
                    className="hover:underline"
                  >
                    {lens2.name}
                  </Link>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {SPEC_ROWS.map(({ label, getValue }) => {
                const v1 = getValue(lens1);
                const v2 = getValue(lens2);
                const isDiff =
                  v1 !== v2 && v1 !== "\u2014" && v2 !== "\u2014";
                return (
                  <tr
                    key={label}
                    className={
                      isDiff ? "bg-amber-50/50 dark:bg-amber-900/10" : ""
                    }
                  >
                    <td className="py-2 pr-4 font-medium text-zinc-500 dark:text-zinc-400">
                      {label}
                    </td>
                    <td
                      className={`py-2 pr-4 ${isDiff ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"}`}
                    >
                      {v1}
                    </td>
                    <td
                      className={`py-2 ${isDiff ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"}`}
                    >
                      {v2}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
