import Link from "next/link";
import { Camera } from "lucide-react";
import ImageGallery from "@/components/ImageGallery";

type Lens = {
  name: string;
  focalLengthMin: number | null;
  focalLengthMax: number | null;
  apertureMin: number | null;
};

/**
 * Five lens records in six have no photograph. The absence is stated plainly
 * rather than filled with a drawing: anything we could generate from the spec
 * columns would be an invention that looks like an optical diagram, which is
 * exactly the kind of false authority a reference cannot afford.
 */
export default function LensMedia({
  lens,
  images,
}: {
  lens: Lens;
  images: { src: string; alt: string }[];
}) {
  if (images.length > 0) {
    return (
      <ImageGallery
        images={images.map((img) => ({ ...img, alt: img.alt || lens.name }))}
      />
    );
  }

  const focal =
    lens.focalLengthMin && lens.focalLengthMax && lens.focalLengthMax !== lens.focalLengthMin
      ? `${lens.focalLengthMin}-${lens.focalLengthMax}mm`
      : lens.focalLengthMin
        ? `${lens.focalLengthMin}mm`
        : null;
  const caption = [focal, lens.apertureMin ? `f/${lens.apertureMin}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex max-w-md flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/50 px-6 py-10 text-center">
      <Camera className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      {caption && (
        <p className="font-mono text-sm tabular-nums text-muted-foreground">{caption}</p>
      )}
      <p className="text-sm text-muted-foreground">
        No photograph of this lens yet.{" "}
        <Link href="/submit" className="underline underline-offset-2 hover:text-foreground">
          Contribute one
        </Link>
      </p>
    </div>
  );
}
