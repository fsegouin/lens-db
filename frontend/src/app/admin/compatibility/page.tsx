"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface CompatibilityEntry {
  lensId: number;
  cameraId: number;
  lensName: string;
  cameraName: string;
  isNative: boolean | null;
  notes: string | null;
}

const PAGE_SIZE = 50;

export default function AdminCompatibilityPage() {
  const [items, setItems] = useState<CompatibilityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("cursor", String(page * PAGE_SIZE));
    try {
      const res = await fetch(`/api/admin/compatibility?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(0); }, [search]);

  async function handleDelete(lensId: number, cameraId: number) {
    if (!window.confirm("Are you sure you want to delete this compatibility entry?")) return;

    try {
      const res = await fetch("/api/admin/compatibility", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lensId, cameraId }),
      });
      if (!res.ok) throw new Error("Failed to delete");
      fetchData();
    } catch {
      alert("Failed to delete compatibility entry");
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Compatibility</h1>
        <Link
          href="/admin/compatibility/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          + New
        </Link>
      </div>

      <input
        type="text"
        placeholder="Search by lens or camera name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />

      <div className="text-sm text-zinc-500">{total.toLocaleString()} results</div>

      {loading ? (
        <p className="text-zinc-400">Loading...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-3 py-2 text-left font-medium text-zinc-500">Lens</th>
                <th className="px-3 py-2 text-left font-medium text-zinc-500">Camera</th>
                <th className="px-3 py-2 text-left font-medium text-zinc-500">Native</th>
                <th className="px-3 py-2 text-left font-medium text-zinc-500">Notes</th>
                <th className="px-3 py-2 text-left font-medium text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map((item) => (
                <tr key={`${item.lensId}-${item.cameraId}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                    {item.lensName}
                  </td>
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                    {item.cameraName}
                  </td>
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                    {item.isNative ? "Yes" : "No"}
                  </td>
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                    {item.notes || ""}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleDelete(item.lensId, item.cameraId)}
                      className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-zinc-400">
                    No results found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-zinc-700"
          >
            Prev
          </button>
          <span className="text-sm text-zinc-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-zinc-700"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
