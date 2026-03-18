"use client";

import { useCallback } from "react";
import AdminTable from "@/components/admin/AdminTable";

const columns = [
  { key: "name", label: "Name", sortKey: "name" },
  { key: "brand", label: "Brand", sortKey: "brand" },
  { key: "systemName", label: "System", sortKey: "system" },
  {
    key: "focalLengthMin",
    label: "Focal Length",
    sortKey: "focalLength",
    render: (_value: unknown, row: Record<string, unknown>) => {
      const min = row.focalLengthMin;
      const max = row.focalLengthMax;
      if (min == null && max == null) return "";
      if (min != null && max != null && min !== max) return `${min}-${max} mm`;
      return `${min ?? max} mm`;
    },
  },
  { key: "yearIntroduced", label: "Year", sortKey: "year" },
  {
    key: "verified",
    label: "Status",
    render: (value: unknown) => (value === false ? "Unverified" : "Verified"),
  },
];

const filters = [
  {
    key: "verified",
    label: "Review status",
    options: [
      { label: "All", value: "" },
      { label: "Verified", value: "true" },
      { label: "Unverified", value: "false" },
    ],
  },
];

export default function AdminLensesPage() {
  const handleVerifyToggle = useCallback(
    (item: Record<string, unknown>, refetch: () => void) => {
      const isVerified = item.verified !== false;

      async function toggle() {
        try {
          const res = await fetch(`/api/admin/lenses/${item.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ verified: !isVerified }),
          });
          if (res.ok) refetch();
        } catch {
          // silently fail
        }
      }

      return (
        <button
          type="button"
          onClick={toggle}
          className={`cursor-pointer rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            isVerified
              ? "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:hover:bg-emerald-900"
          }`}
        >
          {isVerified ? "Unverify" : "Verify"}
        </button>
      );
    },
    []
  );

  return (
    <AdminTable
      title="Lenses"
      apiPath="/api/admin/lenses"
      editPath="/admin/lenses"
      columns={columns}
      filters={filters}
      newHref="/admin/lenses/new"
      rowActions={handleVerifyToggle}
    />
  );
}
