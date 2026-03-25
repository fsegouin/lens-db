"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Revision = {
  id: number;
  entityType: string;
  entityId: number;
  entityName: string;
  revisionNumber: number;
  summary: string;
  changedFields: string[];
  userId: number | null;
  displayName: string | null;
  isRevert: boolean | null;
  isPatrolled: boolean | null;
  createdAt: string;
};

function formatDate(date: string): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function entityHref(type: string, id: number): string {
  return `/history/${type}/${id}`;
}

export default function RecentChangesPage() {
  const router = useRouter();
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");
  const [unpatrolledOnly, setUnpatrolledOnly] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (filterType) params.set("entityType", filterType);
    if (unpatrolledOnly) params.set("unpatrolled", "true");

    const res = await fetch(`/api/admin/recent-changes?${params}`);
    const data = await res.json();
    setRevisions(data.revisions);
    setTotal(data.total);
    setLoading(false);
  }, [page, filterType, unpatrolledOnly]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleAction(revisionId: number, action: "patrol" | "revert") {
    setActionLoading(revisionId);
    try {
      const res = await fetch(`/api/admin/revisions/${revisionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        fetchData();
        router.refresh();
      }
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Recent Changes
        </h1>
        <span className="text-sm text-muted-foreground">{total} total</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
          className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">All types</option>
          <option value="lens">Lenses</option>
          <option value="camera">Cameras</option>
          <option value="system">Systems</option>
          <option value="collection">Collections</option>
          <option value="series">Series</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unpatrolledOnly}
            onChange={(e) => { setUnpatrolledOnly(e.target.checked); setPage(1); }}
            className="rounded border-zinc-300 dark:border-zinc-600"
          />
          Unpatrolled only
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : revisions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No revisions found.</p>
      ) : (
        <div className="space-y-1">
          {revisions.map((rev) => (
            <div
              key={rev.id}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
                !rev.isPatrolled
                  ? "border-amber-200 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-950/20"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="shrink-0 rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {rev.entityType}
                  </span>
                  <Link
                    href={entityHref(rev.entityType, rev.entityId)}
                    className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                  >
                    {rev.entityName}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    r{rev.revisionNumber}
                  </span>
                  {rev.isRevert && (
                    <span className="rounded bg-red-100 px-1 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      revert
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                  {rev.summary}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {rev.displayName || "System"} — {formatDate(rev.createdAt)}
                  {rev.changedFields?.length > 0 && (
                    <span className="ml-1">
                      ({rev.changedFields.length} field{rev.changedFields.length !== 1 ? "s" : ""})
                    </span>
                  )}
                </p>
              </div>

              <div className="flex shrink-0 gap-1">
                {!rev.isPatrolled && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => handleAction(rev.id, "patrol")}
                    disabled={actionLoading === rev.id}
                  >
                    Patrol
                  </Button>
                )}
                {rev.revisionNumber > 1 && (
                  <Button
                    variant="destructive"
                    size="xs"
                    onClick={() => {
                      if (confirm("Revert this edit? This will restore the entity to its previous state.")) {
                        handleAction(rev.id, "revert");
                      }
                    }}
                    disabled={actionLoading === rev.id}
                  >
                    Revert
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 50 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(total / 50)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= Math.ceil(total / 50)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
