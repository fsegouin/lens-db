"use client";

import AdminTable from "@/components/admin/AdminTable";

/**
 * Most collection descriptions are scraped HTML that lost its structure: the
 * longest is 13,000 characters of flattened table on a single line. Rendered
 * whole, one row buried the rest of the table. The public pages run these
 * through cleanCollectionDescription, but admin deliberately shows the stored
 * text, so clamp it to a recognisable prefix instead.
 */
const DESCRIPTION_PREVIEW_CHARS = 120;

const columns = [
  { key: "name", label: "Name", sortKey: "name" },
  { key: "lensCount", label: "Lenses", sortKey: "lensCount" },
  {
    key: "description",
    label: "Description",
    render: (value: unknown) => {
      const text = typeof value === "string" ? value : "";
      if (!text) return "";
      const truncated = text.length > DESCRIPTION_PREVIEW_CHARS;
      const preview = text.slice(0, DESCRIPTION_PREVIEW_CHARS);
      return (
        <span
          // The cell shows roughly 65 characters before the CSS ellipsis, so
          // hover is the only way to read further. It carries the preview and
          // the length rather than the whole string, because the longest of
          // these would be a 13,000 character tooltip. Nothing to reveal on a
          // description that already fits, so no tooltip there.
          title={truncated ? `${preview}…\n\n(${text.length} characters)` : undefined}
          className="block max-w-md truncate text-zinc-600 dark:text-zinc-400"
        >
          {preview}
          {truncated ? "…" : ""}
        </span>
      );
    },
  },
];

export default function AdminCollectionsPage() {
  return (
    <AdminTable
      title="Collections"
      apiPath="/api/admin/collections"
      editPath="/admin/collections"
      columns={columns}
      newHref="/admin/collections/new"
    />
  );
}
