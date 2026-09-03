"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { ImageData } from "@/lib/image-types";

const ALLOWED_PREFIXES = ["/images/", "https://pub-452f806914084c1384d3fafe70f6be32.r2.dev/"];

function isAllowedSrc(src: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => src.startsWith(prefix));
}

/**
 * The card behind the photo.
 *
 * For a photo shot on a flat ground the plate is painted the exact colour the
 * ingest sampled from that ground, so the 16px of padding around the image is
 * indistinguishable from the image. Anything approximate shows up as a halo:
 * a studio grey of #d4d5d4 against a bg-zinc-50 plate is 38 levels adrift and
 * frames the photo in a lighter border.
 *
 * The dark theme dims plate and photo together with `brightness` rather than
 * tinting the plate, which would break the match it just achieved.
 */
function plateFor(image: ImageData): { className: string; style?: CSSProperties } {
  if (image.plateColor) {
    return {
      className: "border-zinc-200 dark:border-zinc-300 dark:brightness-[0.9]",
      style: { backgroundColor: image.plateColor },
    };
  }
  return { className: "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900" };
}

/**
 * CC BY and CC BY-SA oblige us to name the author and the licence next to the
 * image, so this renders whenever the ingest captured them.
 */
function Attribution({
  image,
  onOverlay = false,
  className = "",
}: {
  image: ImageData;
  onOverlay?: boolean;
  className?: string;
}) {
  if (!image.credit || !image.license) return null;
  // The lightbox scrim is bg-black/10, which is *light* over a light page, so
  // the credit follows the theme there too. It only carries more weight than
  // the inline version to hold up against the image behind it.
  const tone = onOverlay
    ? "text-zinc-700 dark:text-zinc-200 [&_a:hover]:text-zinc-900 dark:[&_a:hover]:text-white"
    : "text-zinc-600 dark:text-zinc-400 [&_a:hover]:text-zinc-800 dark:[&_a:hover]:text-zinc-200";
  return (
    <p className={`mt-1.5 text-center text-xs ${tone} ${className}`}>
      Photo:{" "}
      {image.sourceUrl ? (
        <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">
          {image.credit}
        </a>
      ) : (
        image.credit
      )}{" "}
      ·{" "}
      {image.licenseUrl ? (
        <a href={image.licenseUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">
          {image.license}
        </a>
      ) : (
        image.license
      )}
    </p>
  );
}

export default function ImageGallery({ images }: { images: ImageData[] }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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

  const leadPlate = plateFor(safeImages[0]);
  const currentPlate = plateFor(safeImages[currentIdx]);

  const lightbox = (
    <Dialog open={lightboxIdx !== null} onOpenChange={(open) => !open && setLightboxIdx(null)}>
      <DialogContent
        className="max-h-[90vh] max-w-[90vw] border-none bg-transparent p-2 shadow-none"
        // The dialog's own close button is suppressed in favour of the larger
        // one below; the previous `[&>button]:hidden` also hid that one, so the
        // lightbox had no visible close control at all.
        showCloseButton={false}
        // Focus lands on Close rather than on the first focusable child, which
        // is now the credit's outbound Wikimedia link. Disabling initial focus
        // instead would leave focus outside the dialog entirely, free to tab
        // into the aria-hidden carousel behind it.
        initialFocus={closeButtonRef}
      >
        <DialogTitle className="sr-only">Image {(lightboxIdx ?? 0) + 1} of {safeImages.length}</DialogTitle>
        <Button
          ref={closeButtonRef}
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
              {/* Inside the fade so the credit changes with the photo it
                  describes, and carrying enough bottom margin to clear the
                  absolutely positioned nav cluster below. */}
              <Attribution
                image={safeImages[lightboxIdx]}
                onOverlay
                className={safeImages.length > 1 ? "mb-14" : ""}
              />
            </motion.div>
          )}
        </AnimatePresence>
        {lightboxIdx !== null && safeImages.length > 1 && (
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
  );

  // Single image - simple display
  if (safeImages.length === 1) {
    return (
      <>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setLightboxIdx(0)}
          className={`group relative mx-auto block aspect-[4/3] w-full max-w-md overflow-hidden rounded-lg border ${leadPlate.className}`}
          style={leadPlate.style}
        >
          <Image
            src={safeImages[0].src}
            alt={safeImages[0].alt || "Image"}
            fill
            priority
            className="object-contain p-4"
            sizes="(max-width: 640px) 100vw, 448px"
          />
        </button>
        <Attribution image={safeImages[0]} />
        {lightbox}
      </>
    );
  }

  // Multiple images - carousel
  return (
    <>
      <div role="group" aria-roledescription="carousel" aria-label="Images" className="mx-auto w-full max-w-md">
        {/* The arrows centre on this wrapper, not on the whole carousel: the
            dots and the credit line below would otherwise drag `top-1/2` down
            past the middle of the photo. */}
        <div className="relative">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setLightboxIdx(currentIdx)}
          className={`group relative block aspect-[4/3] w-full overflow-hidden rounded-lg border ${currentPlate.className}`}
          style={currentPlate.style}
        >
          <AnimatePresence mode="wait" initial={false}>
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
                priority={currentIdx === 0}
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
        </div>

        <div className="mt-2 flex items-center justify-center gap-1.5">
          {safeImages.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-current={i === currentIdx}
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

        <Attribution image={safeImages[currentIdx]} />
      </div>

      {/* Lightbox */}
      {lightbox}
    </>
  );
}
