"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

type ImageData = {
  src: string;
  alt: string;
};

const ALLOWED_PREFIXES = ["/images/", "https://pub-452f806914084c1384d3fafe70f6be32.r2.dev/"];

function isAllowedSrc(src: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => src.startsWith(prefix));
}

export default function ImageGallery({ images }: { images: ImageData[] }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const safeImages = images.filter((img) => isAllowedSrc(img.src));

  const goNext = useCallback(() => {
    setCurrentIdx((prev) => (prev + 1) % safeImages.length);
  }, [safeImages.length]);

  const goPrev = useCallback(() => {
    setCurrentIdx((prev) => (prev - 1 + safeImages.length) % safeImages.length);
  }, [safeImages.length]);

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

  // Single image - simple display
  if (safeImages.length === 1) {
    return (
      <button
        onClick={() => setLightboxIdx(0)}
        className="group relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <Image
          src={safeImages[0].src}
          alt={safeImages[0].alt || "Image"}
          fill
          className="object-contain p-4"
          sizes="(max-width: 640px) 100vw, 448px"
        />
      </button>
    );
  }

  // Multiple images - carousel
  return (
    <>
      <div className="relative mx-auto w-full max-w-md">
        <button
          onClick={() => setLightboxIdx(currentIdx)}
          className="group relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIdx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0"
            >
              <Image
                src={safeImages[currentIdx].src}
                alt={safeImages[currentIdx].alt || "Image"}
                fill
                className="object-contain p-4"
                sizes="(max-width: 640px) 100vw, 448px"
              />
            </motion.div>
          </AnimatePresence>
        </button>

        <Button
          variant="secondary"
          size="icon"
          className="absolute left-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full opacity-70 hover:opacity-100"
          onClick={goPrev}
          aria-label="Previous image"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full opacity-70 hover:opacity-100"
          onClick={goNext}
          aria-label="Next image"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div className="mt-2 flex items-center justify-center gap-1.5">
          {safeImages.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIdx(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === currentIdx
                  ? "w-4 bg-zinc-800 dark:bg-zinc-200"
                  : "w-1.5 bg-zinc-300 dark:bg-zinc-600 hover:bg-zinc-400 dark:hover:bg-zinc-500"
              }`}
              aria-label={`Go to image ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Lightbox */}
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
          {lightboxIdx !== null && (
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
