"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Column {
  key: string;
  label: string;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
}

interface AdminTableProps {
  title: string;
  apiPath: string;         // e.g. "/api/admin/lenses"
  editPath: string;        // e.g. "/admin/lenses"
  columns: Column[];
  newHref: string;         // e.g. "/admin/lenses/new"
}

const PAGE_SIZE = 50;

export default function AdminTable({ title, apiPath, editPath, columns, newHref }: AdminTableProps) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
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
      const res = await fetch(`${apiPath}?${params}`);
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        setItems([]);
        setTotal(0);
        return;
      }
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiPath, search, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset page when search changes
  useEffect(() => { setPage(0); }, [search]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{title}</h1>
        <Link
          href={newHref}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          + New
        </Link>
      </div>

      <input
        type="text"
        placeholder="Search..."
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
                {columns.map((col) => (
                  <th key={col.key} className="px-3 py-2 text-left font-medium text-zinc-500">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map((item) => (
                <tr key={String(item.id)} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  {columns.map((col, i) => (
                    <td key={col.key} className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                      {i === 0 ? (
                        <Link
                          href={`${editPath}/${item.id}/edit`}
                          className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                        >
                          {col.render ? col.render(item[col.key], item) : String(item[col.key] ?? "")}
                        </Link>
                      ) : (
                        col.render ? col.render(item[col.key], item) : String(item[col.key] ?? "")
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-8 text-center text-zinc-400">
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
