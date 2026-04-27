"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { resizeImageBlob } from "@/lib/client-image-resize";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type ImageData = { src: string; alt: string };

interface Props {
  entityType: "cameras" | "lenses";
  entityId: number;
  entityName: string;
  initialImages: ImageData[];
  onChange?: (images: ImageData[]) => void;
}

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function Thumbnail({
  img,
  entityName,
  onDelete,
}: {
  img: ImageData;
  entityName: string;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: img.src });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="relative aspect-square overflow-hidden rounded border border-zinc-200 dark:border-zinc-700">
      <div {...attributes} {...listeners} className="absolute inset-0 cursor-grab active:cursor-grabbing">
        <Image src={img.src} alt={img.alt || entityName} fill sizes="100px" className="object-cover" />
      </div>
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

  const updateImages = useCallback(
    (next: ImageData[]) => {
      setImages(next);
      onChange?.(next);
    },
    [onChange],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (!ALLOWED_TYPES.has(file.type)) {
        setError(`Unsupported type ${file.type}`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("File too large (max 10 MB)");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const resized = await resizeImageBlob(file);
        const formData = new FormData();
        formData.append("file", resized, "upload.webp");
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
    },
    [entityType, entityId, updateImages],
  );

  const uploadUrl = useCallback(
    async (url: string) => {
      setBusy(true);
      setError(null);
      try {
        const resp = await fetch(`/api/admin/${entityType}/${entityId}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
        const data = await resp.json();
        updateImages(data.images);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [entityType, entityId, updateImages],
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

  return (
    <div className="space-y-3">
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

      {error && (
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
                  onDelete={() => void deleteImage(img.src)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
