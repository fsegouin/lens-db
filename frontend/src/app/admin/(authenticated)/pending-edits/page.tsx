"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type PendingEdit = {
  id: number;
  entityType: string;
  entityId: number;
  entityName: string;
  changes: Record<string, unknown>;
  summary: string;
  userId: number;
  displayName: string | null;
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

function formatFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export default function PendingEditsPage() {
  const router = useRouter();
  const [edits, setEdits] = useState<PendingEdit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    const res = await fetch(`/api/admin/pending-edits?${params}`);
    const data = await res.json();
    setEdits(data.pendingEdits);
    setTotal(data.total);
    setLoading(false);
  }, [page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleAction(editId: number, action: "approve" | "reject") {
    setActionLoading(editId);
    try {
      const res = await fetch(`/api/admin/pending-edits/${editId}`, {
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
          Pending Edits
        </h1>
        <span className="text-sm text-muted-foreground">{total} pending</span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : edits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending edits to review.</p>
      ) : (
        <div className="space-y-2">
          {edits.map((edit) => (
            <div
              key={edit.id}
              className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-950/20"
            >
              <div className="flex items-start gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="shrink-0 rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      {edit.entityType}
                    </span>
                    {edit.entityId === 0 && (
                      <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                        New
                      </span>
                    )}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {edit.entityId === 0 ? (edit.changes as Record<string, unknown>)?.name as string || "Untitled" : edit.entityName}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                    {edit.summary}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {edit.displayName || "Unknown user"} — {formatDate(edit.createdAt)}
                    {" — "}
                    <button
                      onClick={() => setExpandedId(expandedId === edit.id ? null : edit.id)}
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {expandedId === edit.id ? "Hide changes" : "Show changes"}
                    </button>
                  </p>
                </div>

                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => handleAction(edit.id, "approve")}
                    disabled={actionLoading === edit.id}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    size="xs"
                    onClick={() => {
                      if (confirm("Reject this edit?")) {
                        handleAction(edit.id, "reject");
                      }
                    }}
                    disabled={actionLoading === edit.id}
                  >
                    Reject
                  </Button>
                </div>
              </div>

              {expandedId === edit.id && (
                <div className="border-t border-amber-200 px-3 py-2 dark:border-amber-800/50">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="pb-1 pr-3 font-medium">Field</th>
                        <th className="pb-1 font-medium">New Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(edit.changes).map(([field, value]) => (
                        <tr key={field} className="border-t border-zinc-200 dark:border-zinc-700">
                          <td className="py-1 pr-3 font-medium text-zinc-600 dark:text-zinc-400">
                            {formatFieldName(field)}
                          </td>
                          <td className="py-1 text-zinc-900 dark:text-zinc-100">
                            {formatValue(value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
