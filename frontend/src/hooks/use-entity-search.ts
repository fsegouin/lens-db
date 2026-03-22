"use client";

import { useCallback, useRef, useState } from "react";

export type EntityType = "lens" | "camera";

export interface EntitySearchResult {
  id: number;
  name: string;
  systemName: string | null;
  type: EntityType;
  raw: Record<string, unknown>;
}

/**
 * Reusable hook for searching lenses and/or cameras via the API.
 * Used by the comparison search and duplicate flag components.
 */
export function useEntitySearch({
  types = ["lens", "camera"],
  excludeId,
  debounceMs = 300,
  maxResults = 20,
}: {
  /** Which entity types to search. Defaults to both. */
  types?: EntityType[];
  /** Exclude an entity ID from results (e.g. the current lens). */
  excludeId?: number;
  /** Debounce delay in ms. Defaults to 300. */
  debounceMs?: number;
  /** Max total results. Defaults to 20. */
  maxResults?: number;
} = {}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults([]);
        return;
      }

      setSearching(true);
      try {
        const encoded = encodeURIComponent(q);
        const [lensData, cameraData] = await Promise.all([
          types.includes("lens")
            ? fetch(`/api/lenses?q=${encoded}&cursor=0`).then((r) => r.json())
            : { items: [] },
          types.includes("camera")
            ? fetch(`/api/cameras?q=${encoded}&cursor=0`).then((r) => r.json())
            : { items: [] },
        ]);

        const maxPerType = Math.ceil(maxResults / types.length);

        const lenses: EntitySearchResult[] = (lensData.items || [])
          .slice(0, maxPerType)
          .map((item: { lens?: { id: number; name: string }; id?: number; name?: string; system?: { name: string } | null }) => {
            const lens = item.lens || item;
            return {
              id: lens.id!,
              name: lens.name!,
              systemName: item.system?.name ?? null,
              type: "lens" as const,
              raw: item,
            };
          });

        const cameras: EntitySearchResult[] = (cameraData.items || [])
          .slice(0, maxPerType)
          .map((item: { camera?: { id: number; name: string }; id?: number; name?: string; system?: { name: string } | null }) => {
            const camera = item.camera || item;
            return {
              id: camera.id!,
              name: camera.name!,
              systemName: item.system?.name ?? null,
              type: "camera" as const,
              raw: item,
            };
          });

        const all = [...lenses, ...cameras]
          .filter((r) => !(excludeId && r.id === excludeId))
          .slice(0, maxResults);

        setResults(all);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [types, excludeId, maxResults]
  );

  function handleQueryChange(value: string) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), debounceMs);
  }

  function reset() {
    setQuery("");
    setResults([]);
  }

  return { query, results, searching, handleQueryChange, setQuery, setResults, reset };
}
