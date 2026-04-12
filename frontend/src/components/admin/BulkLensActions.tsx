"use client";

import { useState, useEffect } from "react";

interface Tag {
  id: number;
  name: string;
}

interface Series {
  id: number;
  name: string;
}

/**
 * Hook that provides bulk action definitions for the lens admin table.
 * Returns the bulkActions array and a modal element to render.
 */
export function useBulkLensActions() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [modal, setModal] = useState<{
    type: "addTags" | "removeTags" | "addToSeries" | "setField";
    ids: number[];
    resolve: (ok: boolean) => void;
  } | null>(null);

  // Fetch tags and series on mount
  useEffect(() => {
    fetch("/api/admin/tags").then((r) => r.json()).then((d) => setTags(d.items || [])).catch(() => {});
    fetch("/api/admin/series").then((r) => r.json()).then((d) => setSeriesList(d.items || [])).catch(() => {});
  }, []);

  function openModal(type: typeof modal extends null ? never : NonNullable<typeof modal>["type"], ids: number[]): Promise<boolean> {
    return new Promise((resolve) => {
      setModal({ type, ids, resolve });
    });
  }

  async function submitBulk(action: string, ids: number[], value: unknown) {
    const res = await fetch("/api/admin/lenses/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action, value }),
    });
    return res.ok;
  }

  const bulkActions = [
    {
      label: "Add Tags",
      onAction: (ids: number[]) => openModal("addTags", ids),
    },
    {
      label: "Add to Series",
      onAction: (ids: number[]) => openModal("addToSeries", ids),
    },
    {
      label: "Set Field",
      onAction: (ids: number[]) => openModal("setField", ids),
    },
  ];

  const modalElement = modal ? (
    <BulkModal
      modal={modal}
      tags={tags}
      seriesList={seriesList}
      onSubmit={submitBulk}
      onClose={(ok) => {
        modal.resolve(ok);
        setModal(null);
      }}
    />
  ) : null;

  return { bulkActions, modalElement };
}

function BulkModal({
  modal,
  tags,
  seriesList,
  onSubmit,
  onClose,
}: {
  modal: { type: string; ids: number[] };
  tags: Tag[];
  seriesList: Series[];
  onSubmit: (action: string, ids: number[], value: unknown) => Promise<boolean>;
  onClose: (ok: boolean) => void;
}) {
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null);
  const [field, setField] = useState("brand");
  const [fieldValue, setFieldValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [localTags, setLocalTags] = useState(tags);

  useEffect(() => { setLocalTags(tags); }, [tags]);

  async function handleSubmit() {
    setSubmitting(true);
    let ok = false;
    if (modal.type === "addTags" || modal.type === "removeTags") {
      ok = await onSubmit(modal.type, modal.ids, Array.from(selectedTagIds));
    } else if (modal.type === "addToSeries") {
      if (selectedSeriesId) ok = await onSubmit("addToSeries", modal.ids, selectedSeriesId);
    } else if (modal.type === "setField") {
      ok = await onSubmit("setField", modal.ids, { field, fieldValue });
    }
    setSubmitting(false);
    onClose(ok);
  }

  async function createTag() {
    if (!newTagName.trim()) return;
    const res = await fetch("/api/admin/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTagName.trim() }),
    });
    if (res.ok) {
      const tag = await res.json();
      setLocalTags((prev) => [...prev, tag]);
      setSelectedTagIds((prev) => new Set([...prev, tag.id]));
      setNewTagName("");
    }
  }

  const titles: Record<string, string> = {
    addTags: "Add Tags",
    removeTags: "Remove Tags",
    addToSeries: "Add to Series",
    setField: "Set Field Value",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => onClose(false)}>
      <div
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {titles[modal.type]} ({modal.ids.length} lenses)
        </h2>

        <div className="mt-4 space-y-3">
          {(modal.type === "addTags" || modal.type === "removeTags") && (
            <>
              <div className="max-h-48 space-y-1 overflow-auto">
                {localTags.map((tag) => (
                  <label key={tag.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedTagIds.has(tag.id)}
                      onChange={() => {
                        setSelectedTagIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(tag.id)) next.delete(tag.id);
                          else next.add(tag.id);
                          return next;
                        });
                      }}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    <span className="text-zinc-700 dark:text-zinc-300">{tag.name}</span>
                  </label>
                ))}
                {localTags.length === 0 && (
                  <p className="text-sm text-zinc-400">No tags yet. Create one below.</p>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="New tag name..."
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createTag()}
                  className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <button
                  onClick={createTag}
                  className="rounded-md bg-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                >
                  Create
                </button>
              </div>
            </>
          )}

          {modal.type === "addToSeries" && (
            <select
              value={selectedSeriesId ?? ""}
              onChange={(e) => setSelectedSeriesId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="">Select a series...</option>
              {seriesList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}

          {modal.type === "setField" && (
            <>
              <select
                value={field}
                onChange={(e) => setField(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="brand">Brand</option>
                <option value="era">Era</option>
                <option value="productionStatus">Production Status</option>
                <option value="lensType">Lens Type</option>
              </select>
              <input
                type="text"
                placeholder="Value..."
                value={fieldValue}
                onChange={(e) => setFieldValue(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={() => onClose(false)}
            className="rounded-md px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Applying..." : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
