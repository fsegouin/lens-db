"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Report {
  id: number;
  entityType: string;
  entityId: number;
  entityName: string;
  message: string;
  status: string;
  createdAt: string;
}

interface Counts {
  pending: number;
  reviewed: number;
  dismissed: number;
}

const ENTITY_PATHS: Record<string, { view: string; edit: string }> = {
  lens: { view: "/lenses", edit: "/admin/lenses" },
  camera: { view: "/cameras", edit: "/admin/cameras" },
  system: { view: "/systems", edit: "/admin/systems" },
  collection: { view: "/collections", edit: "/admin/collections" },
};

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "reviewed", label: "Reviewed" },
  { key: "dismissed", label: "Dismissed" },
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AdminReportsPage() {
  const [tab, setTab] = useState("pending");
  const [reports, setReports] = useState<Report[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, reviewed: 0, dismissed: 0 });
  const [loading, setLoading] = useState(true);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports?status=${tab}`);
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        return;
      }
      const data = await res.json();
      setReports(data.items);
      setCounts(data.counts);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  async function updateStatus(id: number, status: string) {
    try {
      await fetch(`/api/admin/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchReports();
    } catch {
      // ignore
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Issue Reports</h1>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {label}
            {counts[key as keyof Counts] > 0 && (
              <span
                className={`ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs ${
                  key === "pending"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {counts[key as keyof Counts]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Reports list */}
      <div className="mt-4">
        {loading ? (
          <p className="py-8 text-center text-zinc-400">Loading...</p>
        ) : reports.length === 0 ? (
          <p className="py-8 text-center text-zinc-400">No {tab} reports</p>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => {
              const paths = ENTITY_PATHS[report.entityType];
              return (
                <div
                  key={report.id}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800"
                >
                  <div className="flex items-start justify-between gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          {report.entityType}
                        </span>
                        <Link
                          href={`${paths?.view}/${report.entityId}`}
                          className="truncate font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                        >
                          {report.entityName}
                        </Link>
                        <span className="shrink-0 text-xs text-zinc-400">
                          {timeAgo(report.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                        {report.message}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {paths && (
                        <Link
                          href={`${paths.edit}/${report.entityId}/edit?reportId=${report.id}`}
                          className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          Edit
                        </Link>
                      )}
                      {tab === "pending" && (
                        <>
                          <button
                            onClick={() => updateStatus(report.id, "reviewed")}
                            className="rounded-md bg-green-50 px-3 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 dark:bg-green-950 dark:text-green-400 dark:hover:bg-green-900"
                          >
                            Reviewed
                          </button>
                          <button
                            onClick={() => updateStatus(report.id, "dismissed")}
                            className="rounded-md bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                      {tab !== "pending" && (
                        <button
                          onClick={() => updateStatus(report.id, "pending")}
                          className="rounded-md bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
