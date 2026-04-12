"use client";

import AdminTable from "@/components/admin/AdminTable";
import { useBulkLensActions } from "@/components/admin/BulkLensActions";

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
    key: "tags",
    label: "Tags",
    render: (value: unknown) => {
      const items = value as { id: number; name: string }[] | undefined;
      if (!items?.length) return "";
      return (
        <span className="flex flex-wrap gap-1">
          {items.map((t) => (
            <span key={t.id} className="inline-block rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-700">
              {t.name}
            </span>
          ))}
        </span>
      );
    },
  },
  {
    key: "series",
    label: "Series",
    render: (value: unknown) => {
      const items = value as { id: number; name: string }[] | undefined;
      if (!items?.length) return "";
      return (
        <span className="flex flex-wrap gap-1">
          {items.map((s) => (
            <span key={s.id} className="inline-block rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
              {s.name}
            </span>
          ))}
        </span>
      );
    },
  },
];

export default function AdminLensesPage() {
  const { bulkActions, modalElement } = useBulkLensActions();

  return (
    <>
      <AdminTable
        title="Lenses"
        apiPath="/api/admin/lenses"
        editPath="/admin/lenses"
        columns={columns}
        newHref="/admin/lenses/new"
        bulkActions={bulkActions}
      />
      {modalElement}
    </>
  );
}
