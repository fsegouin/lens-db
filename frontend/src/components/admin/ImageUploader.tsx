"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { resizeImageBlob } from "@/lib/client-image-resize";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ImageData } from "@/lib/image-types";
import type { ImageProvenance } from "@/lib/image-provenance";
import { IMAGE_LICENCES, licenceUrlFor } from "@/lib/image-licences";

interface Props {
  entityType: "cameras" | "lenses";
  entityId: number;
  entityName: string;
  initialImages: ImageData[];
  onChange?: (images: ImageData[]) => void;
}

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const OTHER_LICENCE = "__other__";
const EMPTY_PROVENANCE: Required<ImageProvenance> = { credit: "", sourceUrl: "", license: "", licenseUrl: "" };

function provenanceOf(img: ImageData): Required<ImageProvenance> {
  return {
    credit: img.credit ?? "",
    sourceUrl: img.sourceUrl ?? "",
    license: img.license ?? "",
    licenseUrl: img.licenseUrl ?? "",
  };
}

const labelClass = "mb-0.5 block text-[11px] text-zinc-500 dark:text-zinc-400";
const fieldClass =
  "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

/**
 * Source name, source URL and licence for one image, or for the uploads about
 * to happen. The licence is a preset list because the label has to match what
 * the Commons ingest writes for the credit line to read the same on every
 * page; "Other" opens the label and deed URL for the odd case.
 */
function ProvenanceFields({
  value,
  onChange,
  idPrefix,
}: {
  value: Required<ImageProvenance>;
  onChange: (next: Required<ImageProvenance>) => void;
  idPrefix: string;
}) {
  // Explicit rather than derived from the label: while "Other" is being typed
  // the label passes through "" and could equal a preset, and neither should
  // snap the free-text inputs away under the cursor.
  const [other, setOther] = useState(
    () => value.license !== "" && !IMAGE_LICENCES.some((l) => l.label === value.license),
  );
  // What was typed under "Other", kept so a slip onto a preset does not cost it.
  const custom = useRef({ license: other ? value.license : "", licenseUrl: other ? value.licenseUrl : "" });
  const selected = other ? OTHER_LICENCE : value.license;

  function pickLicence(label: string) {
    if (label === OTHER_LICENCE) {
      setOther(true);
      onChange({ ...value, ...custom.current });
      return;
    }
    if (other) custom.current = { license: value.license, licenseUrl: value.licenseUrl };
    setOther(false);
    onChange({ ...value, license: label, licenseUrl: licenceUrlFor(label) ?? "" });
  }

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <label className="block">
        <span className={labelClass}>Source</span>
        <input
          id={`${idPrefix}-credit`}
          type="text"
          value={value.credit}
          onChange={(e) => onChange({ ...value, credit: e.target.value })}
          placeholder="Nikon, Jane Doe…"
          className={fieldClass}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Source URL</span>
        <input
          id={`${idPrefix}-source-url`}
          type="url"
          value={value.sourceUrl}
          onChange={(e) => onChange({ ...value, sourceUrl: e.target.value })}
          placeholder="https://"
          className={fieldClass}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Licence</span>
        <select
          id={`${idPrefix}-licence`}
          value={selected}
          onChange={(e) => pickLicence(e.target.value)}
          className={fieldClass}
        >
          <option value="">Not stated</option>
          {IMAGE_LICENCES.map((l) => (
            <option key={l.label} value={l.label}>{l.label}</option>
          ))}
          <option value={OTHER_LICENCE}>Other…</option>
        </select>
      </label>
      {selected === OTHER_LICENCE && (
        <>
          <label className="block sm:col-start-2">
            <span className={labelClass}>Licence name</span>
            <input
              type="text"
              value={value.license}
              onChange={(e) => onChange({ ...value, license: e.target.value })}
              placeholder="e.g. GFDL 1.2"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Licence URL</span>
            <input
              type="url"
              value={value.licenseUrl}
              onChange={(e) => onChange({ ...value, licenseUrl: e.target.value })}
              placeholder="https://"
              className={fieldClass}
            />
          </label>
        </>
      )}
    </div>
  );
}

function Thumbnail({
  img,
  entityName,
  selected,
  onDelete,
  onEdit,
  editRef,
}: {
  img: ImageData;
  entityName: string;
  selected: boolean;
  onDelete: () => void;
  onEdit: () => void;
  editRef: (el: HTMLButtonElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: img.src });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const ring = selected ? "ring-2 ring-zinc-900 dark:ring-zinc-100" : "";
  const sourced = Boolean(img.credit || img.license);
  const label = sourced ? [img.credit, img.license].filter(Boolean).join(" · ") : "No source";
  // Two short lines on a 100px tile: credit on one, licence on the other, so
  // the licence is not the half that truncation always takes.
  const lines = sourced ? [img.credit, img.license].filter(Boolean) : ["No source"];
  return (
    <div ref={setNodeRef} style={style} className={`relative aspect-square overflow-hidden rounded border border-zinc-200 dark:border-zinc-700 ${ring}`}>
      <div {...attributes} {...listeners} className="absolute inset-0 cursor-grab active:cursor-grabbing">
        <Image src={img.src} alt={img.alt || entityName} fill sizes="100px" className="object-cover" />
      </div>
      <button
        ref={editRef}
        type="button"
        onClick={onEdit}
        aria-label={`Edit source: ${label}`}
        title={sourced ? `${label}. Click to edit.` : "No source recorded. Click to add one."}
        className={`absolute inset-x-0 bottom-0 px-1 py-1 text-left text-[11px] leading-tight ${
          sourced
            ? "bg-black/65 text-white hover:bg-black/85"
            : "bg-amber-800/90 text-white hover:bg-amber-900"
        }`}
      >
        {lines.map((line, i) => (
          <span key={i} className="block truncate">{line}</span>
        ))}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="absolute right-1 top-1 rounded-full bg-black/60 px-2 text-xs text-white hover:bg-black/80"
        aria-label="Remove image"
      >
        ×
      </button>
    </div>
  );
}

export default function ImageUploader({
  entityType,
  entityId,
  entityName,
  initialImages,
  onChange,
}: Props) {
  const [images, setImages] = useState<ImageData[]>(initialImages);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Applied to every upload until changed, so a batch from one source is
  // credited once rather than image by image afterwards.
  const [uploadProvenance, setUploadProvenance] = useState<Required<ImageProvenance>>(EMPTY_PROVENANCE);
  const [editingSrc, setEditingSrc] = useState<string | null>(null);
  const [draft, setDraft] = useState<Required<ImageProvenance>>(EMPTY_PROVENANCE);
  const [saving, setSaving] = useState(false);
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  // Open on a wide screen, where the three fields are one short row; folded
  // on a phone, where they stack to a form an admin fixing one caption would
  // otherwise scroll past. Rendered folded on the server either way: opening
  // after mount moves the page by one row on a desktop, where folding it
  // after mount would move it by the whole stacked form on a phone.
  const [uploadOpen, setUploadOpen] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(min-width: 640px)").matches) setUploadOpen(true);
  }, []);

  const updateImages = useCallback(
    (next: ImageData[]) => {
      setImages(next);
      onChange?.(next);
    },
    [onChange],
  );

  // Serialize uploads: each response contains the full image list, so
  // concurrent requests would otherwise clobber each other (last response wins)
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());

  const enqueueUpload = useCallback((task: () => Promise<void>) => {
    const next = uploadQueueRef.current.then(task, task);
    uploadQueueRef.current = next;
    return next;
  }, []);

  const uploadFile = useCallback(
    (file: File) => {
      if (!ALLOWED_TYPES.has(file.type)) {
        setError(`Unsupported type ${file.type}`);
        return Promise.resolve();
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("File too large (max 10 MB)");
        return Promise.resolve();
      }
      return enqueueUpload(async () => {
        setBusy(true);
        setError(null);
        try {
          const resized = await resizeImageBlob(file);
          const formData = new FormData();
          formData.append("file", resized, "upload.webp");
          for (const [key, value] of Object.entries(uploadProvenance)) {
            if (value) formData.append(key, value);
          }
          const resp = await fetch(`/api/admin/${entityType}/${entityId}/images`, {
            method: "POST",
            body: formData,
          });
          if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
          const data = await resp.json();
          updateImages(data.images);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      });
    },
    [entityType, entityId, updateImages, enqueueUpload, uploadProvenance],
  );

  const uploadUrl = useCallback(
    (url: string) =>
      enqueueUpload(async () => {
        setBusy(true);
        setError(null);
        try {
          const resp = await fetch(`/api/admin/${entityType}/${entityId}/images`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, ...uploadProvenance }),
          });
          if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
          const data = await resp.json();
          updateImages(data.images);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }),
    [entityType, entityId, updateImages, enqueueUpload, uploadProvenance],
  );

  const readFromClipboard = useCallback(async () => {
    setError(null);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], "clipboard.png", { type: imageType });
          await uploadFile(file);
          return;
        }
      }
      const text = await navigator.clipboard.readText();
      try { new URL(text); } catch {
        setError("Clipboard has no image or URL");
        return;
      }
      await uploadUrl(text);
    } catch (e) {
      setError(`Clipboard read failed: ${(e as Error).message}`);
    }
  }, [uploadFile, uploadUrl]);

  const onPaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const fileItem = items.find((it) => it.kind === "file" && it.type.startsWith("image/"));
      if (fileItem) {
        const file = fileItem.getAsFile();
        if (file) {
          e.preventDefault();
          await uploadFile(file);
          return;
        }
      }
      const textItem = items.find((it) => it.kind === "string" && it.type === "text/plain");
      if (textItem) {
        textItem.getAsString(async (text) => {
          try { new URL(text); } catch { return; }
          await uploadUrl(text);
        });
      }
    },
    [uploadFile, uploadUrl],
  );

  const deleteImage = useCallback(
    async (src: string) => {
      if (!confirm("Remove this image?")) return;
      setError(null);
      try {
        const resp = await fetch(`/api/admin/${entityType}/${entityId}/images`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ src }),
        });
        if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
        const data = await resp.json();
        updateImages(data.images);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [entityType, entityId, updateImages],
  );

  const startEditing = useCallback((img: ImageData) => {
    setEditingSrc(img.src);
    setDraft(provenanceOf(img));
  }, []);

  // Closing the panel hands focus back to the caption that opened it, rather
  // than dropping a keyboard user at the top of the page.
  const closeEditor = useCallback(() => {
    const src = editingSrc;
    setEditingSrc(null);
    if (src) editButtons.current.get(src)?.focus();
  }, [editingSrc]);

  // Queued behind any upload in flight: both read the row and write the whole
  // list back, so running them together would lose one or the other.
  const saveProvenance = useCallback(() => {
    if (!editingSrc) return Promise.resolve();
    const src = editingSrc;
    const body = { src, ...draft };
    setSaving(true);
    setError(null);
    return enqueueUpload(async () => {
      try {
        const resp = await fetch(`/api/admin/${entityType}/${entityId}/images`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
        const data = await resp.json();
        updateImages(data.images);
        setEditingSrc((current) => (current === src ? null : current));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSaving(false);
      }
    });
  }, [editingSrc, draft, entityType, entityId, updateImages, enqueueUpload]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = images.findIndex((i) => i.src === active.id);
      const newIndex = images.findIndex((i) => i.src === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = arrayMove(images, oldIndex, newIndex);
      updateImages(reordered);
      setError(null);
      try {
        const resp = await fetch(`/api/admin/${entityType}/${entityId}/images`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ srcs: reordered.map((i) => i.src) }),
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          setError(data.error || "Reorder failed");
          updateImages(images);
        } else {
          const data = await resp.json();
          updateImages(data.images);
        }
      } catch (e) {
        setError((e as Error).message);
        updateImages(images);
      }
    },
    [images, entityType, entityId, updateImages],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      for (const file of Array.from(e.dataTransfer.files)) {
        void uploadFile(file);
      }
    },
    [uploadFile],
  );

  const onFilePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      for (const file of Array.from(e.target.files || [])) {
        void uploadFile(file);
      }
      e.target.value = "";
    },
    [uploadFile],
  );

  const editing = editingSrc ? images.find((i) => i.src === editingSrc) : undefined;

  return (
    <div className="space-y-3">
      <details
        open={uploadOpen}
        onToggle={(e) => setUploadOpen(e.currentTarget.open)}
        className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
      >
        <summary className="cursor-pointer text-xs text-zinc-500 dark:text-zinc-400">
          Source for the next uploads
          {!uploadOpen && (uploadProvenance.credit || uploadProvenance.license) && (
            <span className="inline-block max-w-[80%] truncate align-bottom text-zinc-700 dark:text-zinc-200">
              {": "}
              {[uploadProvenance.credit, uploadProvenance.license].filter(Boolean).join(" · ")}
            </span>
          )}
        </summary>
        <div className="mt-2">
          <ProvenanceFields idPrefix="upload" value={uploadProvenance} onChange={setUploadProvenance} />
        </div>
      </details>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onPaste={onPaste}
        tabIndex={0}
        className="rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-sm text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400"
      >
        <p className="mb-2">Drag and drop images here, or paste (Cmd/Ctrl+V)</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg bg-zinc-900 px-3 py-1 text-white text-xs hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            disabled={busy}
          >
            {busy ? "Uploading…" : "Choose file"}
          </button>
          <button
            type="button"
            onClick={readFromClipboard}
            className="rounded-lg border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            disabled={busy}
          >
            Read from clipboard
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={onFilePick}
        />
      </div>

      {error && !editing && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {images.length > 0 && (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={images.map((i) => i.src)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {images.map((img) => (
                <Thumbnail
                  key={img.src}
                  img={img}
                  entityName={entityName}
                  selected={img.src === editingSrc}
                  onDelete={() => void deleteImage(img.src)}
                  onEdit={() => startEditing(img)}
                  editRef={(el) => {
                    if (el) editButtons.current.set(img.src, el);
                    else editButtons.current.delete(img.src);
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {images.length > 0 && !editing && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Drag to reorder. Click a caption to edit that image&apos;s source and licence.
        </p>
      )}

      {editing && (
        <div className="flex gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded sm:h-24 sm:w-24">
            <Image src={editing.src} alt={editing.alt || entityName} fill sizes="96px" className="object-cover" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <h4 className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
              Source of image {images.indexOf(editing) + 1} of {images.length}
            </h4>
            <ProvenanceFields key={editing.src} idPrefix="edit" value={draft} onChange={setDraft} />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void saveProvenance()}
                disabled={saving}
                className="rounded-lg bg-zinc-900 px-3 py-1 text-xs text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {saving ? "Saving…" : "Save source"}
              </button>
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-lg border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
            </div>
          </div>
        </div>
      )}

      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer">Show raw JSON</summary>
        <pre className="mt-2 overflow-auto rounded bg-zinc-100 p-2 dark:bg-zinc-800">
          {JSON.stringify(images, null, 2)}
        </pre>
      </details>
    </div>
  );
}
