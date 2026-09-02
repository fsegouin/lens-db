import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import JsonLd from "@/components/JsonLd";
import { getEntityPriceEstimate, getEntityPriceHistory } from "@/lib/prices";
import { formatDescription } from "@/lib/format-description";
import { formatMagnification } from "@/lib/format-magnification";
import { getImages } from "@/lib/images";
import { getLensBySlug, getLensSlugById } from "@/lib/lenses";
import { getLensRelations } from "@/lib/lens-relations";
import { entityMetadata, lensDescription, SITE_URL } from "@/lib/seo";
import { lensJsonLd } from "@/lib/jsonld";
import ViewTracker from "@/components/ViewTracker";
import RatingWidget from "@/components/RatingWidget";
import ImageGallery from "@/components/ImageGallery";
import EditButton from "@/components/EditButton";
import FlagDuplicateButton from "@/components/FlagDuplicateButton";
import SpecsTable from "@/components/SpecsTable";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import PriceCard from "@/components/PriceCard";
import EntitySummaryLine from "@/components/EntitySummaryLine";
import EbayListings from "@/components/EbayListings";

export const revalidate = 604800;

/**
 * Present but empty on purpose: a dynamic segment with no generateStaticParams
 * is rendered on demand and never cached, which is what made every lens page a
 * fresh database + render hit. Returning no params keeps builds short while
 * letting each page be cached by ISR the first time it is requested.
 */
export async function generateStaticParams() {
  return [];
}

const COVERAGE_LABELS: Record<string, string> = {
  "aps-c": "APS-C",
  "full-frame": "Full Frame",
  "micro-four-thirds": "Micro Four Thirds",
  "medium-format": "Medium Format",
};

/** Relative image paths need a host before they can go in metadata or JSON-LD. */
function absoluteImages(images: { src: string }[]): string[] {
  return images.map((img) =>
    img.src.startsWith("http") ? img.src : `${SITE_URL}${img.src}`,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getLensBySlug(slug);

  if (!result) return { title: "Lens Not Found" };

  const { lens, system } = result;
  const relations = await getLensRelations(
    lens.id,
    lens.systemId,
    lens.versionGroupId,
  );
  const mountNames = relations.mounts.length
    ? relations.mounts.map((m) => m.name)
    : system
      ? [system.name]
      : [];

  const images = absoluteImages(
    getImages("lenses", slug, (lens.images as { src: string; alt: string }[]) ?? []),
  );

  return entityMetadata({
    title: `${lens.name} specs, price & compatibility`,
    description: lensDescription(lens, mountNames),
    path: `/lenses/${lens.slug}`,
    images: images.slice(0, 1),
  });
}

export default async function LensDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const result = await getLensBySlug(slug);

  if (!result) notFound();

  const { lens, system } = result;

  // Redirect if this entity was merged into another
  if (lens.mergedIntoId) {
    const targetSlug = await getLensSlugById(lens.mergedIntoId);
    if (targetSlug) permanentRedirect(`/lenses/${targetSlug}`);
  }

  const [priceEstimate, priceHistoryRows, relations] = await Promise.all([
    getEntityPriceEstimate("lens", lens.id),
    getEntityPriceHistory("lens", lens.id),
    getLensRelations(lens.id, lens.systemId, lens.versionGroupId),
  ]);

  const specs = (lens.specs ?? {}) as Record<string, string>;
  const mountFromSpecs =
    specs["Mount"] ??
    specs["Mount and Flange focal distance"] ??
    specs["Mount type"] ??
    null;
  const cleanedMountFromSpecs = mountFromSpecs
    ? mountFromSpecs.split(";")[0].replace(/\[.*?\]/g, "").trim()
    : null;
  const apertureControl =
    specs["Aperture control"] ??
    specs["Aperture Control"] ??
    specs["Aperture ring"] ??
    null;

  const mounts = relations.mounts;
  const mountNames = mounts.length
    ? mounts.map((m) => m.name)
    : system
      ? [system.name]
      : [];
  const images = getImages(
    "lenses",
    slug,
    (lens.images as Array<{ src: string; alt: string }>) || [],
  );
  const leadSentence = lensDescription(lens, mountNames);

  const crumbs = [
    { name: "Lenses", path: "/lenses" },
    ...(lens.brand
      ? [
          {
            name: lens.brand,
            path: `/lenses?brand=${encodeURIComponent(lens.brand)}`,
          },
        ]
      : []),
    { name: lens.name },
  ];

  const opticalRows: [string, string | number | null | undefined][] = [
    [
      "Focal Length",
      lens.focalLengthMin
        ? lens.focalLengthMin === lens.focalLengthMax
          ? `${lens.focalLengthMin}mm`
          : `${lens.focalLengthMin}-${lens.focalLengthMax}mm`
        : null,
    ],
    ["Maximum Aperture", lens.apertureMin ? `f/${lens.apertureMin}` : null],
    [
      "Minimum Aperture",
      lens.apertureMax && lens.apertureMax !== lens.apertureMin
        ? `f/${lens.apertureMax}`
        : null,
    ],
    ["Lens Elements", lens.lensElements],
    ["Lens Groups", lens.lensGroups],
    [
      "Min Focus Distance",
      lens.minFocusDistanceM ? `${lens.minFocusDistanceM}m` : null,
    ],
    [
      "Max Magnification",
      lens.maxMagnification ? formatMagnification(lens.maxMagnification) : null,
    ],
    ["Autofocus", lens.hasAutofocus ? "Yes" : "No"],
    ["Stabilization", lens.hasStabilization ? "Yes" : "No"],
    [
      "35mm Equiv.",
      specs["35mm equivalent focal length"] ??
        specs["35mm equivalent focal length range"] ??
        null,
    ],
    ["Teleconverters", specs["Teleconverters"] ?? null],
  ];

  const physicalRows: [string, string | number | null | undefined][] = [
    ["Mount/System", mountNames.join(", ") || cleanedMountFromSpecs],
    ["Weight", lens.weightG ? `${lens.weightG}g` : null],
    ["Filter Size", lens.filterSizeMm ? `${lens.filterSizeMm}mm` : null],
    ["Aperture Control", apertureControl],
    ["Diaphragm Blades", lens.diaphragmBlades],
    ["Lens Hood", specs["Lens hood"] ?? null],
    ["Year Introduced", lens.yearIntroduced],
    ["Year Discontinued", lens.yearDiscontinued],
  ];

  const priceRange =
    priceEstimate?.priceAverageLow && priceEstimate?.priceAverageHigh
      ? {
          low: Number(priceEstimate.priceAverageLow),
          high: Number(priceEstimate.priceAverageHigh),
          currency: priceEstimate.currency ?? "USD",
        }
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <JsonLd
        data={lensJsonLd(
          {
            name: lens.name,
            slug: lens.slug,
            brand: lens.brand,
            description: leadSentence,
            images: absoluteImages(images),
            focalLengthMin: lens.focalLengthMin,
            focalLengthMax: lens.focalLengthMax,
            apertureMin: lens.apertureMin,
            apertureMax: lens.apertureMax,
            weightG: lens.weightG,
            filterSizeMm: lens.filterSizeMm,
            minFocusDistanceM: lens.minFocusDistanceM,
            lensElements: lens.lensElements,
            lensGroups: lens.lensGroups,
            diaphragmBlades: lens.diaphragmBlades,
            hasAutofocus: lens.hasAutofocus,
            hasStabilization: lens.hasStabilization,
            coverage: lens.coverage ? (COVERAGE_LABELS[lens.coverage] ?? lens.coverage) : null,
            productionStatus: lens.productionStatus,
            yearIntroduced: lens.yearIntroduced,
            averageRating: lens.averageRating,
            ratingCount: lens.ratingCount,
            systemNames: mountNames,
          },
          priceRange,
          crumbs,
        )}
      />

      <Breadcrumb crumbs={crumbs} />

      <div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          {lens.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {lens.brand && (
            <Link href={`/lenses?brand=${encodeURIComponent(lens.brand)}`} className="inline-flex">
              <Badge variant="brand">{lens.brand}</Badge>
            </Link>
          )}
          {lens.versionLabel && (
            <Badge variant="outline">{lens.versionLabel}</Badge>
          )}
          {/* Mount badges link to the mount's own page, not a filtered list. */}
          {mounts.map((m) => (
            <Link key={m.id} href={`/systems/${m.slug}`} className="inline-flex">
              <Badge variant="system">{m.name}</Badge>
            </Link>
          ))}
          {lens.coverage && (
            <Link href={`/lenses?coverage=${encodeURIComponent(lens.coverage)}`} className="inline-flex">
              <Badge variant="outline">
                {COVERAGE_LABELS[lens.coverage] ?? lens.coverage}
              </Badge>
            </Link>
          )}
          {lens.lensType && (
            <Link href={`/lenses?lensType=${encodeURIComponent(lens.lensType)}`} className="inline-flex">
              <Badge variant="lensType">{lens.lensType}</Badge>
            </Link>
          )}
          {lens.era && (
            <Link href={`/lenses?era=${encodeURIComponent(lens.era)}`} className="inline-flex">
              <Badge variant="era">{lens.era}</Badge>
            </Link>
          )}
          {lens.productionStatus && (
            <Link
              href={`/lenses?productionStatus=${encodeURIComponent(lens.productionStatus)}`}
              className="inline-flex"
            >
              <Badge variant="status">{lens.productionStatus}</Badge>
            </Link>
          )}
        </div>
      </div>

      <EntitySummaryLine
        priceRange={priceRange}
        medianPrice={priceEstimate?.medianPrice ?? null}
        averageRating={lens.averageRating}
        ratingCount={lens.ratingCount}
        saleCount={priceHistoryRows.length}
      />

      {/* The one-sentence definition: what this thing is. */}
      <p className="text-lg leading-relaxed text-zinc-700 dark:text-zinc-300">
        {leadSentence}
      </p>

      <ImageGallery
        images={images.map((img) => ({
          ...img,
          alt: img.alt || lens.name,
        }))}
      />

      {lens.description && (
        <div className="space-y-3">
          {formatDescription(lens.description).map((paragraph, i) => (
            <p key={i} className="leading-relaxed text-zinc-700 dark:text-zinc-300">
              {paragraph}
            </p>
          ))}
        </div>
      )}

      <PriceCard estimate={priceEstimate ?? null} history={priceHistoryRows} />

      <EbayListings query={lens.name} entityType="lens" entitySlug={lens.slug} />

      <div>
        <h2 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Rate this lens
        </h2>
        <RatingWidget
          lensId={lens.id}
          initialAverage={lens.averageRating}
          initialCount={lens.ratingCount ?? 0}
        />
      </div>

      <div className="space-y-5">
        <div>
          <h2 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            Optical
          </h2>
          <SpecsTable
            rows={opticalRows
              .filter(([, value]) => value != null && value !== "")
              .map(([label, value]) => [label, String(value)])}
          />
        </div>

        <Separator />

        <div>
          <h2 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            Physical
          </h2>
          <SpecsTable
            rows={physicalRows
              .filter(([, value]) => value != null && value !== "")
              .map(([label, value]) => [label, String(value)])}
          />
        </div>
      </div>

      {relations.versions.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            Other Versions
          </h2>
          <ul className="space-y-1">
            {relations.versions.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/lenses/${v.slug}`}
                  className="text-sm text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                >
                  {v.name}
                </Link>
                <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {[
                    v.versionLabel &&
                    v.versionLabel !== lens.versionLabel &&
                    !v.name.includes(v.versionLabel)
                      ? v.versionLabel
                      : null,
                    v.yearIntroduced,
                    v.weightG ? `${v.weightG}g` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {relations.cameras.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            Fits these cameras
          </h2>
          <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
            {relations.cameraCount.toLocaleString()} bodies in the database take
            the {mountNames.join(" / ") || "same"} mount natively
            {relations.cameraCount > relations.cameras.length
              ? ". The most recent are listed here."
              : "."}
          </p>
          <ul className="flex flex-wrap gap-2">
            {relations.cameras.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/cameras/${c.slug}`}
                  className="inline-flex items-center rounded-lg border border-zinc-200 px-2.5 py-1 text-sm text-zinc-700 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600"
                >
                  {c.name}
                  {c.yearIntroduced && (
                    <span className="ml-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {c.yearIntroduced}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {mounts.length > 0 && (
            <p className="mt-3 text-sm">
              <Link
                href={`/systems/${mounts[0].slug}`}
                className="text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                See every {mounts[0].name} lens and body →
              </Link>
            </p>
          )}
        </div>
      )}

      {(relations.series.length > 0 || relations.collections.length > 0) && (
        <div>
          <h2 className="mb-2 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            Part of
          </h2>
          <ul className="flex flex-wrap gap-2">
            {relations.series.map((s) => (
              <li key={`series-${s.slug}`}>
                <Link href={`/lenses/series/${s.slug}`} className="inline-flex">
                  <Badge variant="series">{s.name}</Badge>
                </Link>
              </li>
            ))}
            {relations.collections.map((c) => (
              <li key={`collection-${c.slug}`}>
                <Link href={`/collections/${c.slug}`} className="inline-flex">
                  <Badge variant="outline">{c.name}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href={`/compare?type=lens&item1=${encodeURIComponent(lens.slug)}`}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-4 font-medium transition-colors hover:bg-muted"
        >
          Compare with another lens
        </Link>
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

      <Separator />

      <div className="space-y-3">
        {lens.url && /^https?:\/\//i.test(lens.url) && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Source:{" "}
            <a
              href={lens.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              {lens.url}
            </a>
          </p>
        )}

        <div className="flex items-center justify-between">
          <EditButton
            entityType="lens"
            entityId={lens.id}
            currentValues={{
              name: lens.name,
              url: lens.url,
              brand: lens.brand,
              description: lens.description,
              systemId: lens.systemId,
              lensType: lens.lensType,
              era: lens.era,
              productionStatus: lens.productionStatus,
              focalLengthMin: lens.focalLengthMin,
              focalLengthMax: lens.focalLengthMax,
              apertureMin: lens.apertureMin,
              apertureMax: lens.apertureMax,
              weightG: lens.weightG,
              filterSizeMm: lens.filterSizeMm,
              minFocusDistanceM: lens.minFocusDistanceM,
              maxMagnification: lens.maxMagnification,
              lensElements: lens.lensElements,
              lensGroups: lens.lensGroups,
              diaphragmBlades: lens.diaphragmBlades,
              yearIntroduced: lens.yearIntroduced,
              yearDiscontinued: lens.yearDiscontinued,
              hasAutofocus: lens.hasAutofocus,
              hasStabilization: lens.hasStabilization,
              isZoom: lens.isZoom,
              isMacro: lens.isMacro,
              isPrime: lens.isPrime,
            }}
            fields={[
              { name: "name", label: "Name", type: "text" },
              { name: "brand", label: "Brand", type: "text" },
              { name: "description", label: "Description", type: "textarea" },
              { name: "systemId", label: "Mount System", type: "select", optionsSource: "systems" },
              { name: "lensType", label: "Lens Type", type: "text" },
              { name: "era", label: "Era", type: "text" },
              { name: "productionStatus", label: "Production Status", type: "text" },
              { name: "focalLengthMin", label: "Focal Length Min (mm)", type: "number" },
              { name: "focalLengthMax", label: "Focal Length Max (mm)", type: "number" },
              { name: "apertureMin", label: "Max Aperture (f/)", type: "number" },
              { name: "apertureMax", label: "Min Aperture (f/)", type: "number" },
              { name: "weightG", label: "Weight (g)", type: "number" },
              { name: "filterSizeMm", label: "Filter Size (mm)", type: "number" },
              { name: "minFocusDistanceM", label: "Min Focus Distance (m)", type: "number" },
              { name: "maxMagnification", label: "Max Magnification", type: "number" },
              { name: "lensElements", label: "Lens Elements", type: "number" },
              { name: "lensGroups", label: "Lens Groups", type: "number" },
              { name: "diaphragmBlades", label: "Diaphragm Blades", type: "number" },
              { name: "yearIntroduced", label: "Year Introduced", type: "number" },
              { name: "yearDiscontinued", label: "Year Discontinued", type: "number" },
              { name: "hasAutofocus", label: "Has Autofocus", type: "boolean" },
              { name: "hasStabilization", label: "Has Stabilization", type: "boolean" },
              { name: "isZoom", label: "Zoom", type: "boolean" },
              { name: "isMacro", label: "Macro", type: "boolean" },
              { name: "isPrime", label: "Prime", type: "boolean" },
              { name: "url", label: "Source URL", type: "text" },
            ]}
          />
          <div className="flex items-center gap-2">
            <FlagDuplicateButton
              entityType="lens"
              entityId={lens.id}
              entityName={lens.name}
            />
          </div>
        </div>
      </div>

      <ViewTracker type="lens" id={lens.id} />
    </div>
  );
}
