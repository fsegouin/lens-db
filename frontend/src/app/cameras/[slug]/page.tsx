import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import { getEntityPriceEstimate, getEntityPriceHistory } from "@/lib/prices";
import { getCameraBySlug, getCameraSlugById } from "@/lib/cameras";
import { getCameraRelations } from "@/lib/camera-relations";
import { cameraDescription, cameraLead, entityMetadata, SITE_URL } from "@/lib/seo";
import { cameraJsonLd } from "@/lib/jsonld";
import { getPriceDisplay } from "@/lib/price-display";
import ViewTracker from "@/components/ViewTracker";
import ImageGallery from "@/components/ImageGallery";
import RatingWidget from "@/components/RatingWidget";
import EditButton from "@/components/EditButton";
import FlagDuplicateButton from "@/components/FlagDuplicateButton";
import SpecsTable from "@/components/SpecsTable";
import PriceCard from "@/components/PriceCard";
import EntitySummaryLine from "@/components/EntitySummaryLine";
import EbayListings from "@/components/EbayListings";
import Infobox, { type Fact } from "@/components/Infobox";
import KitButton from "@/components/KitButton";
import ProvenanceLine from "@/components/ProvenanceLine";
import { getProvenance } from "@/lib/provenance";
import { getImages } from "@/lib/images";
import { specValue } from "@/lib/spec-value";
import { formatDescription } from "@/lib/format-description";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const revalidate = 604800;

// See the note in lenses/[slug]/page.tsx: this is what makes the route
// cacheable by ISR instead of re-rendering on every request.
export async function generateStaticParams() {
  return [];
}

function absoluteImages(images: { src: string }[]): string[] {
  return images.map((img) =>
    img.src.startsWith("http") ? img.src : `${SITE_URL}${img.src}`,
  );
}

/**
 * `body_type` was imported from the same field as the shutter type for 456
 * records, so values like "Focal-plane" appear where a body style belongs.
 * Those are dropped rather than shown as if they described the body.
 */
function bodyStyle(value: string | null): string | null {
  if (!value) return null;
  return /focal-plane|leaf shutter/i.test(value) ? null : value;
}

/** Cameras have no brand column; the name's first token is the best proxy. */
function cameraBrand(name: string, manufacturer: string | null): string | null {
  if (manufacturer && name.toLowerCase().startsWith(manufacturer.toLowerCase())) {
    return manufacturer;
  }
  return name.split(" ")[0] || null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getCameraBySlug(slug);

  if (!result) return { title: "Camera Not Found" };

  const { camera, system } = result;
  const images = absoluteImages(
    getImages("cameras", slug, (camera.images as { src: string; alt: string }[]) ?? []),
  );

  return entityMetadata({
    title: `${camera.name} specs, price & lenses`,
    description: cameraDescription(camera, system?.name ?? null),
    path: `/cameras/${camera.slug}`,
    images: images.slice(0, 1),
  });
}

export default async function CameraDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const result = await getCameraBySlug(slug);

  if (!result) notFound();

  const { camera, system } = result;

  // Redirect if this entity was merged into another
  if (camera.mergedIntoId) {
    const targetSlug = await getCameraSlugById(camera.mergedIntoId);
    if (targetSlug) permanentRedirect(`/cameras/${targetSlug}`);
  }

  const specs = (camera.specs ?? {}) as Record<string, string>;

  const [priceEstimate, priceHistoryRows, relations, provenance] = await Promise.all([
    getEntityPriceEstimate("camera", camera.id),
    getEntityPriceHistory("camera", camera.id),
    getCameraRelations(camera.systemId),
    getProvenance("camera", camera.id),
  ]);

  const images = getImages(
    "cameras",
    slug,
    (camera.images as Array<{ src: string; alt: string }>) || [],
  );
  const leadSentence = cameraLead(camera, system?.name ?? null);

  const crumbs = [
    { name: "Cameras", path: "/cameras" },
    ...(system ? [{ name: system.name, path: `/systems/${system.slug}` }] : []),
    { name: camera.name },
  ];

  const infoboxFacts: Fact[] = [
    { label: "Mount", value: specValue(system?.name) },
    { label: "Sensor", value: specValue(camera.sensorSize ?? specs["Maximum format"]) },
    {
      label: "Resolution",
      value: camera.megapixels ?? specValue(specs["Effective pixels"]),
      unit: camera.megapixels ? "MP" : undefined,
    },
    { label: "Sensor type", value: specValue(camera.sensorType) },
    { label: "Body", value: bodyStyle(camera.bodyType) },
    { label: "Shutter", value: specValue(camera.shutterType) },
    { label: "Weight", value: camera.weightG, unit: "g" },
    { label: "Introduced", value: camera.yearIntroduced },
  ];

  const imagingRows: [string, string | number | null | undefined][] = [
    ["Shutter type", camera.shutterType || specs["Type"]],
    ["Shutter control", specs["Model"]],
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

  const rail = (
    <div className="space-y-6">
      <Infobox title="Specifications" facts={infoboxFacts} />
      <PriceCard estimate={priceEstimate ?? null} history={priceHistoryRows} />
      <EbayListings query={camera.name} entitySlug={camera.slug} />
      <div>
        <h2 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Rate this camera
        </h2>
        <RatingWidget
          cameraId={camera.id}
          initialAverage={camera.averageRating}
          initialCount={camera.ratingCount ?? 0}
        />
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <JsonLd
        data={cameraJsonLd(
          {
            name: camera.name,
            slug: camera.slug,
            alias: camera.alias,
            description: leadSentence,
            images: absoluteImages(images),
            sensorType: camera.sensorType,
            sensorSize: camera.sensorSize,
            megapixels: camera.megapixels,
            bodyType: camera.bodyType,
            weightG: camera.weightG,
            yearIntroduced: camera.yearIntroduced,
            averageRating: camera.averageRating,
            ratingCount: camera.ratingCount,
            systemName: system?.name ?? null,
            brand: cameraBrand(camera.name, system?.manufacturer ?? null),
          },
          crumbs,
        )}
      />

      <Breadcrumb crumbs={crumbs} />

      <div className="mt-4">
        <h1 className="text-3xl font-bold tracking-tight text-balance">
          {camera.name}
        </h1>
        {camera.alias && (
          <p className="mt-1 text-lg text-muted-foreground">
            Also known as: {camera.alias}
          </p>
        )}
        <div className="mt-2">
          <ProvenanceLine
            entityType="camera"
            entityId={camera.id}
            revisionCount={provenance.revisionCount}
            lastEditedAt={provenance.lastEditedAt}
            saleCount={priceHistoryRows.length}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {system && (
            <Link href={`/systems/${system.slug}`} className="inline-flex">
              <Badge variant="system">{system.name}</Badge>
            </Link>
          )}
          {camera.bodyType && <Badge variant="outline">{camera.bodyType}</Badge>}
        </div>
      </div>

      <div className="mt-5">
        <EntitySummaryLine
          priceRange={getPriceDisplay(priceEstimate)}
          averageRating={camera.averageRating}
          ratingCount={camera.ratingCount}
          saleCount={priceHistoryRows.length}
          trailing={<KitButton entityType="camera" entityId={camera.id} />}
        />
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
        <article className="min-w-0 space-y-8">
          {/* Definition first in reading order, then the rail's numbers. */}
          <p className="text-lg leading-relaxed">{leadSentence}</p>

          <div className="space-y-6 lg:hidden">{rail}</div>

          {images.length > 0 && (
            <ImageGallery
              images={images.map((img) => ({ ...img, alt: img.alt || camera.name }))}
            />
          )}

      {camera.description && (
        <div className="space-y-3">
          {formatDescription(camera.description).map((paragraph, i) => (
            <p key={i} className="leading-relaxed text-zinc-700 dark:text-zinc-300">
              {paragraph}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <h2 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            Sensor &amp; Imaging
          </h2>
          <SpecsTable
            rows={imagingRows
              .map(([label, value]) => [label, specValue(value)] as const)
              .filter(([, value]) => value != null)
              .map(([label, value]) => [label, String(value)])}
          />
        </div>

        <Separator />

        <div>
          <h2 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            Body &amp; Features
          </h2>
          <SpecsTable
            rows={bodyRows
              .map(([label, value]) => [label, specValue(value)] as const)
              .filter(([, value]) => value != null)
              .map(([label, value]) => [label, String(value)])}
          />
        </div>
      </div>

      {relations.lenses.length > 0 && system && (
        <div>
          <h2 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            Lenses that fit
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {relations.lensCount.toLocaleString()} lenses in the database mount
            natively on the {system.name}.
          </p>
          <ul className="flex flex-wrap gap-2">
            {relations.lenses.map((l) => (
              <li key={l.slug}>
                <Link
                  href={`/lenses/${l.slug}`}
                  className="inline-flex items-baseline gap-1.5 rounded-lg border border-border px-2.5 py-1 text-sm transition-colors hover:border-zinc-400 dark:hover:border-zinc-600"
                >
                  {l.name}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            <Link
              href={`/cameras/${camera.slug}/lenses`}
              className="underline underline-offset-2"
            >
              See all {relations.lensCount.toLocaleString()} lenses that fit the{" "}
              {camera.name} →
            </Link>
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href={`/compare?type=camera&item1=${encodeURIComponent(camera.slug)}`}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-4 font-medium transition-colors hover:bg-muted"
        >
          Compare with another camera
        </Link>
      </div>

      {process.env.NODE_ENV === "development" && Object.keys(specs).length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
            Raw specs JSON ({Object.keys(specs).length} fields)
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-zinc-50 p-4 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {JSON.stringify(specs, null, 2)}
          </pre>
        </details>
      )}

      <Separator />

      <div className="space-y-3">

        <div className="flex items-center justify-between">
          <EditButton
            entityType="camera"
            entityId={camera.id}
            currentValues={{
              name: camera.name,
              url: camera.url,
              description: camera.description,
              alias: camera.alias,
              systemId: camera.systemId,
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
              { name: "systemId", label: "Mount System", type: "select", optionsSource: "systems" },
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
            />
          </div>
        </div>
      </div>

      <ViewTracker type="camera" id={camera.id} />
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-6">{rail}</div>
        </aside>
      </div>
    </div>
  );
}
