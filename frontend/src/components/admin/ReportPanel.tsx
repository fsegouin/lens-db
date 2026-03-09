"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

interface Report {
  id: number;
  entityType: string;
  entityName: string;
  message: string;
  fieldName: string | null;
  oldValue: string | null;
  suggestedValue: string | null;
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
              : report.status === "accepted"
                ? "bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-300"
                : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
          }`}
        >
          {report.status}
        </span>
      </div>
      {report.fieldName ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            {report.fieldName}
          </p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">Old:</span>
              <span className="rounded bg-red-100 px-2 py-0.5 text-sm text-red-800 line-through dark:bg-red-950 dark:text-red-300">
                {report.oldValue}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">New:</span>
              <span className="rounded bg-green-100 px-2 py-0.5 text-sm font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
                {report.suggestedValue}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm text-amber-900 dark:text-amber-200">
          {report.message}
        </p>
      )}
      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
        {new Date(report.createdAt).toLocaleString()}
      </p>
      {report.status === "pending" && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => updateStatus("accepted")}
            disabled={updating}
            className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50 ${
              report.fieldName
                ? "bg-green-600 hover:bg-green-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {report.fieldName ? "Accept" : "Done"}
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
