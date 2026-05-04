import Image from "next/image";

const HATCH = {
  backgroundImage:
    "repeating-linear-gradient(-45deg, transparent 0 4px, color-mix(in oklch, var(--fg) 5%, transparent) 4px 5px)",
};

/**
 * Thumbnail wrapper that renders the first image when available and falls
 * back to a hatched "no image" placeholder otherwise. Sized via className —
 * the container is positioned so next/image fill works.
 */
export function MediaThumb({
  src,
  alt,
  className = "h-11 w-11 rounded",
  sizes = "64px",
  contain = true,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  sizes?: string;
  contain?: boolean;
}) {
  if (!src) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden bg-[var(--surface-sunk)] ${className}`}
        style={HATCH}
        aria-hidden="true"
      />
    );
  }
  return (
    <div className={`relative shrink-0 overflow-hidden ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        className={contain ? "object-contain" : "object-cover"}
        sizes={sizes}
      />
    </div>
  );
}
