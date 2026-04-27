"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { resizeImageBlob } from "@/lib/client-image-resize";

type ImageData = { src: string; alt: string };

interface Props {
  entityType: "cameras" | "lenses";
  entityId: number;
  entityName: string;
  initialImages: ImageData[];
  onChange?: (images: ImageData[]) => void;
}

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
        className="rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-sm text-zinc-500"
      >
        <p className="mb-2">Drag and drop images here</p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg bg-zinc-900 px-3 py-1 text-white text-xs hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          disabled={busy}
        >
          {busy ? "Uploading…" : "Choose file"}
        </button>
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
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {images.map((img) => (
            <div key={img.src} className="relative aspect-square overflow-hidden rounded border border-zinc-200 dark:border-zinc-700">
              <Image src={img.src} alt={img.alt || entityName} fill sizes="100px" className="object-cover" />
            </div>
          ))}
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
