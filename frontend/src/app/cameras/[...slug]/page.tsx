import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import BackButton from "@/components/BackButton";
import { db } from "@/db";
import { cameras, systems } from "@/db/schema";
import ViewTracker from "@/components/ViewTracker";
import ImageGallery from "@/components/ImageGallery";
import RatingWidget from "@/components/RatingWidget";
import EditButton from "@/components/EditButton";
import FlagDuplicateButton from "@/components/FlagDuplicateButton";
import SpecsTable from "@/components/SpecsTable";
import { getImages } from "@/lib/images";
import { formatDescription } from "@/lib/format-description";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getCurrentUser } from "@/lib/user-auth";

export const revalidate = 86400;

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
    title: result ? `${result.camera.name} | The Lens DB` : "Camera Not Found",
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

  // Redirect if this entity was merged into another
  if (camera.mergedIntoId) {
    const [target] = await db
      .select({ slug: cameras.slug })
      .from(cameras)
      .where(eq(cameras.id, camera.mergedIntoId))
      .limit(1);
    if (target) redirect(`/cameras/${target.slug}`);
  }

  const currentUser = await getCurrentUser();
  const specs = (camera.specs ?? {}) as Record<string, string>;

  const imagingRows: [string, string | number | null | undefined][] = [
    ["Type", specs["Type"]],
    ["Model", specs["Model"]],
    ["Film Type", specs["Film type"]],
    ["Imaging Sensor", camera.sensorType || specs["Imaging sensor"] || specs["Imaging plane"]],
    ["Sensor Size", camera.sensorSize || specs["Maximum format"]],
    ["Megapixels", camera.megapixels ? `${camera.megapixels} MP` : specs["Effective pixels"]],
    ["Resolution", camera.resolution || specs["Max resolution"]],
    ["Crop Factor", specs["Crop factor"]],
    ["ISO", specs["ISO"]],
    ["Image Stabilization", specs["Sensor-shift image stabilization"]],
  ];

  const bodyRows: [string, string | number | null | undefined][] = [
    ["Lens Mount", specs["Lens mount"]],
    ["Shutter Speeds", specs["Speeds"]],
    ["Exposure Modes", specs["Exposure modes"]],
    ["Exposure Metering", specs["Exposure metering"]],
    ["Screen", specs["Screen size"] ? `${specs["Screen size"]} (${specs["Screen dots"] || ""})`.replace(/ \(\)$/, "") : null],
    ["Articulated LCD", specs["Articulated LCD"]],
    ["Storage", specs["Storage types"]],
    ["USB", specs["USB"]],
    ["Dimensions", specs["Dimensions"]],
    ["Year Introduced", camera.yearIntroduced],
    ["Weight", camera.weightG ? `${camera.weightG}g` : specs["Weight"]],
    ["Format", specs["Format"]],
    ["GPS", specs["GPS"] && specs["GPS"] !== "None" ? specs["GPS"] : null],
  ];

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-8">
        <BackButton fallbackHref="/cameras" label="Back to cameras" />

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

        {!camera.verified && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
            This entry was submitted by the community and hasn&apos;t been verified yet. Information may be incomplete or inaccurate.
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

        {camera.description && (
          <div className="space-y-3">
            {formatDescription(camera.description).map((paragraph, i) => (
              <p key={i} className="leading-relaxed text-zinc-700 dark:text-zinc-300">
                {paragraph}
              </p>
            ))}
          </div>
        )}

        <RatingWidget cameraId={camera.id} />

        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
              Sensor &amp; Imaging
            </h3>
            <SpecsTable
              rows={imagingRows
                .filter(([, value]) => value != null && value !== "")
                .map(([label, value]) => [label, String(value)])}
            />
          </div>

          <Separator />

          <div>
            <h3 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
              Body &amp; Features
            </h3>
            <SpecsTable
              rows={bodyRows
                .filter(([, value]) => value != null && value !== "")
                .map(([label, value]) => [label, String(value)])}
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

        <div className="flex items-center justify-between">
          <EditButton
            entityType="camera"
            entityId={camera.id}
            entitySlug={camera.slug}
            isLoggedIn={!!currentUser}
            currentValues={{
              name: camera.name,
              url: camera.url,
              description: camera.description,
              alias: camera.alias,
              sensorType: camera.sensorType,
              sensorSize: camera.sensorSize,
              megapixels: camera.megapixels,
              resolution: camera.resolution,
              yearIntroduced: camera.yearIntroduced,
              bodyType: camera.bodyType,
              weightG: camera.weightG,
            }}
            fields={[
              { name: "name", label: "Name", type: "text" },
              { name: "alias", label: "Also known as", type: "text" },
              { name: "description", label: "Description", type: "textarea" },
              { name: "sensorType", label: "Sensor Type", type: "text" },
              { name: "sensorSize", label: "Sensor Size", type: "text" },
              { name: "megapixels", label: "Megapixels", type: "number" },
              { name: "resolution", label: "Resolution", type: "text" },
              { name: "yearIntroduced", label: "Year Introduced", type: "number" },
              { name: "bodyType", label: "Body Type", type: "text" },
              { name: "weightG", label: "Weight (g)", type: "number" },
              { name: "url", label: "Source URL", type: "text" },
            ]}
          />
          <div className="flex items-center gap-2">
            <FlagDuplicateButton
              entityType="camera"
              entityId={camera.id}
              entityName={camera.name}
              isLoggedIn={!!currentUser}
            />
          </div>
        </div>

        <ViewTracker type="camera" id={camera.id} />
      </div>
    </PageTransition>
  );
}
