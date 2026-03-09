"use client";

import { useState, useCallback } from "react";

interface LensItem {
  id: number;
  name: string;
  brand: string | null;
}

interface SeriesLensManagerProps {
  seriesId: number;
  initialLenses: LensItem[];
}

export default function SeriesLensManager({
  seriesId,
  initialLenses,
}: SeriesLensManagerProps) {
  const [currentLenses, setCurrentLenses] = useState<LensItem[]>(initialLenses);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LensItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const searchLenses = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setSearchResults([]);
        return;
      }

      setSearching(true);
      try {
        const res = await fetch(`/api/admin/lenses?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const ids = new Set(currentLenses.map((l) => l.id));
        setSearchResults(
          (data.items || []).filter(
            (lens: LensItem) => !ids.has(lens.id)
          )
        );
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [currentLenses]
  );

  async function syncLenses(updatedLenses: LensItem[]) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/series/${seriesId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lensIds: updatedLenses.map((l) => l.id),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
      }
      setCurrentLenses(updatedLenses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update lenses");
    } finally {
      setSaving(false);
    }
  }

  function handleAdd(lens: LensItem) {
    const updated = [...currentLenses, lens];
    setSearchResults((prev) => prev.filter((l) => l.id !== lens.id));
    syncLenses(updated);
  }

  function handleRemove(lensId: number) {
    const updated = currentLenses.filter((l) => l.id !== lensId);
    syncLenses(updated);
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    searchLenses(value);
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Lenses in Series
      </h2>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Current lenses */}
      {currentLenses.length === 0 ? (
        <p className="text-sm text-zinc-400">No lenses in this series yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {currentLenses.map((lens) => (
            <li
              key={lens.id}
              className="flex items-center justify-between py-2"
            >
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                {lens.name}
                {lens.brand && (
                  <span className="ml-2 text-zinc-400">({lens.brand})</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(lens.id)}
                disabled={saving}
                className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Search to add lenses */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Add lenses
        </label>
        <input
          type="text"
          placeholder="Search lenses by name..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className={inputClass}
        />

        {searching && (
          <p className="text-sm text-zinc-400">Searching...</p>
        )}

        {searchResults.length > 0 && (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
            {searchResults.map((lens) => (
              <li
                key={lens.id}
                className="flex items-center justify-between px-3 py-2"
              >
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  {lens.name}
                  {lens.brand && (
                    <span className="ml-2 text-zinc-400">({lens.brand})</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => handleAdd(lens)}
                  disabled={saving}
                  className="rounded px-2 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
