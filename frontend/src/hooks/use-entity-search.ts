"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type EntityType = "lens" | "camera";

const DEFAULT_TYPES: EntityType[] = ["lens", "camera"];

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
  types = DEFAULT_TYPES,
  excludeId,
  excludeType,
  debounceMs = 300,
  maxResults = 20,
}: {
  /** Which entity types to search. Defaults to both. */
  types?: EntityType[];
  /** Exclude an entity ID from results (e.g. the current lens). */
  excludeId?: number;
  /** Entity type the excluded ID belongs to. Without it, the ID is excluded across all searched types (lens and camera IDs are independent sequences, so pass this when searching both). */
  excludeType?: EntityType;
  /** Debounce delay in ms. Defaults to 300. */
  debounceMs?: number;
  /** Max total results. Defaults to 20. */
  maxResults?: number;
} = {}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Monotonic id so a slow earlier response can't overwrite a newer one
  const searchIdRef = useRef(0);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const search = useCallback(
    async (q: string) => {
      const searchId = ++searchIdRef.current;
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
          .filter(
            (r) =>
              !(excludeId && r.id === excludeId && (!excludeType || r.type === excludeType)),
          )
          .slice(0, maxResults);

        if (searchId === searchIdRef.current) setResults(all);
      } catch {
        if (searchId === searchIdRef.current) setResults([]);
      } finally {
        if (searchId === searchIdRef.current) setSearching(false);
      }
    },
    [types, excludeId, excludeType, maxResults]
  );

  function handleQueryChange(value: string) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), debounceMs);
  }

  function reset() {
    clearTimeout(debounceRef.current);
    // Invalidate any in-flight search so its response can't repopulate results
    searchIdRef.current++;
    setQuery("");
    setResults([]);
    setSearching(false);
  }

  return { query, results, searching, handleQueryChange, setQuery, setResults, reset };
}
