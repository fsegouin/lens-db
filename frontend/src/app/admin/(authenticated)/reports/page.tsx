"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Report {
  id: number;
  entityType: string;
  entityId: number;
  entityName: string;
  entitySlug: string | null;
  message: string;
  fieldName: string | null;
  oldValue: string | null;
  suggestedValue: string | null;
  ipAddress: string | null;
  country: string | null;
  status: string;
  createdAt: string;
}

interface Counts {
  pending: number;
  accepted: number;
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
  { key: "accepted", label: "Accepted" },
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
  const router = useRouter();
  const [tab, setTab] = useState("pending");
  const [reports, setReports] = useState<Report[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, accepted: 0, dismissed: 0 });
  const [loading, setLoading] = useState(true);
  const [blockingIp, setBlockingIp] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);

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
      router.refresh();
    } catch {
      // ignore
    }
  }

  async function blockIp(ip: string) {
    setBlocking(true);
    try {
      await fetch("/api/admin/blocked-ips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ipAddress: ip }),
      });
      setBlockingIp(null);
      fetchReports();
      router.refresh();
    } catch {
      // ignore
    } finally {
      setBlocking(false);
    }
  }

  function entityViewHref(report: Report) {
    const paths = ENTITY_PATHS[report.entityType];
    if (!paths) return "#";
    const slug = report.entitySlug || String(report.entityId);
    return `${paths.view}/${slug}`;
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
            className={`cursor-pointer px-4 py-2 text-sm font-medium transition-colors ${
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
                          href={entityViewHref(report)}
                          className="truncate font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                        >
                          {report.entityName}
                        </Link>
                        <span className="shrink-0 text-xs text-zinc-400">
                          {timeAgo(report.createdAt)}
                        </span>
                        {(report.ipAddress || report.country) && (
                          <span className="shrink-0 text-xs text-zinc-400">
                            {report.country && (
                              <span className="mr-1">{report.country}</span>
                            )}
                            {report.ipAddress && (
                              <button
                                onClick={() => setBlockingIp(report.ipAddress)}
                                className="cursor-pointer font-mono text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                                title="Click to block this IP"
                              >
                                {report.ipAddress}
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                      {report.fieldName ? (
                        <div className="mt-2 rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-800/50">
                          <p className="text-xs font-medium text-zinc-500">{report.fieldName}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="rounded bg-red-100 px-2 py-0.5 text-red-700 line-through dark:bg-red-950 dark:text-red-400">
                              {report.oldValue}
                            </span>
                            <span className="text-zinc-400">&rarr;</span>
                            <span className="rounded bg-green-100 px-2 py-0.5 text-green-700 dark:bg-green-950 dark:text-green-400">
                              {report.suggestedValue}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                          {report.message}
                        </p>
                      )}
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
                          {report.fieldName ? (
                            <button
                              onClick={() => updateStatus(report.id, "accepted")}
                              className="cursor-pointer rounded-md bg-green-50 px-3 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 dark:bg-green-950 dark:text-green-400 dark:hover:bg-green-900"
                            >
                              Accept
                            </button>
                          ) : (
                            <button
                              onClick={() => updateStatus(report.id, "accepted")}
                              className="cursor-pointer rounded-md bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400 dark:hover:bg-blue-900"
                            >
                              Done
                            </button>
                          )}
                          <button
                            onClick={() => updateStatus(report.id, "dismissed")}
                            className="cursor-pointer rounded-md bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                      {tab !== "pending" && (
                        <button
                          onClick={() => updateStatus(report.id, "pending")}
                          className="cursor-pointer rounded-md bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
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

      {/* Block IP confirmation modal */}
      {blockingIp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setBlockingIp(null);
          }}
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Block IP address?
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Permanently block{" "}
              <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
                {blockingIp}
              </span>{" "}
              from submitting reports? All pending reports from this IP will be deleted.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setBlockingIp(null)}
                className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={() => blockIp(blockingIp)}
                disabled={blocking}
                className="cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {blocking ? "Blocking..." : "Block IP"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
