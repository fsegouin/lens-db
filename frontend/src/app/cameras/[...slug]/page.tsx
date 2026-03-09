import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cameras, systems } from "@/db/schema";
import ViewTracker from "@/components/ViewTracker";
import ImageGallery from "@/components/ImageGallery";
import ReportIssueButton from "@/components/ReportIssueButton";
import SpecsTable from "@/components/SpecsTable";
import { getImages } from "@/lib/images";
import { formatDescription } from "@/lib/format-description";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const revalidate = 604800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const fullSlug = slug.join("/");
  const [result] = await db
    .select({ camera: cameras })
    .from(cameras)
    .where(eq(cameras.slug, fullSlug))
    .limit(1);

  return {
    title: result ? `${result.camera.name} | Lens DB` : "Camera Not Found",
  };
}

export default async function CameraDetailPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const fullSlug = slug.join("/");

  const [result] = await db
    .select({ camera: cameras, system: systems })
    .from(cameras)
    .leftJoin(systems, eq(cameras.systemId, systems.id))
    .where(eq(cameras.slug, fullSlug))
    .limit(1);

  if (!result) notFound();

  const { camera, system } = result;
  const specs = (camera.specs ?? {}) as Record<string, string>;

  const imagingRows: [string, string | number | null | undefined][] = [
    ["Type", specs["Type"]],
    ["Model", specs["Model"]],
    ["Film Type", specs["Film type"]],
    ["Imaging Sensor", specs["Imaging sensor"] || specs["Imaging plane"]],
    ["Sensor Size", camera.sensorSize || specs["Maximum format"]],
    ["Megapixels", camera.megapixels ? `${camera.megapixels} MP` : null],
    ["Resolution", camera.resolution],
    ["Crop Factor", specs["Crop factor"]],
    ["Image Stabilization", specs["Sensor-shift image stabilization"]],
  ];

  const bodyRows: [string, string | number | null | undefined][] = [
    ["Speeds", specs["Speeds"]],
    ["Exposure Modes", specs["Exposure modes"]],
    ["Exposure Metering", specs["Exposure metering"]],
    ["Dimensions", specs["Dimensions"]],
    ["Year Introduced", camera.yearIntroduced],
    ["Weight", camera.weightG ? `${camera.weightG}g` : null],
    ["Body Type", camera.bodyType],
  ];

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-8">
        <Link href="/cameras" className="inline-flex h-7 items-center gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] font-medium hover:bg-muted">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to cameras
          </Link>

        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {camera.name}
          </h1>
          {camera.alias && (
            <p className="mt-1 text-lg text-zinc-500 dark:text-zinc-400">
              Also known as: {camera.alias}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {system && <Badge variant="system">{system.name}</Badge>}
            {camera.bodyType && <Badge variant="outline">{camera.bodyType}</Badge>}
            {(camera.viewCount ?? 0) > 0 && (
              <span className="text-sm text-zinc-400">
                {camera.viewCount!.toLocaleString()} views
              </span>
            )}
          </div>
        </div>

        {camera.description && (
          <div className="space-y-3">
            {formatDescription(camera.description).map((paragraph, i) => (
              <p key={i} className="leading-relaxed text-zinc-700 dark:text-zinc-300">
                {paragraph}
              </p>
            ))}
          </div>
        )}

        <ImageGallery
          images={
            getImages(
              "cameras",
              fullSlug,
              (camera.images as Array<{ src: string; alt: string }>) || []
            )
          }
        />

        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
              Imaging
            </h3>
            <SpecsTable
              rows={imagingRows
                .filter(([, value]) => value != null && value !== "")
                .map(([label, value]) => [label, String(value)])}
              entityType="camera"
              entityId={camera.id}
              entityName={camera.name}
              entitySlug={camera.slug}
            />
          </div>

          <Separator />

          <div>
            <h3 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
              Body
            </h3>
            <SpecsTable
              rows={bodyRows
                .filter(([, value]) => value != null && value !== "")
                .map(([label, value]) => [label, String(value)])}
              entityType="camera"
              entityId={camera.id}
              entityName={camera.name}
              entitySlug={camera.slug}
            />
          </div>
        </div>

        {process.env.NODE_ENV === "development" && Object.keys(specs).length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400">
              Raw specs JSON ({Object.keys(specs).length} fields)
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-zinc-50 p-4 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {JSON.stringify(specs, null, 2)}
            </pre>
          </details>
        )}

        {camera.url && (
          <p className="text-xs text-zinc-400">
            Source:{" "}
            <a
              href={camera.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-zinc-600"
            >
              {camera.url}
            </a>
          </p>
        )}

        <ViewTracker type="camera" id={camera.id} />
        <ReportIssueButton
          entityType="camera"
          entityId={camera.id}
          entityName={camera.name}
          entitySlug={camera.slug}
        />
      </div>
    </PageTransition>
  );
}
