"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface SearchItem {
  id: number;
  name: string;
}

function useEntitySearch(apiPath: string) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [selected, setSelected] = useState<SearchItem | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query || query.length < 1) {
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${apiPath}?q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data = await res.json();
        setResults(data.items || []);
        setShowDropdown(true);
      } catch {
        setResults([]);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, apiPath]);

  const select = useCallback((item: SearchItem) => {
    setSelected(item);
    setQuery("");
    setShowDropdown(false);
    setResults([]);
  }, []);

  const clear = useCallback(() => {
    setSelected(null);
    setQuery("");
    setResults([]);
    setShowDropdown(false);
  }, []);

  return { query, setQuery, results, selected, showDropdown, setShowDropdown, select, clear };
}

export default function CompatibilityForm() {
  const router = useRouter();
  const [isNative, setIsNative] = useState(true);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const lens = useEntitySearch("/api/admin/lenses");
  const camera = useEntitySearch("/api/admin/cameras");

  const lensRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (lensRef.current && !lensRef.current.contains(e.target as Node)) {
        lens.setShowDropdown(false);
      }
      if (cameraRef.current && !cameraRef.current.contains(e.target as Node)) {
        camera.setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [lens, camera]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!lens.selected) {
      setError("Please select a lens");
      return;
    }
    if (!camera.selected) {
      setError("Please select a camera");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/admin/compatibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lensId: lens.selected.id,
          cameraId: camera.selected.id,
          isNative,
          notes: notes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
      }

      router.push("/admin/compatibility");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        New Compatibility Entry
      </h1>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Lens search */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Lens *
          </label>
          {lens.selected ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                {lens.selected.name}
                <button
                  type="button"
                  onClick={lens.clear}
                  className="ml-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  aria-label="Clear lens selection"
                >
                  &times;
                </button>
              </span>
            </div>
          ) : (
            <div className="relative" ref={lensRef}>
              <input
                type="text"
                placeholder="Search lenses..."
                value={lens.query}
                onChange={(e) => lens.setQuery(e.target.value)}
                onFocus={() => { if (lens.results.length > 0) lens.setShowDropdown(true); }}
                className={inputClass}
              />
              {lens.showDropdown && lens.results.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-zinc-300 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                  {lens.results.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => lens.select(item)}
                        className="w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        {item.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Camera search */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Camera *
          </label>
          {camera.selected ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                {camera.selected.name}
                <button
                  type="button"
                  onClick={camera.clear}
                  className="ml-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  aria-label="Clear camera selection"
                >
                  &times;
                </button>
              </span>
            </div>
          ) : (
            <div className="relative" ref={cameraRef}>
              <input
                type="text"
                placeholder="Search cameras..."
                value={camera.query}
                onChange={(e) => camera.setQuery(e.target.value)}
                onFocus={() => { if (camera.results.length > 0) camera.setShowDropdown(true); }}
                className={inputClass}
              />
              {camera.showDropdown && camera.results.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-zinc-300 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                  {camera.results.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => camera.select(item)}
                        className="w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        {item.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* isNative checkbox */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isNative"
            checked={isNative}
            onChange={(e) => setIsNative(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
          />
          <label htmlFor="isNative" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Native compatibility
          </label>
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </div>

        <div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {saving ? "Saving..." : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
