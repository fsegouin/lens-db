"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Revision = {
  id: number;
  revisionNumber: number;
  summary: string;
  changedFields: unknown;
  userId: number | null;
  displayName: string | null;
  isRevert: boolean | null;
  isPatrolled: boolean | null;
  createdAt: string | Date | null;
};

type DiffEntry = {
  field: string;
  oldValue: unknown;
  newValue: unknown;
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function formatDate(date: string | Date | null): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Human-readable field labels
const fieldLabels: Record<string, string> = {
  name: "Name",
  slug: "Slug",
  description: "Description",
  brand: "Brand",
  url: "Source URL",
  lensType: "Lens Type",
  era: "Era",
  productionStatus: "Production Status",
  focalLengthMin: "Focal Length Min",
  focalLengthMax: "Focal Length Max",
  apertureMin: "Max Aperture",
  apertureMax: "Min Aperture",
  weightG: "Weight (g)",
  filterSizeMm: "Filter Size (mm)",
  minFocusDistanceM: "Min Focus Distance (m)",
  maxMagnification: "Max Magnification",
  lensElements: "Lens Elements",
  lensGroups: "Lens Groups",
  diaphragmBlades: "Diaphragm Blades",
  yearIntroduced: "Year Introduced",
  yearDiscontinued: "Year Discontinued",
  isZoom: "Zoom",
  isMacro: "Macro",
  isPrime: "Prime",
  hasStabilization: "Stabilization",
  hasAutofocus: "Autofocus",
  sensorType: "Sensor Type",
  sensorSize: "Sensor Size",
  megapixels: "Megapixels",
  resolution: "Resolution",
  bodyType: "Body Type",
  alias: "Alias",
  manufacturer: "Manufacturer",
  mountType: "Mount Type",
};

export default function RevisionList({
  revisions,
  entityType,
  entityId,
}: {
  revisions: Revision[];
  entityType: string;
  entityId: number;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [diffData, setDiffData] = useState<Record<number, DiffEntry[]>>({});
  const [loading, setLoading] = useState<number | null>(null);

  async function toggleDiff(revisionId: number) {
    if (expandedId === revisionId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(revisionId);

    if (diffData[revisionId]) return;

    setLoading(revisionId);
    try {
      const res = await fetch(`/api/revisions/${revisionId}`);
      const data = await res.json();
      setDiffData((prev) => ({
        ...prev,
        [revisionId]: data.diff || [],
      }));
    } catch {
      // silently fail
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      {revisions.map((rev) => {
        const changedFields = Array.isArray(rev.changedFields)
          ? (rev.changedFields as string[])
          : [];

        return (
          <div
            key={rev.id}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800"
          >
            <button
              onClick={() => toggleDiff(rev.id)}
              className="flex w-full items-start gap-3 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
            >
              <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                r{rev.revisionNumber}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-900 dark:text-zinc-100">
                  {rev.summary}
                  {rev.isRevert && (
                    <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      revert
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {rev.displayName || "System"} — {formatDate(rev.createdAt)}
                  {changedFields.length > 0 && (
                    <span className="ml-1">
                      ({changedFields.map((f) => fieldLabels[f] || f).join(", ")})
                    </span>
                  )}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {expandedId === rev.id ? "Hide" : "Diff"}
              </span>
            </button>

            {expandedId === rev.id && (
              <div className="border-t border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/30">
                {loading === rev.id ? (
                  <p className="text-xs text-muted-foreground">Loading diff...</p>
                ) : rev.revisionNumber === 1 ? (
                  <p className="text-xs text-muted-foreground">
                    Initial revision — no previous version to compare against.
                  </p>
                ) : (diffData[rev.id] || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No changes found.</p>
                ) : (
                  <div className="space-y-2">
                    {(diffData[rev.id] || []).map((diff) => (
                      <div key={diff.field} className="text-sm">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          {fieldLabels[diff.field] || diff.field}
                        </p>
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                          <div className="rounded bg-red-50 px-2 py-1 text-xs dark:bg-red-950/30">
                            <span className="text-red-600 dark:text-red-400">
                              {formatValue(diff.oldValue)}
                            </span>
                          </div>
                          <div className="rounded bg-green-50 px-2 py-1 text-xs dark:bg-green-950/30">
                            <span className="text-green-600 dark:text-green-400">
                              {formatValue(diff.newValue)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
