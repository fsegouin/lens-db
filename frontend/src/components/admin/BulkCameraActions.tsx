"use client";

import { useState } from "react";

export function useBulkCameraActions() {
  const [modal, setModal] = useState<{
    ids: number[];
    resolve: (ok: boolean) => void;
  } | null>(null);

  async function submitBulk(ids: number[], field: string, fieldValue: string) {
    const res = await fetch("/api/admin/cameras/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: "setField", value: { field, fieldValue } }),
    });
    return res.ok;
  }

  const bulkActions = [
    {
      label: "Set Field",
      onAction: (ids: number[]) =>
        new Promise<boolean>((resolve) => {
          setModal({ ids, resolve });
        }),
    },
  ];

  const modalElement = modal ? (
    <SetFieldModal
      ids={modal.ids}
      onSubmit={submitBulk}
      onClose={(ok) => {
        modal.resolve(ok);
        setModal(null);
      }}
    />
  ) : null;

  return { bulkActions, modalElement };
}

function SetFieldModal({
  ids,
  onSubmit,
  onClose,
}: {
  ids: number[];
  onSubmit: (ids: number[], field: string, value: string) => Promise<boolean>;
  onClose: (ok: boolean) => void;
}) {
  const [field, setField] = useState("bodyType");
  const [fieldValue, setFieldValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    const ok = await onSubmit(ids, field, fieldValue);
    setSubmitting(false);
    onClose(ok);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => onClose(false)}>
      <div
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Set Field ({ids.length} cameras)
        </h2>

        <div className="mt-4 space-y-3">
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="bodyType">Body Type</option>
            <option value="sensorType">Sensor Type</option>
            <option value="sensorSize">Sensor Size</option>
          </select>
          <input
            type="text"
            placeholder="Value..."
            value={fieldValue}
            onChange={(e) => setFieldValue(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
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
