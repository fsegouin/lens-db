"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Flag = {
  id: number;
  sourceEntityType: string;
  sourceEntityId: number;
  sourceName: string;
  sourceSlug: string;
  targetEntityType: string;
  targetEntityId: number;
  targetName: string;
  targetSlug: string;
  reason: string | null;
  flaggedByName: string | null;
  status: string;
  createdAt: string;
};

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function entityHref(type: string, slug: string): string {
  return type === "lens" ? `/lenses/${slug}` : `/cameras/${slug}`;
}

export default function DuplicatesPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/duplicates?status=${statusFilter}`);
    const data = await res.json();
    setFlags(data.flags);
    setTotal(data.total);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleAction(flagId: number, action: "confirm" | "dismiss", keepEntityId?: number) {
    setActionLoading(flagId);
    try {
      await fetch(`/api/admin/duplicates/${flagId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, keepEntityId }),
      });
      fetchData();
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Duplicate Flags
        </h1>
        <span className="text-sm text-muted-foreground">{total} {statusFilter}</span>
      </div>

      <div className="flex gap-2">
        {["pending", "confirmed", "dismissed"].map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : flags.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {statusFilter} flags.</p>
      ) : (
        <div className="space-y-3">
          {flags.map((flag) => (
            <div
              key={flag.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">
                      {flag.sourceEntityType}
                    </span>
                    <span className="text-muted-foreground">flagged by</span>
                    <span>{flag.flaggedByName || "Unknown"}</span>
                    <span className="text-muted-foreground">— {formatDate(flag.createdAt)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={entityHref(flag.sourceEntityType, flag.sourceSlug)}
                      className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                    >
                      {flag.sourceName}
                    </Link>
                    <span className="text-muted-foreground">may be duplicate of</span>
                    <Link
                      href={entityHref(flag.targetEntityType, flag.targetSlug)}
                      className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                    >
                      {flag.targetName}
                    </Link>
                  </div>

                  {flag.reason && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Reason: {flag.reason}
                    </p>
                  )}
                </div>

                {flag.status === "pending" && (
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleAction(flag.id, "confirm", flag.targetEntityId)}
                      disabled={actionLoading === flag.id}
                      title={`Merge into ${flag.targetName}`}
                    >
                      Keep &ldquo;{flag.targetName.slice(0, 20)}&rdquo;
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleAction(flag.id, "confirm", flag.sourceEntityId)}
                      disabled={actionLoading === flag.id}
                      title={`Merge into ${flag.sourceName}`}
                    >
                      Keep &ldquo;{flag.sourceName.slice(0, 20)}&rdquo;
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleAction(flag.id, "dismiss")}
                      disabled={actionLoading === flag.id}
                    >
                      Dismiss
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
