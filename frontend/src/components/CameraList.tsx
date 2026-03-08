"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { cameras, systems } from "@/db/schema";

type CameraRow = {
  camera: typeof cameras.$inferSelect;
  system: typeof systems.$inferSelect | null;
};

type Props = {
  initialItems: CameraRow[];
  initialTotal: number;
  initialNextCursor: number | null;
};

export default function CameraList({
  initialItems,
  initialTotal,
  initialNextCursor,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<CameraRow[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<number | null>(initialNextCursor);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const q = searchParams.get("q") || "";
  const [formQ, setFormQ] = useState(q);

  useEffect(() => {
    setFormQ(q);
  }, [q]);

  useEffect(() => {
    setItems(initialItems);
    setNextCursor(initialNextCursor);
    setTotal(initialTotal);
  }, [initialItems, initialNextCursor, initialTotal]);

  const buildApiUrl = useCallback(
    (cursor: number) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("cursor", String(cursor));
      return `/api/cameras?${params.toString()}`;
    },
    [q]
  );

  const loadMore = useCallback(async () => {
    if (loading || nextCursor === null) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(nextCursor));
      const data = await res.json();
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
      setTotal(data.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [loading, nextCursor, buildApiUrl]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (formQ) params.set("q", formQ);
    const qs = params.toString();
    router.push(qs ? `/cameras?${qs}` : "/cameras");
  }

  return (
    <>
      <form className="flex flex-wrap gap-3" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder="Search cameras..."
          value={formQ}
          onChange={(e) => setFormQ(e.target.value)}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Search
        </button>
      </form>

      {items.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ camera, system }) => (
            <Link
              key={camera.id}
              href={`/cameras/${camera.slug}`}
              className="rounded-lg border border-zinc-200 p-4 transition-all hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-600"
            >
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
                {camera.name}
              </h2>
              {system && (
                <p className="mt-1 text-sm text-zinc-500">{system.name}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
                {camera.sensorSize && <span>{camera.sensorSize}</span>}
                {camera.megapixels && <span>{camera.megapixels}MP</span>}
                {camera.yearIntroduced && (
                  <span>{camera.yearIntroduced}</span>
                )}
                {camera.weightG && <span>{camera.weightG}g</span>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-zinc-500">
            No cameras found. Run the scraper to populate the database.
          </p>
        </div>
      )}

      {nextCursor !== null && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          {loading && (
            <p className="text-sm text-zinc-500">Loading more...</p>
          )}
        </div>
      )}
    </>
  );
}
