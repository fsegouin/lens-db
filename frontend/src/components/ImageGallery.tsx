"use client";

import { useState } from "react";
import Image from "next/image";

type ImageData = {
  src: string;
  alt: string;
};

const ALLOWED_PREFIXES = ["/images/", "https://web.archive.org/"];

function isAllowedSrc(src: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => src.startsWith(prefix));
}

export default function ImageGallery({ images }: { images: ImageData[] }) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const safeImages = images.filter((img) => isAllowedSrc(img.src));

  if (safeImages.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {safeImages.map((img, i) => (
          <button
            key={img.src}
            onClick={() => setLightboxIdx(i)}
            className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <Image
              src={img.src}
              alt={img.alt || "Lens image"}
              fill
              className="object-contain transition-transform group-hover:scale-105"
              loading="lazy"
              sizes="(max-width: 640px) 50vw, 33vw"
            />
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxIdx(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <Image
              src={safeImages[lightboxIdx].src}
              alt={safeImages[lightboxIdx].alt || "Lens image"}
              width={1200}
              height={900}
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
              sizes="90vw"
            />
            <button
              onClick={() => setLightboxIdx(null)}
              className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-900 shadow-lg hover:bg-zinc-100"
            >
              x
            </button>
            {safeImages.length > 1 && (
              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
                <button
                  onClick={() => setLightboxIdx((lightboxIdx - 1 + safeImages.length) % safeImages.length)}
                  className="rounded-full bg-white/80 px-3 py-1 text-sm text-zinc-900 hover:bg-white"
                >
                  Prev
                </button>
                <span className="rounded-full bg-white/80 px-3 py-1 text-sm text-zinc-900">
                  {lightboxIdx + 1} / {safeImages.length}
                </span>
                <button
                  onClick={() => setLightboxIdx((lightboxIdx + 1) % safeImages.length)}
                  className="rounded-full bg-white/80 px-3 py-1 text-sm text-zinc-900 hover:bg-white"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
