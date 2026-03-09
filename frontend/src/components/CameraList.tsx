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

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function handleSearchChange(value: string) {
    setFormQ(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (value) params.set("q", value);
      const qs = params.toString();
      router.push(qs ? `/cameras?${qs}` : "/cameras");
    }, 400);
  }

  return (
    <>
      <input
        type="text"
        placeholder="Search cameras..."
        value={formQ}
        onChange={(e) => handleSearchChange(e.target.value)}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />

      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="pb-3 pr-4 font-medium">Name</th>
                <th className="pb-3 pr-4 font-medium">System</th>
                <th className="pb-3 pr-4 font-medium">Type</th>
                <th className="pb-3 pr-4 font-medium">Model</th>
                <th className="pb-3 pr-4 font-medium">Film Type</th>
                <th className="pb-3 pr-4 font-medium">Dimensions</th>
                <th className="pb-3 pr-4 font-medium">Speeds</th>
                <th className="pb-3 pr-4 font-medium">Imaging Sensor</th>
                <th className="pb-3 pr-4 font-medium">Crop Factor</th>
                <th className="pb-3 font-medium">Exposure Modes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map(({ camera, system }) => {
                const specs = (camera.specs ?? {}) as Record<string, string>;
                return (
                  <tr
                    key={camera.id}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <td className="py-3 pr-4">
                      <Link
                        href={`/cameras/${camera.slug}`}
                        className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {camera.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-zinc-500">
                      {system?.name ?? "\u2014"}
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {specs["Type"] ?? "\u2014"}
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {specs["Model"] ?? "\u2014"}
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {specs["Film type"] ?? "\u2014"}
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {specs["Dimensions"] ?? "\u2014"}
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {specs["Speeds"] ?? "\u2014"}
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {specs["Imaging sensor"] || specs["Imaging plane"] || "\u2014"}
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {specs["Crop factor"] ?? "\u2014"}
                    </td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">
                      {specs["Exposure modes"] ?? "\u2014"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
