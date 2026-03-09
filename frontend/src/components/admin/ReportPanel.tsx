"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

interface Report {
  id: number;
  entityType: string;
  entityName: string;
  message: string;
  status: string;
  createdAt: string;
}

export default function ReportPanel() {
  const searchParams = useSearchParams();
  const reportId = searchParams.get("reportId");
  const [report, setReport] = useState<Report | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    fetch(`/api/admin/reports/${reportId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setReport(data); });
  }, [reportId]);

  async function updateStatus(status: string) {
    if (!report) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) setReport({ ...report, status });
    } catch {
      // ignore
    } finally {
      setUpdating(false);
    }
  }

  if (!reportId || !report) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Issue Report
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            report.status === "pending"
              ? "bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-300"
              : report.status === "reviewed"
                ? "bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-300"
                : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
          }`}
        >
          {report.status}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-amber-900 dark:text-amber-200">
        {report.message}
      </p>
      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
        {new Date(report.createdAt).toLocaleString()}
      </p>
      {report.status === "pending" && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => updateStatus("reviewed")}
            disabled={updating}
            className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            Mark Reviewed
          </button>
          <button
            onClick={() => updateStatus("dismissed")}
            disabled={updating}
            className="rounded-md bg-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
