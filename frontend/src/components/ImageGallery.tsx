"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

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

  useEffect(() => {
    if (lightboxIdx === null) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setLightboxIdx((prev) => prev !== null ? (prev - 1 + safeImages.length) % safeImages.length : null);
      if (e.key === "ArrowRight") setLightboxIdx((prev) => prev !== null ? (prev + 1) % safeImages.length : null);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [lightboxIdx, safeImages.length]);

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
              className="object-contain transition-transform duration-200 group-hover:scale-105"
              loading="lazy"
              sizes="(max-width: 640px) 50vw, 33vw"
            />
          </button>
        ))}
      </div>

      <Dialog open={lightboxIdx !== null} onOpenChange={(open) => !open && setLightboxIdx(null)}>
        <DialogContent className="max-h-[90vh] max-w-[90vw] border-none bg-transparent p-2 shadow-none [&>button]:hidden">
          <DialogTitle className="sr-only">Image {(lightboxIdx ?? 0) + 1} of {safeImages.length}</DialogTitle>
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-2 top-2 z-10 h-11 w-11 rounded-full"
            onClick={() => setLightboxIdx(null)}
            aria-label="Close gallery"
          >
            <X className="h-5 w-5" />
          </Button>
          <AnimatePresence mode="wait">
            {lightboxIdx !== null && (
              <motion.div
                key={lightboxIdx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Image
                  src={safeImages[lightboxIdx].src}
                  alt={safeImages[lightboxIdx].alt || "Image"}
                  width={1200}
                  height={900}
                  className="max-h-[85vh] max-w-full rounded-lg object-contain"
                  sizes="90vw"
                />
              </motion.div>
            )}
          </AnimatePresence>
          {safeImages.length > 1 && lightboxIdx !== null && (
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
              <Button variant="secondary" size="icon" className="h-11 w-11 rounded-full" onClick={() => setLightboxIdx((lightboxIdx - 1 + safeImages.length) % safeImages.length)} aria-label="Previous image">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <span className="flex items-center rounded-full bg-secondary px-3 py-1 text-sm">{lightboxIdx + 1} / {safeImages.length}</span>
              <Button variant="secondary" size="icon" className="h-11 w-11 rounded-full" onClick={() => setLightboxIdx((lightboxIdx + 1) % safeImages.length)} aria-label="Next image">
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
