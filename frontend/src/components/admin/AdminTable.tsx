"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface Column {
  key: string;
  label: string;
  sortKey?: string; // API field name for sorting; omit to disable sort on this column
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
}

interface FilterOption {
  label: string;
  value: string;
}

interface FilterConfig {
  key: string;
  label: string;
  options: FilterOption[];
}

interface BulkAction {
  label: string;
  /** Called with the selected item IDs. Should return true if the action succeeded (triggers refetch + clear). */
  onAction: (ids: number[]) => Promise<boolean>;
}

interface AdminTableProps {
  title: string;
  apiPath: string;         // e.g. "/api/admin/lenses"
  editPath: string;        // e.g. "/admin/lenses"
  columns: Column[];
  newHref: string;         // e.g. "/admin/lenses/new"
  filters?: FilterConfig[];
  rowActions?: (item: Record<string, unknown>, refetch: () => void) => React.ReactNode;
  bulkActions?: BulkAction[];
}

const PAGE_SIZE = 50;

export default function AdminTable({
  title,
  apiPath,
  editPath,
  columns,
  newHref,
  filters = [],
  rowActions,
  bulkActions = [],
}: AdminTableProps) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [filterValues, setFilterValues] = useState<Record<string, string>>(
    () => Object.fromEntries(filters.map((filter) => [filter.key, ""]))
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const hasBulk = bulkActions.length > 0;
  const allOnPageSelected = items.length > 0 && items.every((item) => selectedIds.has(Number(item.id)));

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const item of items) next.delete(Number(item.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const item of items) next.add(Number(item.id));
        return next;
      });
    }
  }

  async function runBulkAction(action: BulkAction) {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const ok = await action.onAction(Array.from(selectedIds));
      if (ok) {
        setSelectedIds(new Set());
        fetchData();
      }
    } finally {
      setBulkLoading(false);
    }
  }

  // Debounce search input (400ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    params.set("cursor", String(page * PAGE_SIZE));
    if (sort) {
      params.set("sort", sort);
      params.set("order", order);
    }
    for (const [key, value] of Object.entries(filterValues)) {
      if (value) params.set(key, value);
    }
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
  }, [apiPath, debouncedSearch, filterValues, page, sort, order]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleSort(sortKey: string) {
    if (sort === sortKey) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(sortKey);
      setOrder("asc");
    }
    setPage(0);
  }

  function sortIndicator(sortKey: string) {
    if (sort !== sortKey) return null;
    return <span className="ml-1">{order === "desc" ? "\u2193" : "\u2191"}</span>;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="space-y-4 p-6 pb-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{title}</h1>
          <Link
            href={newHref}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            + New
          </Link>
        </div>

        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-sm rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {filters.map((filter) => (
            <label key={filter.key} className="flex flex-col gap-1 text-sm text-zinc-500">
              <span>{filter.label}</span>
              <select
                value={filterValues[filter.key] ?? ""}
                onChange={(e) => {
                  setFilterValues((current) => ({
                    ...current,
                    [filter.key]: e.target.value,
                  }));
                  setPage(0);
                }}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="text-sm text-zinc-500">{total.toLocaleString()} results</div>

        {hasBulk && selectedIds.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg bg-blue-50 px-4 py-2 dark:bg-blue-950/50">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {selectedIds.size} selected
            </span>
            {bulkActions.map((action) => (
              <button
                key={action.label}
                onClick={() => runBulkAction(action)}
                disabled={bulkLoading}
                className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {action.label}
              </button>
            ))}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="px-6 pt-4 text-zinc-400">Loading...</p>
      ) : (
        <div className="overflow-x-clip">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="shadow-[inset_0_-1px_0_theme(colors.zinc.200)] dark:shadow-[inset_0_-1px_0_theme(colors.zinc.800)]">
                {hasBulk && (
                  <th className="bg-white px-3 py-2 dark:bg-zinc-950">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`bg-white px-9 py-2 text-left font-medium text-zinc-500 dark:bg-zinc-950 ${
                      col.sortKey
                        ? "cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100"
                        : ""
                    }`}
                    onClick={col.sortKey ? () => handleSort(col.sortKey!) : undefined}
                  >
                    {col.label}
                    {col.sortKey && sortIndicator(col.sortKey)}
                  </th>
                ))}
                {rowActions && (
                  <th className="bg-white px-9 py-2 text-left font-medium text-zinc-500 dark:bg-zinc-950">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map((item) => (
                <tr key={String(item.id)} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  {hasBulk && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(Number(item.id))}
                        onChange={() => toggleSelect(Number(item.id))}
                        className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                      />
                    </td>
                  )}
                  {columns.map((col, i) => (
                    <td key={col.key} className="px-9 py-2 text-zinc-700 dark:text-zinc-300">
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
                  {rowActions && (
                    <td className="px-9 py-2 text-zinc-700 dark:text-zinc-300">
                      {rowActions(item, fetchData)}
                    </td>
                  )}
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={columns.length + (rowActions ? 1 : 0) + (hasBulk ? 1 : 0)} className="px-9 py-8 text-center text-zinc-400">
                    No results found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-2 px-6 pb-6">
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
